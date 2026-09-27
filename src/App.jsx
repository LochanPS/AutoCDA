import React, { useState, useCallback, useRef } from "react";
import "./App.css";
import ProcessingLog from "./components/ProcessingLog";
import SchematicPanel from "./components/SchematicPanel";
import GraphPanel from "./components/GraphPanel";
import ComponentTable from "./components/ComponentTable";
import ExplanationPanel from "./components/ExplanationPanel";
import CircuitJSPanel from "./components/CircuitJSPanel";
import SpecCard from "./components/SpecCard";

import { parsePrompt } from "./utils/circuitParser";
import { makeSpec, SUPPORTED_TYPES } from "./spec/circuitSpec";
import { calculateCircuit, recalculateFromComponents } from "./utils/circuitFormulas";

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
    text: "Hello. I am AutoCDA — Automatic Circuit Design Assistant. Type a circuit description or select a quick request below to begin.",
  },
];

export default function App() {
  const [messages, setMessages]       = useState(INITIAL_MESSAGES);
  const [selectedCircuit, setSelectedCircuit] = useState(null);
  const [loading, setLoading]         = useState(false);
  const [logSteps, setLogSteps]       = useState([]);
  const [inputText, setInputText]     = useState("");
  const [parseError, setParseError]   = useState("");
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [pendingSpec, setPendingSpec] = useState(null);   // CircuitSpec awaiting confirm

  const [showSchematic,      setShowSchematic]      = useState(false);
  const [showGraph,          setShowGraph]          = useState(false);
  const [showTable,          setShowTable]          = useState(false);
  const [showExplanation,    setShowExplanation]    = useState(false);
  const [showCircuitJS,      setShowCircuitJS]      = useState(false);
  const [expandComponents,   setExpandComponents]   = useState(false);
  const [expandExplanation,  setExpandExplanation]  = useState(false);

  const inputRef = useRef(null);

  // Core: run a circuit design given id + params
  const runCircuit = useCallback((circuitId, params, promptText) => {
    if (loading) return;
    setParseError("");

    const circuitData = calculateCircuit(circuitId, params);
    if (!circuitData) return;

    // Merge static fields (kicadSchematic, kicadNetlist) from static files
    const staticData = STATIC[circuitId] || {};
    const merged = {
      ...circuitData,
      kicadSchematic: staticData.kicadSchematic,
      kicadNetlist:   staticData.kicadNetlist,
      // keep schematic SVG path from static
    };

    setLoading(true);
    setShowSchematic(false);
    setShowGraph(false);
    setShowTable(false);
    setShowExplanation(false);
    setShowCircuitJS(false);

    setMessages(prev => [...prev, { role: "user", text: promptText }]);
    setLogSteps(circuitData.processingSteps);

    setTimeout(() => {
      setMessages(prev => [
        ...prev,
        { role: "system", text: `Circuit identified: ${circuitData.name}. Computing component values from design equations (analytical — not yet SPICE-verified). Results displayed on the right.` },
      ]);
    }, 1500);

    setSelectedCircuit(merged);

    setTimeout(() => setShowSchematic(true),   1600);
    setTimeout(() => setShowGraph(true),        1800);
    setTimeout(() => setShowCircuitJS(true),    1900);
    setTimeout(() => setShowTable(true),        2000);
    setTimeout(() => setShowExplanation(true),  2100);
    setTimeout(() => setLoading(false),         2200);
  }, [loading]);

  // Text input submit
  const handleTextSubmit = useCallback(() => {
    const text = inputText.trim();
    if (!text || loading) return;

    const spec = parsePrompt(text);
    if (spec.confidence === 0 || !spec.type) {
      // No match: prompt user to pick a type instead of running anything.
      setParseError("Couldn't identify a circuit. Try: \"low pass filter 2kHz\", or pick a type below.");
      setShowTypePicker(true);
      setPendingSpec(null);
      return;
    }
    // Show the editable confirm card BEFORE running.
    setParseError("");
    setShowTypePicker(false);
    setPendingSpec(spec);
  }, [inputText, loading]);

  // User picked a type from the fallback picker → open an empty spec card.
  const handlePickType = useCallback((type) => {
    setParseError("");
    setShowTypePicker(false);
    setPendingSpec(makeSpec({ type, targets: {}, confidence: 1, assumed: [] }));
  }, []);

  // Confirm card actions
  const handleRunSpec = useCallback(() => {
    if (!pendingSpec) return;
    const text = inputText.trim() || pendingSpec.type;
    setInputText("");
    const spec = pendingSpec;
    setPendingSpec(null);
    runCircuit(spec.type, spec.targets, text);
  }, [pendingSpec, inputText, runCircuit]);

  const handleCancelSpec = useCallback(() => {
    setPendingSpec(null);
  }, []);


  // Component value edit → live recalculate
  const handleComponentChange = useCallback((ref, newRawValue) => {
    if (!selectedCircuit) return;
    setSelectedCircuit(prev => {
      const updatedComponents = prev.components.map(c => {
        if (c.ref !== ref) return c;
        return { ...c, rawValue: newRawValue };
      });
      const recalculated = recalculateFromComponents(prev.id, updatedComponents);
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
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0d1117", overflow: "hidden" }}>
      <TopBar />
      <div style={{ display: "flex", flex: 1, overflow: "hidden", padding: "12px", gap: "12px", minHeight: 0 }}>

        {/* Left column */}
        <div style={{
          width: "340px", flexShrink: 0, display: "flex", flexDirection: "column",
          background: "#161b22", border: "1px solid #30363d", borderRadius: "10px", overflow: "hidden",
        }}>
          {/* Chat messages */}
          <div style={{ flex: "1 1 0", overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "12px", minHeight: 0 }}>
            <ChatMessages messages={messages} />
          </div>

          {/* Scrollable bottom section */}
          <div style={{ flex: "0 1 auto", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px", minHeight: 0, padding: "0 12px 12px" }}>
            {/* Text input */}
            <div style={{ flexShrink: 0 }}>
              <div style={{ fontSize: "10px", letterSpacing: "0.08em", color: "#8b949e", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, marginBottom: "6px" }}>
                DESCRIBE A CIRCUIT
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <input
                  ref={inputRef}
                  value={inputText}
                  onChange={e => { setInputText(e.target.value); setParseError(""); }}
                  onKeyDown={e => e.key === "Enter" && handleTextSubmit()}
                  placeholder="e.g. low pass filter 2kHz"
                  disabled={loading}
                  style={{
                    flex: 1, background: "#0d1117", border: "1px solid #30363d", borderRadius: "6px",
                    padding: "8px 10px", color: "#e6edf3", fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "11px", outline: "none",
                    opacity: loading ? 0.5 : 1,
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = "#58a6ff"; }}
                  onBlur={e => { e.currentTarget.style.borderColor = "#30363d"; }}
                />
                <button
                  onClick={handleTextSubmit}
                  disabled={loading}
                  style={{
                    background: loading ? "#1a1f27" : "#1f6feb", border: "none", borderRadius: "6px",
                    color: loading ? "#484f58" : "#fff", fontFamily: "'JetBrains Mono', monospace",
                    fontSize: "11px", padding: "8px 12px", cursor: loading ? "not-allowed" : "pointer",
                  }}
                >
                  →
                </button>
              </div>
              {parseError && (
                <div style={{ color: "#f85149", fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", marginTop: "4px", lineHeight: 1.4 }}>
                  {parseError}
                </div>
              )}
              {showTypePicker && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "8px" }}>
                  {SUPPORTED_TYPES.map(t => (
                    <button
                      key={t.id}
                      onClick={() => handlePickType(t.id)}
                      style={{
                        background: "#1a1f27", border: "1px solid #30363d", borderRadius: "6px",
                        color: "#8b949e", fontFamily: "'JetBrains Mono', monospace", fontSize: "10px",
                        padding: "5px 8px", cursor: "pointer",
                      }}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Confirm-before-run spec card */}
            {pendingSpec && (
              <SpecCard
                spec={pendingSpec}
                onChange={setPendingSpec}
                onRun={handleRunSpec}
                onCancel={handleCancelSpec}
              />
            )}

            {/* Processing log */}
            <ProcessingLog steps={logSteps} />

            {/* Component dropdown */}
            <ComponentTable
              circuit={selectedCircuit}
              visible={showTable}
              onComponentChange={handleComponentChange}
              expanded={expandComponents}
              onToggleExpand={() => setExpandComponents(!expandComponents)}
            />

            {/* Explanation + exports */}
            <ExplanationPanel
              circuit={selectedCircuit}
              visible={showExplanation}
              expanded={expandExplanation}
              onToggle={() => setExpandExplanation(!expandExplanation)}
            />
          </div>
        </div>

        {/* Right column */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "10px", overflow: "hidden", minWidth: 0 }}>
          <div style={{ flex: "0 0 30%", display: "flex", gap: "10px", minHeight: 0 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <SchematicPanel circuit={selectedCircuit} visible={showSchematic} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <GraphPanel circuit={selectedCircuit} visible={showGraph} />
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <CircuitJSPanel circuit={selectedCircuit} visible={showCircuitJS} />
          </div>
        </div>
      </div>
    </div>
  );
}

function TopBar() {
  return (
    <div style={{ height: "56px", background: "#161b22", borderBottom: "1px solid #30363d", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", flexShrink: 0 }}>
      <div style={{ fontWeight: 700, fontSize: "16px", color: "#e6edf3", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
        AutoCDA <span style={{ color: "#8b949e", fontWeight: 400 }}>v1.0</span>
        <span style={{ color: "#484f58", fontWeight: 400, fontSize: "14px" }}> — Automatic Circuit Design Assistant</span>
      </div>
      <div style={{ display: "flex", gap: "10px" }}>
        {["NLP: Rule Engine", "Engine: Analytical", "Renderer: Schemdraw"].map(label => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: "6px", background: "#1a3a1a", border: "1px solid #3fb950", borderRadius: "20px", padding: "4px 12px", fontSize: "12px", color: "#3fb950", fontFamily: "'JetBrains Mono', monospace" }}>
            <span className="pulse-dot" />{label}
          </div>
        ))}
      </div>
    </div>
  );
}

function ChatMessages({ messages }) {
  const endRef = React.useRef(null);
  React.useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  return (
    <>
      {messages.map((msg, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
          <div style={{ fontSize: "10px", color: "#8b949e", marginBottom: "4px", fontFamily: "'Segoe UI', system-ui, sans-serif", paddingLeft: msg.role === "user" ? 0 : "4px", paddingRight: msg.role === "user" ? "4px" : 0 }}>
            {msg.role === "user" ? "YOU" : "AutoCDA"}
          </div>
          <div style={{ maxWidth: "90%", padding: "10px 14px", borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px", background: msg.role === "user" ? "#1f6feb" : "#21262d", color: "#e6edf3", fontSize: "13px", lineHeight: "1.5", fontFamily: "'Segoe UI', system-ui, sans-serif", border: msg.role === "user" ? "none" : "1px solid #30363d" }}>
            {msg.text}
          </div>
        </div>
      ))}
      <div ref={endRef} />
    </>
  );
}
