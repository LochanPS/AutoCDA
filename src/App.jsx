import React, { useState, useCallback, useRef, useEffect } from "react";
import "./App.css";
import SchematicPanel from "./components/SchematicPanel";
import GraphPanel from "./components/GraphPanel";
import ComponentTable from "./components/ComponentTable";
import ExplanationPanel from "./components/ExplanationPanel";
import CircuitJSPanel from "./components/CircuitJSPanel";
import SpecCard from "./components/SpecCard";
import ErrorBoundary from "./components/ErrorBoundary";
import NetlistImport from "./components/NetlistImport";
import ChainBuilder from "./components/ChainBuilder";

import { parsePrompt } from "./utils/circuitParser";
import { parseFallback } from "./parse/parseFallback";
import { applyFollowup } from "./parse/followup";
import { buildShareUrl, encodeDesign, readDesignFromHash, HASH_KEY } from "./share/designLink";
import { listDesigns, saveDesign, deleteDesign } from "./share/designStore";
import { makeSpec, SUPPORTED_TYPES } from "./spec/circuitSpec";
import { recalculateFromComponents, formatResistance, formatCapacitance } from "./utils/circuitFormulas";
import { designAndVerify } from "./design/loop";
import { llmReasoningProposer } from "./agents/reasoningAgent";
import { runSpice } from "./sim/spice";
import { parseWithLLM } from "./parse/llmParser";
import { buildBOM, buildBOMPriced, buildBomCsv } from "./design/bom";
import { cached, makeMarketplaceSource } from "./design/distributorPricing";

// Multi-distributor marketplace source (built once) when a proxy URL is set; else
// null -> static catalog. The URL is non-secret; distributor keys live in the proxy.
const BOM_PRICE_SOURCE = process.env.REACT_APP_PRICING_PROXY
  ? cached(makeMarketplaceSource({ baseUrl: process.env.REACT_APP_PRICING_PROXY }))
  : null;
import { runToleranceSweep } from "./design/montecarlo";
import { usePro } from "./pro/ProContext";
import { ProButton, ProUpsell, ProGate } from "./pro/ProUI";

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
    text: "Hi! Describe a circuit in plain English — 19 types including 2nd-order Sallen-Key filters and multi-stage amplifiers. You can set tolerance and E-series in words too (e.g. \"2% tolerance on E96\"). I design it, then verify it in a real SPICE simulator. Open the Details tab after a run to see the reasoning loop, bill of materials, and Monte-Carlo yield. Try an example:",
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

// Snapshot the numbers a before→after comparison needs from a designed circuit.
function snapshotCircuit(circuit) {
  const v = circuit.verification || {};
  const bom = buildBOM(circuit.components || []);
  const parts = (circuit.components || []).filter((c) => c.unit === "Ω" || c.unit === "F");
  return {
    name: circuit.name,
    verifiable: !!v.verifiable,
    converged: !!v.converged,
    targetName: v.targetName,
    targetValue: v.targetValue,
    measured: v.measured,
    errorPct: v.errorPct,
    eSeries: v.eSeries || "E24",
    tolerance: v.tolerance ?? 0.05,
    cost: bom.total,
    partCount: parts.length,
    parts: parts.map((p) => `${p.ref} ${p.display}`),
  };
}

// The shareable/saveable payload for the circuit on screen.
function currentDesign(circuit) {
  const spec = circuit.spec || reconstructSpec(circuit);
  return { type: spec.type, targets: spec.targets, constraints: spec.constraints, components: circuit.components || [] };
}

// A readable name for a saved design, e.g. "RC Low-Pass Filter · 1.00 kHz".
function designName(circuit) {
  const v = circuit.verification || {};
  const tv = v.targetName ? fmtTarget(v.targetName, v.targetValue) : null;
  return tv ? `${circuit.name} · ${tv}` : circuit.name;
}

// Fallback spec for circuits designed before the spec was remembered on it.
function reconstructSpec(circuit) {
  const v = circuit.verification || {};
  return makeSpec({
    type: circuit.id,
    targets: { ...(v.targets || {}) },
    constraints: { eSeries: v.eSeries || "E24", tolerance: v.tolerance ?? 0.05 },
  });
}

