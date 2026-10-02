import React, { useState, useCallback, useRef, useEffect } from "react";
import "./App.css";
import SchematicPanel from "./components/SchematicPanel";
import GraphPanel from "./components/GraphPanel";
import ComponentTable from "./components/ComponentTable";
import ExplanationPanel from "./components/ExplanationPanel";
import CircuitJSPanel from "./components/CircuitJSPanel";
import SpecCard from "./components/SpecCard";

import { parsePrompt } from "./utils/circuitParser";
import { makeSpec, SUPPORTED_TYPES } from "./spec/circuitSpec";
import { recalculateFromComponents, formatResistance, formatCapacitance } from "./utils/circuitFormulas";
import { designAndVerify } from "./design/loop";
import { llmReasoningProposer } from "./agents/reasoningAgent";
import { runSpice } from "./sim/spice";
import { parseWithLLM } from "./parse/llmParser";
import { buildBOM, buildBOMPriced } from "./design/bom";
import { cached, makeMouserPriceSource } from "./design/distributorPricing";

// Live pricing source (built once) when a proxy URL is configured; else null ->
// the static catalog is used. The URL is non-secret; the key lives in the proxy.
const BOM_PRICE_SOURCE = process.env.REACT_APP_PRICING_PROXY
  ? cached(makeMouserPriceSource({ baseUrl: process.env.REACT_APP_PRICING_PROXY }))
  : null;
import { runToleranceSweep } from "./design/montecarlo";

// Dev-only: register evaluation hooks (window.__yieldBench / __parserBench / __designBench).
if (process.env.NODE_ENV === "development") {
  import("./eval/yieldBenchmark");
  import("./eval/parserBenchmark");
  import("./eval/designBenchmark");
  import("./eval/reasoningLoop");
}
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

// Static fallback data (for kicadSchematic / kicadNetlist fields)
import rcLowpassStatic from "./circuits/rc_lowpass";
import rcHighpassStatic from "./circuits/rc_highpass";
import voltageDividerStatic from "./circuits/voltage_divider";
import ledLimiterStatic from "./circuits/led_limiter";
import commonEmitterStatic from "./circuits/common_emitter";

const STATIC = {
  rc_lowpass: rcLowpassStatic,
  rc_highpass: rcHighpassStatic,
  voltage_divider: voltageDividerStatic,
  led_limiter: ledLimiterStatic,
  common_emitter: commonEmitterStatic,
};


const INITIAL_MESSAGES = [
  {
    role: "system",
    text: "Hi! Describe a circuit in plain English — 13 types including 2nd-order Sallen-Key filters and multi-stage amplifiers. You can set tolerance and E-series in words too (e.g. \"2% tolerance on E96\"). I design it, then verify it in a real SPICE simulator. Open the Details tab after a run to see the reasoning loop, bill of materials, and Monte-Carlo yield. Try an example:",
  },
];

const EXAMPLES = [
  "Low-pass filter at 1 kHz",
  "Sallen-Key low-pass 2 kHz",
  "High-pass filter 6kHz, 2% tolerance on E96",
  "Two-stage amplifier gain 100",
  "Band-pass 300Hz to 3kHz",
  "Voltage divider 9V to 3.3V",
  "LED resistor for 20mA at 5V",
  "Zener regulator 12V to 5V",
];

const TABS = [
  { id: "schematic", label: "Schematic" },
  { id: "response", label: "Response" },
  { id: "livesim", label: "Live sim" },
  { id: "details", label: "Details" },
];

// ── verification formatting helpers (Phase 2.3) ──────────────────────────────

function fmtTarget(name, v) {
  if (v == null || !isFinite(v)) return "n/a";
  switch (name) {
    case "fc": return v >= 1e3 ? `${(v / 1e3).toFixed(2)} kHz` : `${v.toFixed(1)} Hz`;
    case "Vout": return `${v.toFixed(2)} V`;
    case "I": return `${(v * 1000).toFixed(2)} mA`;
    case "Av": return `${v.toFixed(2)}×`;
    default: return `${v}`;
  }
}

function verificationLine(res) {
  if (!res.verifiable) {
    return "Analytical design. Live SPICE verification for this circuit is on the roadmap.";
  }
  const errStr = res.errorPct == null ? "n/a" : `${(res.errorPct * 100).toFixed(1)}%`;
  const iters = `${res.iterations} iteration${res.iterations === 1 ? "" : "s"}`;
  const es = res.eSeries || "E24";
  if (res.converged) {
    return `Verified in SPICE. ${errStr} error (${es}, ${iters}).`;
  }
  const tolStr = res.tolerance == null ? "" : `${(res.tolerance * 100).toFixed(0)}% tolerance not met in `;
  return `Best effort. ${errStr} error; ${tolStr}${iters}.`;
}

function verificationBadge(res) {
  if (!res.verifiable) return res.circuit?.simulationBadge || "Analytical";
  const errStr = res.errorPct == null ? "n/a" : `${(res.errorPct * 100).toFixed(1)}%`;
  return res.converged
    ? `SPICE-verified: ${fmtTarget(res.targetName, res.measured)} (error ${errStr})`
    : `Best effort: error ${errStr}`;
}