export default function App() {
  const [mode, setMode]               = useState("design"); // "design" | "import" | "chain"
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

  // Multi-turn iteration: the last applied edit, with before/after snapshots.
  const [lastChange, setLastChange] = useState(null);
  const [refineText, setRefineText] = useState("");
  const [refineError, setRefineError] = useState("");

  // Save + share
  const [savedDesigns, setSavedDesigns] = useState(() => listDesigns());
  const [toast, setToast] = useState("");

  const inputRef = useRef(null);
  const mainRef = useRef(null);
  const toastTimer = useRef(null);
  const hashHandled = useRef(false);
  const { isPro } = usePro();

  // A new result can be taller than the viewport now that the result column
  // scrolls — land at the top (title + measured stats) rather than mid-page.
  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [selectedCircuit]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2400);
  }, []);

  // Core: deterministic design → snap → REAL ngspice-wasm verify → refine loop.
  // opts.before / opts.changeLabel are set for multi-turn follow-up edits; they
  // drive the before→after panel. A fresh design clears any prior comparison.
  const runDesign = useCallback(async (spec, promptText, opts = {}) => {
    if (loading) return;
    const isEdit = !!opts.before;
    setParseError("");
    setRefineError("");
    if (!isEdit) setLastChange(null);
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
      const detail = (e && e.message ? String(e.message) : "").trim().slice(0, 140);
      setMessages(prev => [...prev, {
        role: "system",
        text: `The SPICE simulation couldn’t finish for this design${detail ? ` (${detail})` : ""}. ` +
          `Your inputs are fine — try running it again, or tweak a value and re-run.`,
      }]);
      return;
    }

    if (!res || !res.circuit) {
      setLoading(false);
      setMessages(prev => [...prev, {
        role: "system",
        text: "I couldn’t build a working circuit from those targets. Try adjusting a value, " +
          "or pick a different circuit type and run it again.",
      }]);
      return;
    }

    const staticData = STATIC[spec.type] || {};
    const merged = {
      ...res.circuit,
      kicadSchematic: staticData.kicadSchematic,
      kicadNetlist:   staticData.kicadNetlist,
      simulationBadge: verificationBadge(res),
      verification: res,
      spec,   // remembered so the next follow-up can delta from it
    };

    setLogSteps(buildLogSteps(res));
    setMessages(prev => [
      ...prev,
      {
        role: "system",
        text: isEdit
          ? `${opts.changeLabel}. ${verificationLine(res)}`
          : `Circuit identified: ${res.circuit.name}. ${verificationLine(res)}`,
      },
    ]);
    if (isEdit) {
      setLastChange({ label: opts.changeLabel, before: opts.before, after: snapshotCircuit(merged) });
    }
    setSelectedCircuit(merged);
    setLoading(false);
  }, [loading, llmInLoop]);

  // Parse a follow-up into a spec delta and re-run, SPICE-grading the change.
  const handleRefine = useCallback((textArg) => {
    if (!selectedCircuit || loading) return;
    const text = (typeof textArg === "string" ? textArg : refineText).trim();
    if (!text) return;
    const spec = selectedCircuit.spec || reconstructSpec(selectedCircuit);
    const res = applyFollowup(spec, text);
    if (!res.ok) { setRefineError(res.message); return; }
    const before = snapshotCircuit(selectedCircuit);
    setRefineText("");
    setRefineError("");
    runDesign(res.spec, text, { before, changeLabel: res.change.label });
  }, [selectedCircuit, loading, refineText, runDesign]);

  // Rebuild + re-verify a design from a decoded payload (shared link or saved).
  const loadDesignPayload = useCallback((payload, label) => {
    if (!payload) return false;
    let spec;
    try {
      spec = makeSpec({ type: payload.type, targets: payload.targets, constraints: payload.constraints });
    } catch {
      setParseError("That design couldn’t be loaded — it may be from an old version.");
      return false;
    }
    runDesign(spec, label || "Loaded design");
    return true;
  }, [runDesign]);

  // Copy a shareable link to the current design (and reflect it in the address bar).
  const handleShare = useCallback(async () => {
    if (!selectedCircuit) return;
    const d = currentDesign(selectedCircuit);
    const url = buildShareUrl(d);
    try { window.history.replaceState(null, "", `#${HASH_KEY}=${encodeDesign(d)}`); } catch { /* ignore */ }
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied to clipboard");
    } catch {
      showToast("Link is in the address bar — copy it");
    }
  }, [selectedCircuit, showToast]);

  const handleSaveDesign = useCallback(() => {
    if (!selectedCircuit) return;
    const rec = saveDesign(currentDesign(selectedCircuit), { name: designName(selectedCircuit) });
    if (rec) { setSavedDesigns(listDesigns()); showToast("Saved to My designs"); }
    else showToast("Couldn’t save — storage unavailable");
  }, [selectedCircuit, showToast]);

  const handleLoadSaved = useCallback((rec) => {
    loadDesignPayload(rec.design, rec.name);
  }, [loadDesignPayload]);

  const handleDeleteSaved = useCallback((id) => {
    setSavedDesigns(deleteDesign(id));
  }, []);

  // On first load, rebuild any design encoded in the URL hash (then re-verify).
  useEffect(() => {
    if (hashHandled.current) return;
    hashHandled.current = true;
    const payload = readDesignFromHash(typeof window !== "undefined" ? window.location.hash : "");
    if (payload) loadDesignPayload(payload, "Opened from shared link");
  }, [loadDesignPayload]);

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

    const outcome = parseFallback(fast);
    if (outcome.kind === "fail") {
      setParseError(outcome.message);
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
      <Header verification={mode === "design" ? selectedCircuit?.verification : null} mode={mode} onMode={setMode} />

      {mode === "import" ? (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "auto", padding: "16px" }}>
          {isPro ? <NetlistImport /> : <ProUpsell feature="Netlist import" note="Import an external SPICE netlist and verify it. Core design + verification stays free." />}
        </div>
      ) : mode === "chain" ? (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "auto", padding: "16px" }}>
          {isPro ? <ChainBuilder /> : <ProUpsell feature="Build-a-chain" note="Cascade verified stages into multi-stage circuits, measured end-to-end. Core design + verification stays free." />}
        </div>
      ) : (
      <div className="app-row" style={{ display: "flex", flex: 1, overflow: "hidden", padding: "16px", gap: "16px", minHeight: 0 }}>

        {/* Sidebar: conversation + input */}
        <aside className="app-aside" style={{
          width: "340px", flexShrink: 0, display: "flex", flexDirection: "column",
          background: "var(--bg-panel)", border: "1px solid var(--border)", borderRadius: "var(--radius)",
          overflow: "hidden", boxShadow: "var(--shadow-sm)",
        }}>
          <div className="aside-msgs" style={{ flex: "1 1 0", overflowY: "auto", padding: "18px", display: "flex", flexDirection: "column", gap: "14px", minHeight: 0 }}>
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

            <MyDesigns
              items={savedDesigns}
              onLoad={handleLoadSaved}
              onDelete={handleDeleteSaved}
              disabled={loading || resolving}
            />
          </div>
        </aside>

        {/* Main: running, welcome, or verified results */}
        <main ref={mainRef} className="app-main" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
          {loading ? (
            <RunningState steps={logSteps} />
          ) : !selectedCircuit ? (
            <EmptyState onExample={handleExample} loading={loading} />
          ) : (
            <ErrorBoundary
              resetKey={selectedCircuit.id + (selectedCircuit.verification?.iterations ?? "")}
              onReset={() => { setSelectedCircuit(null); setActiveTab("schematic"); }}
            >
            <div key={selectedCircuit.id + (selectedCircuit.verification?.iterations ?? "")} className="fade-in result-view" style={{ display: "flex", flexDirection: "column", gap: "14px", minHeight: 0, flex: 1 }}>
              <ResultSummary circuit={selectedCircuit} />
              <DesignActions onShare={handleShare} onSave={handleSaveDesign} toast={toast} />
              {lastChange && <BeforeAfter change={lastChange} />}
              <RefineBar
                value={refineText}
                onChange={setRefineText}
                onSubmit={handleRefine}
                error={refineError}
                disabled={loading}
              />
              <Tabs active={activeTab} onChange={setActiveTab} />
              <div className="tab-pane" style={{ flex: 1, minHeight: 0, position: "relative", display: "flex", flexDirection: "column" }}>
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
            </ErrorBoundary>
          )}
        </main>
      </div>
      )}
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
  // Crisp outlined chip (1px border in the status color) rather than a heavy
  // solid-green fill — reads cleaner and less loud.
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "var(--fs-xs)", fontWeight: 600, color: s.color, background: "transparent", border: `1px solid ${s.color}`, padding: pad, borderRadius: "999px" }}>
      {s.Icon ? <s.Icon size={13} /> : <span className="pulse-dot" style={{ background: "currentColor" }} />}
      {s.label}
    </span>
  );
}

const MODES = [
  { id: "design", label: "Describe" },
  { id: "import", label: "Import netlist" },
  { id: "chain", label: "Build a chain" },
];

function ModeTabs({ mode, onMode }) {
  return (
    <div className="mode-tabs" style={{ display: "flex", gap: "3px", background: "var(--surface-2)", padding: "3px", borderRadius: "999px", border: "1px solid var(--border)" }}>
      {MODES.map((m) => {
        const on = m.id === mode;
        return (
          <button
            key={m.id}
            onClick={() => onMode(m.id)}
            style={{
              border: "none", borderRadius: "999px", cursor: "pointer",
              padding: "7px 16px", fontSize: "var(--fs-sm)", fontWeight: 600,
              background: on ? "var(--surface)" : "transparent",
              color: on ? "var(--text)" : "var(--text-2)",
              boxShadow: on ? "var(--shadow-sm)" : "none",
            }}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}

function Header({ verification, mode, onMode }) {
  return (
    <header className="app-header" style={{ height: "64px", background: "var(--surface)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", flexShrink: 0, gap: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <Mark />
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.15 }}>
          <span style={{ fontWeight: 700, fontSize: "var(--fs-h2)", color: "var(--text)", letterSpacing: "-0.01em" }}>AutoCDA</span>
          <span style={{ color: "var(--text-3)", fontSize: "var(--fs-xs)" }}>Analog circuit design</span>
        </div>
      </div>
      {onMode && <ModeTabs mode={mode} onMode={onMode} />}
      <ProButton />{/* status shown under the result title, not duplicated here */}
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

// Share + save a design. No backend — share encodes into the URL, save goes to
// localStorage (see src/share/).
function IconLink({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6.5 9.5l3-3" /><path d="M7.5 4.5l.8-.8a2.5 2.5 0 013.5 3.5l-.8.8" /><path d="M8.5 11.5l-.8.8a2.5 2.5 0 01-3.5-3.5l.8-.8" />
    </svg>
  );
}
function IconSave({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3h8l2 2v8H3z" /><path d="M5.5 3v3h4V3" /><path d="M5.5 9.5h5" />
    </svg>
  );
}

const actionBtn = {
  display: "inline-flex", alignItems: "center", gap: "6px",
  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
  color: "var(--text)", fontSize: "var(--fs-sm)", fontWeight: 600, padding: "7px 13px", cursor: "pointer",
};

function DesignActions({ onShare, onSave, toast }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
      <button style={actionBtn} onClick={onShare}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text)"; }}>
        <IconLink /> Share link
      </button>
      <button style={actionBtn} onClick={onSave}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text)"; }}>
        <IconSave /> Save
      </button>
      {toast && (
        <span style={{ fontSize: "var(--fs-xs)", color: "var(--success)", fontWeight: 600 }}>{toast}</span>
      )}
    </div>
  );
}

// "My designs" — saved designs from localStorage. Click to reload (re-verifies);
// × to delete.
function MyDesigns({ items, onLoad, onDelete, disabled }) {
  if (!items || !items.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>
        My designs
      </div>
      {items.map((r) => (
        <div key={r.id} style={{ display: "flex", alignItems: "stretch", gap: "6px" }}>
          <button
            onClick={() => !disabled && onLoad(r)}
            disabled={disabled}
            title="Reload and re-verify this design"
            style={{
              flex: 1, textAlign: "left", background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "var(--r-sm)", color: "var(--text)", fontSize: "var(--fs-sm)", fontWeight: 500,
              padding: "8px 10px", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.borderColor = "var(--accent)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
          >
            {r.name}
          </button>
          <button
            onClick={() => onDelete(r.id)}
            aria-label={`Delete ${r.name}`}
            title="Delete"
            style={{
              flexShrink: 0, width: "32px", background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: "var(--r-sm)", color: "var(--text-3)", fontSize: "16px", lineHeight: 1, cursor: "pointer",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--danger)"; e.currentTarget.style.color = "var(--danger)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-3)"; }}
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}

// Refine bar: type a follow-up to iterate on the current design. Each edit is
// parsed into a spec delta and re-run through the SPICE-graded loop.
const REFINE_CHIPS = ["use E96", "tighter tolerance", "sharpen the rolloff", "cut cost 20%"];

function RefineBar({ value, onChange, onSubmit, error, disabled }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--shadow-sm)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: "9px" }}>
      <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>
        Refine this design
      </div>
      <div style={{ display: "flex", gap: "8px" }}>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          placeholder="e.g. lower the gain to 8 · raise the cutoff by 50% · use E96"
          disabled={disabled}
          style={{
            flex: 1, background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
            padding: "9px 11px", color: "var(--text)", fontSize: "var(--fs-sm)", outline: "none", opacity: disabled ? 0.6 : 1,
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.boxShadow = "0 0 0 3px var(--accent-soft)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
        />
        <button
          onClick={() => onSubmit()}
          disabled={disabled}
          style={{
            background: disabled ? "var(--surface-2)" : "var(--accent)", border: "none", borderRadius: "var(--r-sm)",
            color: disabled ? "var(--text-3)" : "#fff", fontSize: "var(--fs-sm)", fontWeight: 600,
            padding: "0 16px", cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          Apply
        </button>
      </div>
      {error && <div style={{ color: "var(--danger)", fontSize: "var(--fs-xs)", lineHeight: 1.45 }}>{error}</div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {REFINE_CHIPS.map((c) => (
          <button key={c} onClick={() => onSubmit(c)} disabled={disabled} style={{ ...chipStyle, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1 }}>
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

// Before→after comparison for the most recent edit. Shows what the SPICE-graded
// re-run actually changed: measured value, error, cost, parts, constraints.
function BeforeAfter({ change }) {
  const { before, after, label } = change;
  const tn = after.targetName || before.targetName;
  const pct = (x) => (x == null ? "n/a" : `${(x * 100).toFixed(1)}%`);

  const rows = [];
  if (before.targetValue !== after.targetValue) {
    rows.push({ k: "Target", b: fmtTarget(tn, before.targetValue), a: fmtTarget(tn, after.targetValue) });
  }
  if (before.verifiable || after.verifiable) {
    rows.push({ k: "Measured (SPICE)", b: fmtTarget(tn, before.measured), a: fmtTarget(tn, after.measured) });
    rows.push({ k: "Error", b: pct(before.errorPct), a: pct(after.errorPct), good: cmp(after.errorPct, before.errorPct) });
  }
  rows.push({ k: "Cost / unit", b: `$${before.cost.toFixed(3)}`, a: `$${after.cost.toFixed(3)}`, good: cmp(after.cost, before.cost) });
  rows.push({ k: "Parts", b: String(before.partCount), a: String(after.partCount) });
  if (before.eSeries !== after.eSeries) rows.push({ k: "E-series", b: before.eSeries, a: after.eSeries });
  if (before.tolerance !== after.tolerance) rows.push({ k: "Tolerance", b: `${+(before.tolerance * 100).toPrecision(3)}%`, a: `${+(after.tolerance * 100).toPrecision(3)}%` });

  const colorFor = (good) => (good === 1 ? "var(--success)" : good === -1 ? "var(--danger)" : "var(--text)");

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--shadow-sm)", overflow: "hidden" }}>
      <div style={{ padding: "11px 18px", borderBottom: "1px solid var(--border)", background: "var(--surface-2)", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>Latest edit</span>
        <span style={{ fontSize: "var(--fs-sm)", color: "var(--text)", fontWeight: 600 }}>{label}</span>
        {before.name !== after.name && (
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-3)" }}>· {before.name} → {after.name}</span>
        )}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={baCell(true)}></th>
            <th style={{ ...baCell(true), textAlign: "right", color: "var(--text-3)" }}>Before</th>
            <th style={{ ...baCell(true), textAlign: "center", width: "28px" }}></th>
            <th style={{ ...baCell(true), textAlign: "right" }}>After</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ ...baCell(false), color: "var(--text-2)" }}>{r.k}</td>
              <td className="tnum" style={{ ...baCell(false), textAlign: "right", color: "var(--text-3)" }}>{r.b}</td>
              <td style={{ ...baCell(false), textAlign: "center", color: "var(--text-3)" }}>→</td>
              <td className="tnum" style={{ ...baCell(false), textAlign: "right", fontWeight: 600, color: colorFor(r.good) }}>{r.a}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// -1 = got worse (bigger), +1 = improved (smaller), 0 = unchanged / unknown.
function cmp(after, before) {
  if (after == null || before == null) return 0;
  if (after < before) return 1;
  if (after > before) return -1;
  return 0;
}

const baCell = (head) => ({
  padding: head ? "8px 18px" : "9px 18px",
  fontSize: head ? "var(--fs-xs)" : "var(--fs-sm)",
  borderBottom: "1px solid var(--border)",
  textTransform: head ? "uppercase" : "none",
  letterSpacing: head ? "0.04em" : "normal",
  fontWeight: head ? 600 : 400,
  color: head ? "var(--text-3)" : "var(--text)",
});

function EmptyState({ onExample, loading }) {
  const headlineExample = EXAMPLES[0]; // single primary CTA runs this
  return (
    <div className="empty-state" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "clamp(20px, 5vw, 48px) 16px 40px" }}>
      <div style={{ width: "100%", maxWidth: "620px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ marginBottom: "16px" }}><Mark size={40} /></div>

        {/* One-line promise */}
        <h1 style={{ fontSize: "clamp(1.5rem, 5.5vw, 1.9rem)", fontWeight: 700, color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.18, marginBottom: "10px" }}>
          Describe a circuit, get a SPICE-verified, buyable design in seconds
        </h1>
        <p style={{ fontSize: "var(--fs-h2)", fontWeight: 400, color: "var(--text-2)", maxWidth: "46ch", lineHeight: 1.55, marginBottom: "16px" }}>
          Plain English in, real parts out — each design proven against the target by a SPICE simulator, with the honest measured error shown.
        </p>

        {/* Trust badge */}
        <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", background: "var(--success-soft)", color: "var(--success)", fontSize: "var(--fs-xs)", fontWeight: 600, padding: "5px 12px", borderRadius: "999px", marginBottom: "22px" }}>
          <span className="pulse-dot" style={{ background: "var(--success)" }} />
          Verified by real ngspice — {SUPPORTED_TYPES.length} circuit types
        </span>

        {/* 20-second demo: a real worked run (measured, not simulated marketing) */}
        <div style={{ width: "100%", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--shadow-sm)", overflow: "hidden", marginBottom: "22px", textAlign: "left" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "9px 14px", borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
            <span style={{ fontSize: "var(--fs-xs)", fontWeight: 600, color: "var(--text-3)", letterSpacing: "0.04em", textTransform: "uppercase" }}>A real run</span>
          </div>
          <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ fontSize: "var(--fs-body)", color: "var(--text)" }}>
              <span style={{ color: "var(--text-3)" }}>“</span>Low-pass filter at 1&nbsp;kHz<span style={{ color: "var(--text-3)" }}>”</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "18px" }}>
              <DemoStat label="Target fc" value="1.000 kHz" />
              <DemoStat label="SPICE-measured" value="994.8 Hz" accent="var(--success)" />
              <DemoStat label="Error" value="0.5%" accent="var(--success)" />
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)", color: "var(--text-2)", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "8px 10px" }}>
              R1 = 1&nbsp;kΩ&nbsp;·&nbsp;C1 = 159&nbsp;nF&nbsp;&nbsp;→&nbsp;&nbsp;buyable BOM, real netlist, 1 reasoning iteration
            </div>
          </div>
        </div>

        {/* Single primary CTA */}
        <button
          onClick={() => onExample(headlineExample)}
          disabled={loading}
          style={{
            background: "var(--accent)", border: "none", borderRadius: "var(--r-sm)", color: "#fff",
            fontSize: "var(--fs-h2)", fontWeight: 600, padding: "13px 28px", minHeight: "44px",
            cursor: loading ? "not-allowed" : "pointer", boxShadow: "var(--shadow-sm)", width: "min(100%, 320px)",
          }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.background = "var(--accent-hover)"; }}
          onMouseLeave={e => { if (!loading) e.currentTarget.style.background = "var(--accent)"; }}
        >
          Try it — design a 1 kHz low-pass
        </button>
        <a href="/api-docs.html" style={{ fontSize: "var(--fs-sm)", color: "var(--text-2)", marginTop: "12px", textDecoration: "none" }}>
          Or build with the API →
        </a>

        {/* Secondary: more example prompts */}
        <div style={{ marginTop: "26px", width: "100%" }}>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-3)", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: "10px" }}>Or try</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "center" }}>
            {EXAMPLES.slice(1).map(ex => (
              <button
                key={ex}
                onClick={() => onExample(ex)}
                disabled={loading}
                style={{
                  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "999px",
                  color: "var(--text)", fontSize: "var(--fs-sm)", fontWeight: 500, padding: "8px 14px", minHeight: "36px",
                  cursor: loading ? "not-allowed" : "pointer",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text)"; }}
              >
                {ex}
              </button>
            ))}
          </div>
        </div>

        <WaitlistForm />
      </div>
    </div>
  );
}

// Early-access / waitlist capture — the cheapest way to measure real demand.
// POSTs { email, source } to REACT_APP_WAITLIST_ENDPOINT (Formspree/Tally/own API);
// if unset, falls back to a mailto so it still works. Remembers "joined" locally.
const WAITLIST_ENDPOINT = process.env.REACT_APP_WAITLIST_ENDPOINT || "";
const WAITLIST_EMAIL = process.env.REACT_APP_WAITLIST_EMAIL || "";
function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState(() => {
    try { return localStorage.getItem("autocda_waitlist") ? "done" : "idle"; } catch { return "idle"; }
  });

  const submit = async () => {
    const value = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) { setState("invalid"); return; }
    setState("submitting");
    const payload = { email: value, source: "autocda-waitlist", ts: new Date().toISOString() };
    try {
      if (WAITLIST_ENDPOINT) {
        const res = await fetch(WAITLIST_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("bad status");
      } else if (WAITLIST_EMAIL) {
        window.location.href = `mailto:${WAITLIST_EMAIL}?subject=${encodeURIComponent("AutoCDA waitlist")}&body=${encodeURIComponent("Add me to the AutoCDA waitlist: " + value)}`;
      }
      try { localStorage.setItem("autocda_waitlist", value); } catch { /* ignore */ }
      setState("done");
    } catch {
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <div style={{ marginTop: "28px", width: "100%", maxWidth: "420px", background: "var(--success-soft)", border: "1px solid var(--success)", color: "var(--success)", borderRadius: "var(--r)", padding: "14px 16px", fontSize: "var(--fs-sm)", fontWeight: 600 }}>
        You're on the list. We'll email you when Pro features land.
      </div>
    );
  }

  return (
    <div style={{ marginTop: "28px", width: "100%", maxWidth: "440px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--shadow-sm)", padding: "16px", textAlign: "left" }}>
      <div style={{ fontSize: "var(--fs-body)", fontWeight: 600, color: "var(--text)", marginBottom: "4px" }}>Get early access</div>
      <div style={{ fontSize: "var(--fs-sm)", color: "var(--text-2)", marginBottom: "12px" }}>
        Pro features coming: multi-objective optimization, private history, exports, India ₹-landed BOM. Join the waitlist.
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); if (state === "invalid" || state === "error") setState("idle"); }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="you@email.com"
          style={{ flex: "1 1 200px", background: "var(--bg-primary)", border: `1px solid ${state === "invalid" ? "var(--danger)" : "var(--border)"}`, borderRadius: "var(--r-sm)", padding: "10px 12px", fontSize: "var(--fs-body)", color: "var(--text-primary)", outline: "none" }}
        />
        <button
          onClick={submit}
          disabled={state === "submitting"}
          style={{ background: "var(--accent)", border: "none", borderRadius: "var(--r-sm)", color: "#fff", fontSize: "var(--fs-body)", fontWeight: 600, padding: "10px 18px", cursor: state === "submitting" ? "progress" : "pointer" }}
          onMouseEnter={(e) => { if (state !== "submitting") e.currentTarget.style.background = "var(--accent-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
        >
          {state === "submitting" ? "…" : "Join waitlist"}
        </button>
      </div>
      {state === "invalid" && <div style={{ color: "var(--danger)", fontSize: "var(--fs-xs)", marginTop: "6px" }}>Enter a valid email.</div>}
      {state === "error" && <div style={{ color: "var(--danger)", fontSize: "var(--fs-xs)", marginTop: "6px" }}>Something went wrong — try again.</div>}
    </div>
  );
}

function DemoStat({ label, value, accent }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-3)", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>{label}</span>
      <span className="tnum" style={{ fontSize: "var(--fs-h2)", fontWeight: 700, color: accent || "var(--text)" }}>{value}</span>
    </div>
  );
}

// Monte-Carlo tolerance sweep: perturb parts within tolerance, run real SPICE
// N times, show the metric distribution + manufacturing yield.
function MonteCarloPanel({ circuit }) {
  const v = circuit.verification;
  const { isPro } = usePro();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);

  if (!v?.verifiable) return null;
  if (!isPro) return <ProUpsell feature="Tolerance analysis" note="Monte-Carlo yield analysis (and multi-objective optimization) — part of Pro. Core design + verification stays free." />;

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

// Distributor links for the BOM. NEUTRAL by design: AutoCDA's value is an unbiased
// multi-seller price comparison, so we never favour one distributor. Base URLs only
// (not secret). When live pricing is on, each offer links to its OWN seller's product
// page (tagged with that seller's referral server-side, if configured). Without live
// pricing we offer a neutral MPN search across several distributors — no default seller.
const DISTRIBUTORS = [
  { id: "mouser", label: "Mouser", search: (mpn) => `https://www.mouser.com/c/?q=${encodeURIComponent(mpn)}`, importer: "https://www.mouser.com/Bom/" },
  { id: "digikey", label: "DigiKey", search: (mpn) => `https://www.digikey.com/en/products/result?keywords=${encodeURIComponent(mpn)}`, importer: "https://www.digikey.com/en/mylists/import" },
  { id: "lcsc", label: "LCSC", search: (mpn) => `https://www.lcsc.com/search?q=${encodeURIComponent(mpn)}`, importer: "" },
];
const DIST_BY_ID = Object.fromEntries(DISTRIBUTORS.map((d) => [d.id, d]));
const distLabel = (id) => (DIST_BY_ID[id] ? DIST_BY_ID[id].label : id);
// Per-row buy options, cheapest first. Priced rows → one entry per seller offer,
// each linking to that seller's product page. Unpriced rows → a neutral search at
// every distributor. Never a single forced seller.
function buyOptionsForRow(r) {
  if (!r) return [];
  if (r.priced && Array.isArray(r.offers) && r.offers.length) {
    return r.offers
      .slice()
      .sort((a, b) => (a.unitPrice ?? Infinity) - (b.unitPrice ?? Infinity))
      .map((o) => ({
        label: distLabel(o.source),
        price: typeof o.unitPrice === "number" ? o.unitPrice : null,
        url: o.link || (DIST_BY_ID[o.source] ? DIST_BY_ID[o.source].search(r.mpn) : null),
      }))
      .filter((o) => o.url);
  }
  if (r.priced && r.link) return [{ label: distLabel(r.priceSource), price: r.unitPrice, url: r.link }];
  if (!r.mpn) return [];
  // Catalog fallback: neutral search at each distributor.
  return DISTRIBUTORS.map((d) => ({ label: d.label, price: null, url: d.search(r.mpn) }));
}
function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
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
  const sites = new Set();
  bom.rows.forEach((r) => { if (r.priced) { sites.add(r.priceSource); (r.offers || []).forEach((o) => sites.add(o.source)); } });
  const nSites = sites.size;
  const offerStr = (r) => (r.offers || []).map((o) => `${o.source} $${Number(o.unitPrice).toFixed(3)}`).join("  ·  ");

  const th = { textAlign: "left", padding: "8px 18px", fontSize: "var(--fs-xs)", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600, borderBottom: "1px solid var(--border)" };
  const thR = { ...th, textAlign: "right" };
  const td = { padding: "9px 18px", fontSize: "var(--fs-sm)", borderBottom: "1px solid var(--border)" };
  const tdR = { ...td, textAlign: "right", fontFamily: "var(--font-mono)" };

  // Neutral full-BOM export: download the CSV to upload into ANY distributor's BOM
  // importer. We don't force a single seller — importer links are offered for each.
  const handleDownloadCsv = () => {
    try { downloadText(`autocda-bom-${circuit.id || "design"}.csv`, buildBomCsv(bom)); } catch { /* ignore */ }
  };
  const importers = DISTRIBUTORS.filter((d) => d.importer);
  const buyLinkStyle = { fontSize: "var(--fs-xs)", fontWeight: 600, color: "var(--accent)", textDecoration: "none", whiteSpace: "nowrap" };

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
          }}>{pricing === "live" ? (nSites > 1 ? `best of ${nSites} sites` : "live prices") : pricing === "loading" ? "comparing…" : "catalog"}</span>
          <span className="tnum" style={{ fontSize: "var(--fs-sm)", color: "var(--text-2)", fontWeight: 600 }}>${bom.total.toFixed(2)} / unit</span>
          <span style={{ color: "var(--text-3)", display: "inline-flex" }}><IconChevron dir={open ? "down" : "right"} /></span>
        </span>
      </button>
      {open && (
       <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", padding: "10px 18px", borderTop: "1px solid var(--border)", background: "var(--surface-2)", flexWrap: "wrap" }}>
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-3)" }}>
            {anyPriced ? "Compare sellers per part, cheapest first — buy from whichever you prefer." : "No live prices — search each part at any distributor."}
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            {importers.length > 0 && (
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-3)" }}>
                Import full BOM to{" "}
                {importers.map((d, k) => (
                  <React.Fragment key={d.id}>
                    {k > 0 ? " · " : " "}
                    <a href={d.importer} target="_blank" rel="noopener noreferrer nofollow sponsored" style={buyLinkStyle}>{d.label}</a>
                  </React.Fragment>
                ))}
              </span>
            )}
            <ProGate feature="BOM export" label="Pro — export">
              <button
                onClick={handleDownloadCsv}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "var(--accent)", border: "none", borderRadius: "var(--r-sm)", color: "#fff", fontSize: "var(--fs-sm)", fontWeight: 600, padding: "7px 14px", cursor: "pointer" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--accent)"; }}
                title="Download the BOM as CSV to upload into any distributor's BOM tool"
              >
                Download BOM (CSV)
              </button>
            </ProGate>
          </span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", borderTop: "1px solid var(--border)" }}>
          <thead>
            <tr>
              <th style={th}>Ref</th>
              <th style={th}>Value</th>
              <th style={th}>MPN</th>
              <th style={thR}>Qty</th>
              <th style={thR}>Unit</th>
              <th style={thR}>Line</th>
              {anyPriced && <th style={th}>From</th>}
              {anyPriced && <th style={thR}>Stock</th>}
              <th style={thR}>Buy</th>
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
                {anyPriced && (
                  <td style={{ ...td, fontSize: "var(--fs-xs)", color: "var(--text-2)" }} title={r.priced ? offerStr(r) : "bundled catalog price"}>
                    {r.priced
                      ? (<span><span style={{ fontWeight: 600, color: "var(--success)" }}>{r.priceSource}</span>{r.offers && r.offers.length > 1 ? <span style={{ color: "var(--text-3)" }}> +{r.offers.length - 1}</span> : null}</span>)
                      : <span style={{ color: "var(--text-3)" }}>catalog</span>}
                  </td>
                )}
                {anyPriced && <td className="tnum" style={{ ...tdR, color: "var(--text-3)", fontSize: "var(--fs-xs)" }}>{r.priced && r.stock != null ? r.stock.toLocaleString() : r.priced ? "—" : "—"}</td>}
                <td style={{ ...tdR, fontFamily: "inherit" }}>
                  {(() => {
                    const opts = buyOptionsForRow(r);
                    if (!opts.length) return <span style={{ color: "var(--text-3)" }}>—</span>;
                    return (
                      <span style={{ display: "inline-flex", flexWrap: "wrap", gap: "4px 8px", justifyContent: "flex-end" }}>
                        {opts.slice(0, 4).map((o, k) => (
                          <a key={k} href={o.url} target="_blank" rel="noopener noreferrer nofollow sponsored" style={buyLinkStyle}
                             title={`Buy ${r.mpn} at ${o.label}`}>
                            {o.label}{o.price != null ? ` $${o.price.toFixed(3)}` : ""} ↗
                          </a>
                        ))}
                      </span>
                    );
                  })()}
                </td>
              </tr>
            ))}
            <tr>
              <td style={{ ...td, borderBottom: "none" }} colSpan={5}>
                <span style={{ fontWeight: 600 }}>Total per unit</span>
              </td>
              <td className="tnum" style={{ ...tdR, borderBottom: "none", color: "var(--text)", fontWeight: 700 }}>${bom.total.toFixed(3)}</td>
              {anyPriced && <td style={{ ...td, borderBottom: "none", fontSize: "var(--fs-xs)", color: "var(--text-3)" }}>{nSites > 1 ? "best per part" : ""}</td>}
              {anyPriced && <td style={{ ...td, borderBottom: "none" }} />}
              <td style={{ ...tdR, borderBottom: "none" }}>
                <ProGate feature="BOM export" label="Pro">
                  <button onClick={handleDownloadCsv} style={{ ...buyLinkStyle, background: "none", border: "none", cursor: "pointer" }} title="Download BOM CSV">CSV ↓</button>
                </ProGate>
              </td>
            </tr>
          </tbody>
        </table>
       </>
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