// Rebuild the processing log so the analytical "pending" tail is replaced by the
// real ngspice-wasm verification summary. Prefixes are stripped at render.
function buildLogSteps(res) {
  const src = res.circuit?.processingSteps ? [...res.circuit.processingSteps] : [];
  const base = src.filter(
    (s) =>
      !s.includes("SPICE verification pending") &&
      !s.includes("Analytical result") &&
      !s.includes("Values computed from design equations")
  );
  base.push("Snapped every part to the nearest E-series (buyable) value");
  if (res.verifiable) {
    base.push(`Ran ngspice-wasm and refined over ${res.iterations} iteration${res.iterations === 1 ? "" : "s"}`);
    base.push(verificationLine(res));
  } else {
    base.push("SPICE verification is not available for this circuit yet");
  }
  return base;
}

export default function App() {
  const [messages, setMessages]       = useState(INITIAL_MESSAGES);
  const [selectedCircuit, setSelectedCircuit] = useState(null);
  const [loading, setLoading]         = useState(false);
  const [logSteps, setLogSteps]       = useState([]);
  const [inputText, setInputText]     = useState("");
  const [parseError, setParseError]   = useState("");
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [pendingSpec, setPendingSpec] = useState(null);   // CircuitSpec awaiting confirm
  const [specSource, setSpecSource] = useState("fast");   // "fast" | "llm" | "manual"
  const [specLowConf, setSpecLowConf] = useState(false);  // low-confidence regex fallback
  const [resolving, setResolving] = useState(false);      // LLM call in flight
  const [llmInLoop, setLlmInLoop] = useState(false);      // AI-in-the-loop refinement

  const [activeTab,          setActiveTab]          = useState("schematic");
  const [expandComponents,   setExpandComponents]   = useState(true);
  const [expandExplanation,  setExpandExplanation]  = useState(false);

  const inputRef = useRef(null);

  // Core: deterministic design → snap → REAL ngspice-wasm verify → refine loop.
  const runDesign = useCallback(async (spec, promptText) => {
    if (loading) return;
    setParseError("");
    setLoading(true);
    setActiveTab("schematic");

    setMessages(prev => [...prev, { role: "user", text: promptText }]);
    setLogSteps([
      "Designing from the governing equations",
      "Snapping to E-series (buyable) values",
      "Running the ngspice-wasm simulation",
    ]);

    let res;
    try {
      // Stream each agent's status into the running-state log.
      const live = [];
      const useLlm = llmInLoop && !!process.env.REACT_APP_ANTHROPIC_KEY;
      res = await designAndVerify(spec, {
        runSpice,
        strategy: "reasoning",
        propose: useLlm ? llmReasoningProposer() : undefined,
        onStatus: (m) => { live.push(m); setLogSteps(live.slice(-3)); },
      });
    } catch (e) {
      setLoading(false);
      setMessages(prev => [...prev, { role: "system", text: `Simulation failed: ${e.message}` }]);
      return;
    }

    if (!res || !res.circuit) {
      setLoading(false);
      setMessages(prev => [...prev, { role: "system", text: "Could not design this circuit." }]);
      return;
    }

    const staticData = STATIC[spec.type] || {};
    const merged = {
      ...res.circuit,
      kicadSchematic: staticData.kicadSchematic,
      kicadNetlist:   staticData.kicadNetlist,
      simulationBadge: verificationBadge(res),
      verification: res,
    };

    setLogSteps(buildLogSteps(res));
    setMessages(prev => [
      ...prev,
      { role: "system", text: `Circuit identified: ${res.circuit.name}. ${verificationLine(res)}` },
    ]);
    setSelectedCircuit(merged);
    setLoading(false);
  }, [loading, llmInLoop]);

  // Parser routing with graceful degradation, then always land on the confirm card:
  //   1. regex parsePrompt first (instant, offline)
  //   2. confidence >= 0.9 → use it (fast path, no API call)
  //   3. else, if a key is present → parseWithLLM
  //   4. LLM missing/errors → fall back to the regex result even at low confidence
  const openSpecFromText = useCallback(async (text) => {
    if (!text || loading || resolving) return;
    setParseError("");
    setShowTypePicker(false);

    const fast = parsePrompt(text);
    if (fast.confidence >= 0.9) {
      setSpecSource("fast"); setSpecLowConf(false); setPendingSpec(fast);
      return;
    }

    if (process.env.REACT_APP_ANTHROPIC_KEY) {
      setResolving(true);
      try {
        const spec = await parseWithLLM(text);
        setResolving(false);
        setSpecSource("llm"); setSpecLowConf(false); setPendingSpec(spec);
        return;
      } catch {
        setResolving(false); // fall through to regex fallback
      }
    }

    if (fast.confidence === 0 || !fast.type) {
      setParseError("Couldn't identify a circuit. Try \"low-pass filter 2 kHz\", or pick a type below.");
      setShowTypePicker(true); setPendingSpec(null);
      return;
    }
    // Low-confidence regex fallback — the confirm card flags it.
    setSpecSource("fast"); setSpecLowConf(true); setPendingSpec(fast);
  }, [loading, resolving]);

  const handleTextSubmit = useCallback(() => {
    openSpecFromText(inputText.trim());
  }, [inputText, openSpecFromText]);

  // User picked a type from the fallback picker → open an empty spec card.
  const handlePickType = useCallback((type) => {
    setParseError("");
    setShowTypePicker(false);
    setSpecSource("manual"); setSpecLowConf(false);
    setPendingSpec(makeSpec({ type, targets: {}, confidence: 1, assumed: [] }));
  }, []);

  // Confirm card actions
  const handleRunSpec = useCallback(() => {
    if (!pendingSpec) return;
    const text = inputText.trim() || pendingSpec.type;
    setInputText("");
    const spec = pendingSpec;
    setPendingSpec(null);
    runDesign(spec, text);
  }, [pendingSpec, inputText, runDesign]);

  const handleCancelSpec = useCallback(() => {
    setPendingSpec(null);
  }, []);

  // Example chip → same routing as typing.
  const handleExample = useCallback((text) => {
    setInputText(text);
    openSpecFromText(text);
    inputRef.current?.focus();
  }, [openSpecFromText]);


  // Component value edit → live recalculate
  const handleComponentChange = useCallback((ref, newRawValue) => {
    if (!selectedCircuit) return;
    setSelectedCircuit(prev => {
      const updatedComponents = prev.components.map(c => {
        if (c.ref !== ref) return c;
        return { ...c, rawValue: newRawValue };
      });
      const recalculated = recalculateFromComponents(prev.id, updatedComponents, prev.derivedParams);
      if (recalculated) {
        return {
          ...recalculated,
          kicadSchematic: prev.kicadSchematic,
          kicadNetlist:   prev.kicadNetlist,
        };
      }
      // If recalc not supported for this circuit, just update display
      return { ...prev, components: updatedComponents };
    });
  }, [selectedCircuit]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg-primary)", overflow: "hidden" }}>
      <Header verification={selectedCircuit?.verification} />

      <div style={{ display: "flex", flex: 1, overflow: "hidden", padding: "16px", gap: "16px", minHeight: 0 }}>

        {/* Sidebar: conversation + input */}
        <aside style={{
          width: "340px", flexShrink: 0, display: "flex", flexDirection: "column",
          background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
          overflow: "hidden", boxShadow: "var(--shadow-sm)",
        }}>
          <div style={{ flex: "1 1 0", overflowY: "auto", padding: "18px", display: "flex", flexDirection: "column", gap: "14px", minHeight: 0 }}>
            <ChatMessages messages={messages} />
          </div>

          <div style={{ flex: "0 1 auto", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px", minHeight: 0, padding: "14px 14px 16px", borderTop: "1px solid var(--border)" }}>
            <label style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: 600 }}>
              Describe a circuit
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                ref={inputRef}
                value={inputText}
                onChange={e => { setInputText(e.target.value); setParseError(""); }}
                onKeyDown={e => e.key === "Enter" && handleTextSubmit()}
                placeholder="e.g. low-pass filter at 2 kHz"
                disabled={loading || resolving}
                style={{
                  flex: 1, background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)",
                  padding: "10px 12px", color: "var(--text-primary)", fontSize: "14px", outline: "none",
                  opacity: loading || resolving ? 0.6 : 1,
                }}
                onFocus={e => { e.currentTarget.style.borderColor = "var(--accent-blue)"; e.currentTarget.style.boxShadow = "0 0 0 3px var(--accent-blue-soft)"; }}
                onBlur={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
              />
              <button
                onClick={handleTextSubmit}
                disabled={loading || resolving}
                style={{
                  background: loading || resolving ? "var(--bg-panel-alt)" : "var(--accent-blue)", border: "none", borderRadius: "var(--radius-sm)",
                  color: loading || resolving ? "var(--text-muted)" : "#fff", fontSize: "13px", fontWeight: 600,
                  padding: "0 16px", cursor: loading || resolving ? "not-allowed" : "pointer",
                }}
              >
                {resolving ? "…" : "Design"}
              </button>
            </div>

            {resolving && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--fs-sm)", color: "var(--text-2)" }}>
                <span className="pulse-dot" style={{ background: "var(--accent)" }} />
                Checking your description with AI
              </div>
            )}

            {parseError && (
              <div style={{ color: "var(--danger)", fontSize: "12px", lineHeight: 1.4 }}>{parseError}</div>
            )}

            {showTypePicker && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {SUPPORTED_TYPES.map(t => (
                  <button key={t.id} onClick={() => handlePickType(t.id)} style={chipStyle}>
                    {t.name}
                  </button>
                ))}
              </div>
            )}

            {pendingSpec && (
              <SpecCard
                spec={pendingSpec}
                source={specSource}
                lowConfidence={specLowConf}
                onChange={setPendingSpec}
                onRun={handleRunSpec}
                onCancel={handleCancelSpec}
                llmInLoop={llmInLoop}
                onLlmInLoopChange={setLlmInLoop}
                hasKey={!!process.env.REACT_APP_ANTHROPIC_KEY}
              />
            )}
          </div>
        </aside>

        {/* Main: running, welcome, or verified results */}
        <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
          {loading ? (
            <RunningState steps={logSteps} />
          ) : !selectedCircuit ? (
            <EmptyState onExample={handleExample} loading={loading} />
          ) : (
            <div key={selectedCircuit.id + (selectedCircuit.verification?.iterations ?? "")} className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "14px", minHeight: 0, flex: 1 }}>
              <ResultSummary circuit={selectedCircuit} />
              <Tabs active={activeTab} onChange={setActiveTab} />
              <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex", flexDirection: "column" }}>
                {activeTab === "schematic" && (
                  <SchematicPanel circuit={selectedCircuit} visible />
                )}
                {activeTab === "response" && (
                  <GraphPanel circuit={selectedCircuit} visible />
                )}
                {activeTab === "livesim" && (
                  <CircuitJSPanel circuit={selectedCircuit} visible />
                )}
                {activeTab === "details" && (
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: "12px", paddingRight: "4px" }}>
                    <ComponentTable
                      circuit={selectedCircuit}
                      visible
                      onComponentChange={handleComponentChange}
                      expanded={expandComponents}
                      onToggleExpand={() => setExpandComponents(!expandComponents)}
                    />
                    <ExplanationPanel
                      circuit={selectedCircuit}
                      visible
                      expanded={expandExplanation}
                      onToggle={() => setExpandExplanation(!expandExplanation)}
                    />
                    <BomPanel circuit={selectedCircuit} />
                    <MonteCarloPanel circuit={selectedCircuit} />
                    <RefineTrace circuit={selectedCircuit} />
                    <HowItWorks steps={logSteps} />
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

const chipStyle = {
  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "999px",
  color: "var(--text-2)", fontSize: "var(--fs-xs)", padding: "6px 12px", cursor: "pointer",
};

/* ── icons: one line set, 1.5px stroke, currentColor ──────────────────────── */
function IconCheck({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8.4l3.1 3.1L13 4.8" />
    </svg>
  );
}
function IconAlert({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2.2L14.4 13H1.6L8 2.2z" /><path d="M8 6.6v3" /><path d="M8 11.6h.01" />
    </svg>
  );
}
function IconChevron({ size = 16, dir = "right" }) {
  const rot = { right: 0, down: 90, up: -90 }[dir] || 0;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: `rotate(${rot}deg)`, transition: "transform 160ms var(--ease)" }}>
      <path d="M6 3.5L10.5 8L6 12.5" />
    </svg>
  );
}
function Mark({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect width="28" height="28" rx="8" fill="var(--accent)" />
      <path d="M5 15h3.2l2-7 3.6 12 2.2-9h4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* verification visual state → color + icon + label */
function statusOf(v) {
  if (v?.verifiable && v.converged) return { color: "var(--success)", soft: "var(--success-soft)", label: "Verified in SPICE", Icon: IconCheck };
  if (v?.verifiable && !v.converged) return { color: "var(--warn)", soft: "var(--warn-soft)", label: "Best effort", Icon: IconAlert };
  return { color: "var(--text-2)", soft: "var(--surface-2)", label: "Analytical design", Icon: null };
}

function StatusBadge({ v, size = "sm" }) {
  const s = statusOf(v);
  const pad = size === "sm" ? "4px 10px" : "5px 12px";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "var(--fs-xs)", fontWeight: 600, color: s.color, background: s.soft, padding: pad, borderRadius: "999px" }}>
      {s.Icon ? <s.Icon size={13} /> : <span className="pulse-dot" style={{ background: "currentColor" }} />}
      {s.label}
    </span>
  );
}

function Header({ verification }) {
  return (
    <header style={{ height: "64px", background: "var(--surface)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <Mark />
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
          <span style={{ fontWeight: 700, fontSize: "var(--fs-h2)", color: "var(--text)", letterSpacing: "-0.01em" }}>AutoCDA</span>
          <span style={{ color: "var(--text-3)", fontSize: "var(--fs-xs)" }}>Analog circuit design</span>
        </div>
      </div>
      {verification?.verifiable && <StatusBadge v={verification} size="md" />}
    </header>
  );
}

function ResultSummary({ circuit }) {
  const v = circuit.verification;
  const s = statusOf(v);
  const errStr = v?.errorPct == null ? null : `${(v.errorPct * 100).toFixed(1)}%`;
  const parts = (circuit.components || []).filter(c => c.unit === "Ω" || c.unit === "F");

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
      <div style={{ padding: "18px 20px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "16px 32px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "7px", flex: "1 1 200px" }}>
          <div style={{ fontSize: "var(--fs-h1)", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.01em" }}>{circuit.name}</div>
          <div><StatusBadge v={v} /></div>
        </div>

        {v?.verifiable ? (
          <div style={{ display: "flex", gap: "32px", flexWrap: "wrap" }}>
            <Stat label="Target" value={fmtTarget(v.targetName, v.targetValue)} />
            <Stat label="Measured (SPICE)" value={fmtTarget(v.targetName, v.measured)} accent={s.color} />
            {errStr && <Stat label="Error" value={errStr} accent={s.color} />}
            <Stat label="Iterations" value={String(v.iterations)} />
          </div>
        ) : (
          <div style={{ fontSize: "var(--fs-sm)", color: "var(--text-2)", maxWidth: "46ch", lineHeight: 1.5 }}>
            Values come straight from the design equations. Live SPICE verification for this circuit is on the roadmap.
          </div>
        )}
      </div>

      {v?.verifiable && v?.trace && v.trace.length > 0 && (() => {
        const first = v.trace.find(t => t.errorPct != null);
        const firstPct = first ? (first.errorPct * 100).toFixed(1) : null;
        const bestPct = v.errorPct != null ? (v.errorPct * 100).toFixed(1) : null;
        const usedSynth = v.trace.some(t => /synthesize/.test(t.rationale || ""));
        const usedJoint = v.trace.some(t => /joint/.test(t.rationale || ""));
        const usedTrim = v.trace.some(t => /E96/.test(t.rationale || ""));
        const method = usedSynth ? "series/parallel synthesis" : usedJoint ? "joint two-component trim" : usedTrim ? "E96 resistor trim" : v.trace.length > 1 ? "feedback refinement" : "first-pass hit";
        return (
          <div style={{ borderTop: "1px solid var(--border)", background: "var(--surface-2)", padding: "9px 20px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", fontSize: "var(--fs-xs)", color: "var(--text-2)" }}>
            <span style={{ color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>Reasoning loop</span>
            <span className="tnum">{v.trace.length} SPICE eval{v.trace.length === 1 ? "" : "s"}</span>
            {firstPct && bestPct && firstPct !== bestPct && <span className="tnum" style={{ color: "var(--text-3)" }}>· {firstPct}% → {bestPct}%</span>}
            <span style={{ color: "var(--text-3)" }}>· {method}</span>
            <span style={{ color: "var(--text-3)" }}>· see Details for the full trace</span>
          </div>
        );
      })()}

      {parts.length > 0 && (
        <div style={{ borderTop: "1px solid var(--border)", background: "var(--surface-2)", padding: "10px 20px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>Buyable parts</span>
          {parts.map(p => (
            <span key={p.ref} className="tnum" style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)", color: "var(--text)", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "6px", padding: "3px 8px" }}>
              {p.ref} {p.display}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
      <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>{label}</span>
      <span className="tnum" style={{ fontSize: "var(--fs-h2)", fontWeight: 700, color: accent || "var(--text)" }}>{value}</span>
    </div>
  );
}

function Tabs({ active, onChange }) {
  return (
    <div style={{ display: "flex", gap: "3px", background: "var(--surface-2)", padding: "3px", borderRadius: "999px", alignSelf: "flex-start", border: "1px solid var(--border)" }}>
      {TABS.map(t => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              border: "none", borderRadius: "999px", cursor: "pointer",
              padding: "7px 16px", fontSize: "var(--fs-sm)", fontWeight: 600,
              background: on ? "var(--surface)" : "transparent",
              color: on ? "var(--text)" : "var(--text-2)",
              boxShadow: on ? "var(--shadow-sm)" : "none",
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function EmptyState({ onExample, loading }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "24px" }}>
      <div style={{ marginBottom: "18px" }}><Mark size={44} /></div>
      <h1 style={{ fontSize: "var(--fs-display)", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", marginBottom: "10px" }}>
        Describe the circuit you need
      </h1>
      <p style={{ fontSize: "var(--fs-h2)", fontWeight: 400, color: "var(--text-2)", maxWidth: "48ch", lineHeight: 1.55, marginBottom: "28px" }}>
        Plain English in, a buyable design out. AutoCDA picks real parts and proves the result in a SPICE simulator running in your browser.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", justifyContent: "center", maxWidth: "600px" }}>
        {EXAMPLES.map(ex => (
          <button
            key={ex}
            onClick={() => onExample(ex)}
            disabled={loading}
            style={{
              background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "999px",
              color: "var(--text)", fontSize: "var(--fs-body)", fontWeight: 500, padding: "10px 18px",
              cursor: loading ? "not-allowed" : "pointer", boxShadow: "var(--shadow-sm)",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text)"; }}
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}

// Monte-Carlo tolerance sweep: perturb parts within tolerance, run real SPICE
// N times, show the metric distribution + manufacturing yield.
function MonteCarloPanel({ circuit }) {
  const v = circuit.verification;
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);

  if (!v?.verifiable) return null;

  const run = async () => {
    setRunning(true); setProgress(0); setResult(null);
    const spec = {
      type: circuit.id,
      targets: v.targets,
      constraints: { tolerance: v.tolerance ?? 0.05, eSeries: v.eSeries ?? "E24" },
    };
    try {
      const res = await runToleranceSweep(spec, circuit.components, { runSpice, N: 200, onProgress: setProgress });
      setResult(res);
    } catch {
      setResult({ supported: true, error: true });
    }
    setRunning(false);
  };

  const yieldPct = result && result.supported && !result.error ? result.yield * 100 : null;
  const yieldColor = yieldPct == null ? "var(--text)" : yieldPct >= 95 ? "var(--success)" : yieldPct >= 80 ? "var(--warn)" : "var(--danger)";
  const tol = (v.tolerance ?? 0.05);

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: result ? "1px solid var(--border)" : "none", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "var(--fs-body)", fontWeight: 600, color: "var(--text)" }}>Tolerance analysis</div>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-3)", marginTop: "2px" }}>
            200 Monte-Carlo runs, each part perturbed within ±{(tol * 100).toFixed(0)}%
          </div>
        </div>
        <button
          onClick={run}
          disabled={running}
          style={{
            background: running ? "var(--surface-2)" : "var(--accent)", border: "none", borderRadius: "var(--r-sm)",
            color: running ? "var(--text-3)" : "#fff", fontSize: "var(--fs-sm)", fontWeight: 600,
            padding: "9px 16px", cursor: running ? "progress" : "pointer",
          }}
          onMouseEnter={(e) => { if (!running) e.currentTarget.style.background = "var(--accent-hover)"; }}
          onMouseLeave={(e) => { if (!running) e.currentTarget.style.background = "var(--accent)"; }}
        >
          {running ? `Simulating ${Math.round(progress * 100)}%` : result ? "Run again" : "Run tolerance sweep"}
        </button>
      </div>

      {running && (
        <div style={{ height: "3px", background: "var(--surface-2)" }}>
          <div style={{ height: "100%", width: `${progress * 100}%`, background: "var(--accent)", transition: "width 120ms var(--ease)" }} />
        </div>
      )}

      {result && result.error && (
        <div style={{ padding: "16px 18px", fontSize: "var(--fs-sm)", color: "var(--danger)" }}>The sweep failed to run.</div>
      )}

      {result && result.supported && !result.error && (
        <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", gap: "32px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>Yield within spec</span>
              <span className="tnum" style={{ fontSize: "var(--fs-h1)", fontWeight: 700, color: yieldColor }}>{yieldPct.toFixed(1)}%</span>
            </div>
            <Stat label={`Mean ${result.targetName}`} value={fmtTarget(result.targetName, result.mean)} />
            <Stat label="Std dev" value={fmtTarget(result.targetName, result.std)} />
            <Stat label="Spread" value={`${fmtTarget(result.targetName, result.min)} – ${fmtTarget(result.targetName, result.max)}`} />
          </div>

          <div style={{ height: "220px", width: "100%" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={result.bins} margin={{ top: 8, right: 12, bottom: 20, left: 4 }}>
                <XAxis
                  dataKey="center" type="number" domain={["dataMin", "dataMax"]}
                  tickFormatter={(x) => fmtTarget(result.targetName, x)}
                  tick={{ fontSize: 11, fill: "var(--text-3)" }} stroke="var(--border-strong)"
                  tickLine={false} minTickGap={40}
                />
                <YAxis tick={{ fontSize: 11, fill: "var(--text-3)" }} stroke="var(--border-strong)" tickLine={false} allowDecimals={false} width={28} />
                <Tooltip
                  cursor={{ fill: "var(--surface-2)" }}
                  contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }}
                  labelFormatter={(x) => fmtTarget(result.targetName, x)}
                  formatter={(val) => [`${val} runs`, "Count"]}
                />
                {result.target != null && (
                  <>
                    <ReferenceLine x={result.target} stroke="var(--success)" strokeWidth={1.5} strokeDasharray="4 3" />
                    <ReferenceLine x={result.target * (1 - result.tolerance)} stroke="var(--warn)" strokeDasharray="2 3" />
                    <ReferenceLine x={result.target * (1 + result.tolerance)} stroke="var(--warn)" strokeDasharray="2 3" />
                  </>
                )}
                <Bar dataKey="count" fill="var(--accent)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-3)", display: "flex", gap: "16px", flexWrap: "wrap" }}>
            <span><span style={{ color: "var(--success)" }}>—</span> target {fmtTarget(result.targetName, result.target)}</span>
            <span><span style={{ color: "var(--warn)" }}>--</span> ±{(result.tolerance * 100).toFixed(0)}% spec band</span>
            <span>{result.n} of {result.N} runs converged</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Bill of materials: buyable parts, MPNs, quantities, and total cost.
function BomPanel({ circuit }) {
  const [open, setOpen] = useState(true);
  const staticBom = React.useMemo(() => buildBOM(circuit.components), [circuit.components]);
  const [bom, setBom] = useState(staticBom);
  const [pricing, setPricing] = useState(BOM_PRICE_SOURCE ? "loading" : "static");

  useEffect(() => {
    setBom(staticBom);
    if (!BOM_PRICE_SOURCE) { setPricing("static"); return; }
    let live = true;
    setPricing("loading");
    buildBOMPriced(circuit.components, { source: BOM_PRICE_SOURCE })
      .then((priced) => { if (live) { setBom(priced); setPricing(priced.livePriced ? "live" : "static"); } })
      .catch(() => { if (live) setPricing("static"); });
    return () => { live = false; };
  }, [circuit.components, staticBom]);

  if (!bom.rows.length) return null;
  const anyPriced = bom.rows.some((r) => r.priced);

  const th = { textAlign: "left", padding: "8px 18px", fontSize: "var(--fs-xs)", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600, borderBottom: "1px solid var(--border)" };
  const thR = { ...th, textAlign: "right" };
  const td = { padding: "9px 18px", fontSize: "var(--fs-sm)", borderBottom: "1px solid var(--border)" };
  const tdR = { ...td, textAlign: "right", fontFamily: "var(--font-mono)" };

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", background: "transparent", border: "none", cursor: "pointer", fontSize: "var(--fs-body)", fontWeight: 600, color: "var(--text)" }}
      >
        <span>Bill of materials</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "10px" }}>
          <span style={{
            fontSize: "var(--fs-xs)", fontWeight: 600, padding: "2px 8px", borderRadius: "999px",
            background: pricing === "live" ? "var(--success-soft)" : "var(--surface-2)",
            color: pricing === "live" ? "var(--success)" : "var(--text-3)",
          }}>{pricing === "live" ? "Mouser live" : pricing === "loading" ? "pricing…" : "catalog"}</span>
          <span className="tnum" style={{ fontSize: "var(--fs-sm)", color: "var(--text-2)", fontWeight: 600 }}>${bom.total.toFixed(2)} / unit</span>
          <span style={{ color: "var(--text-3)", display: "inline-flex" }}><IconChevron dir={open ? "down" : "right"} /></span>
        </span>
      </button>
      {open && (
        <table style={{ width: "100%", borderCollapse: "collapse", borderTop: "1px solid var(--border)" }}>
          <thead>
            <tr>
              <th style={th}>Ref</th>
              <th style={th}>Value</th>
              <th style={th}>MPN</th>
              <th style={thR}>Qty</th>
              <th style={thR}>Unit</th>
              <th style={thR}>Line</th>
              {anyPriced && <th style={thR}>Stock</th>}
            </tr>
          </thead>
          <tbody>
            {bom.rows.map((r, i) => (
              <tr key={i}>
                <td style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>{r.ref}</td>
                <td className="tnum" style={{ ...td, color: "var(--text)" }}>{r.value}</td>
                <td style={{ ...td, fontFamily: "var(--font-mono)", color: "var(--text-2)", fontSize: "var(--fs-xs)" }}>{r.mpn}</td>
                <td className="tnum" style={tdR}>{r.qty}</td>
                <td className="tnum" style={{ ...tdR, color: r.priced ? "var(--success)" : undefined }}>${r.unitPrice.toFixed(3)}</td>
                <td className="tnum" style={{ ...tdR, color: "var(--text)", fontWeight: 500 }}>${r.lineTotal.toFixed(3)}</td>
                {anyPriced && <td className="tnum" style={{ ...tdR, color: "var(--text-3)", fontSize: "var(--fs-xs)" }}>{r.priced && r.stock != null ? r.stock.toLocaleString() : r.priced ? "—" : "catalog"}</td>}
              </tr>
            ))}
            <tr>
              <td style={{ ...td, borderBottom: "none" }} colSpan={5}>
                <span style={{ fontWeight: 600 }}>Total per unit</span>
              </td>
              <td className="tnum" style={{ ...tdR, borderBottom: "none", color: "var(--text)", fontWeight: 700 }}>${bom.total.toFixed(3)}</td>
              {anyPriced && <td style={{ ...td, borderBottom: "none" }} />}
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

// The E-series refine search, shown as a table. Transparency is the product.
function RefineTrace({ circuit }) {
  const [open, setOpen] = useState(false);
  const v = circuit.verification;
  if (!v?.verifiable || !v.trace || v.trace.length === 0) return null;

  const comp = (circuit.components || []).find(c => c.ref === v.trace[0].ref);
  const unitOf = (ref) => (circuit.components || []).find(c => c.ref === ref)?.unit;
  const fmtVal = (val, ref) => {
    const u = unitOf(ref) ?? comp?.unit;
    return u === "F" ? formatCapacitance(val) : u === "Ω" ? formatResistance(val) : String(val);
  };
  const bestIdx = v.trace.reduce((b, t, i) => (t.errorPct != null && (v.trace[b].errorPct == null || t.errorPct < v.trace[b].errorPct)) ? i : b, 0);

  const th = { textAlign: "left", padding: "8px 18px", fontSize: "var(--fs-xs)", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600, borderBottom: "1px solid var(--border)" };
  const td = { padding: "9px 18px", fontSize: "var(--fs-sm)", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-mono)" };

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", background: "transparent", border: "none", cursor: "pointer", fontSize: "var(--fs-body)", fontWeight: 600, color: "var(--text)" }}
      >
        <span>Reasoning loop ({v.trace.length} {v.trace.length === 1 ? "step" : "steps"}, propose → SPICE → re-propose)</span>
        <span style={{ color: "var(--text-3)", display: "inline-flex" }}><IconChevron dir={open ? "down" : "right"} /></span>
      </button>
      {open && (
        <table style={{ width: "100%", borderCollapse: "collapse", borderTop: "1px solid var(--border)" }}>
          <thead>
            <tr>
              <th style={th}>Attempt</th>
              <th style={th}>Component</th>
              <th style={th}>Measured</th>
              <th style={th}>Error</th>
              <th style={th}>Reasoning</th>
            </tr>
          </thead>
          <tbody>
            {v.trace.map((t, i) => {
              const chosen = i === bestIdx;
              return (
                <tr key={i} style={{ background: chosen ? "var(--success-soft)" : "transparent" }}>
                  <td className="tnum" style={{ ...td, color: "var(--text-2)" }}>{i + 1}</td>
                  <td className="tnum" style={{ ...td, color: "var(--text)" }}>{t.ref ? `${t.ref} ` : ""}{fmtVal(t.value, t.ref)}{chosen ? "  (chosen)" : ""}</td>
                  <td className="tnum" style={{ ...td, color: "var(--text)" }}>{fmtTarget(v.targetName, t.measured)}</td>
                  <td className="tnum" style={{ ...td, color: chosen ? "var(--success)" : "var(--text-2)", fontWeight: chosen ? 600 : 400 }}>
                    {t.errorPct == null ? "n/a" : `${(t.errorPct * 100).toFixed(1)}%`}
                  </td>
                  <td style={{ ...td, color: "var(--text-3)", fontSize: "var(--fs-xs)", maxWidth: "260px" }}>{t.rationale || ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function RunningState({ steps }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "24px", gap: "20px" }}>
      <div style={{ position: "relative", display: "inline-flex" }}>
        <Mark size={40} />
        <span className="pulse-dot" style={{ position: "absolute", top: -3, right: -3, background: "var(--accent)", width: 10, height: 10 }} />
      </div>
      <div style={{ fontSize: "var(--fs-h2)", fontWeight: 600, color: "var(--text)" }}>Designing and verifying</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "9px", alignItems: "flex-start", minWidth: "260px" }}>
        {(steps || []).slice(0, 3).map((s, i) => (
          <div key={i} style={{ display: "flex", gap: "9px", alignItems: "center", fontSize: "var(--fs-sm)", color: "var(--text-2)" }}>
            <span className="pulse-dot" style={{ background: "var(--accent)" }} />
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}

// Collapsible build log. Strips the machine prefixes and renders a clean list.
function HowItWorks({ steps }) {
  const [open, setOpen] = useState(false);
  if (!steps || !steps.length) return null;
  const clean = steps.map(s => s.replace(/^\s*\[[^\]]*\]\s*/, "").trim()).filter(Boolean);
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", background: "transparent", border: "none", cursor: "pointer", fontSize: "var(--fs-body)", fontWeight: 600, color: "var(--text)" }}
      >
        <span>How this design was built</span>
        <span style={{ color: "var(--text-3)", display: "inline-flex" }}><IconChevron dir={open ? "down" : "right"} /></span>
      </button>
      {open && (
        <ol style={{ listStyle: "none", padding: "0 18px 16px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {clean.map((s, i) => (
            <li key={i} style={{ display: "flex", gap: "9px", alignItems: "flex-start", fontSize: "var(--fs-sm)", color: "var(--text-2)", lineHeight: 1.5 }}>
              <span style={{ color: "var(--success)", flexShrink: 0, marginTop: "2px", display: "inline-flex" }}><IconCheck size={14} /></span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ChatMessages({ messages }) {
  const endRef = React.useRef(null);
  React.useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  return (
    <>
      {messages.map((msg, i) => {
        const user = msg.role === "user";
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: user ? "flex-end" : "flex-start" }}>
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-3)", marginBottom: "4px", padding: user ? "0 2px 0 0" : "0 0 0 2px", fontWeight: 500 }}>
              {user ? "You" : "AutoCDA"}
            </div>
            <div style={{
              maxWidth: "92%", padding: "10px 13px",
              borderRadius: user ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
              background: user ? "var(--accent)" : "var(--surface-2)",
              color: user ? "#fff" : "var(--text)",
              fontSize: "var(--fs-sm)", lineHeight: 1.5,
              border: user ? "none" : "1px solid var(--border)",
            }}>
              {msg.text}
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </>
  );
}
