import React from "react";
import { generateKicadSch } from "../utils/kicadExport";
import { getCircuitJSUrl } from "../utils/circuitjs";
import { downloadEasyEDAJson } from "../utils/easyedaschema";

export default function ExplanationPanel({ circuit, visible, expanded, onToggle }) {
  const downloadFile = (content, filename, mime) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportSpice = () => {
    if (!circuit) return;
    downloadFile(circuit.netlist, `${circuit.id}_netlist.txt`, "text/plain");
  };

  const handleExportKicad = () => {
    if (!circuit) return;
    downloadFile(generateKicadSch(circuit), `${circuit.id}.kicad_sch`, "text/plain");
  };

  const handleExportEasyEDA = () => {
    if (!circuit) return;
    downloadEasyEDAJson(circuit);
  };

  const isCollapsible = true; // Always collapsible in sidebar
  const shouldExpand = isCollapsible ? (expanded !== false) : true;

  if (!circuit) {
    return (
      <div style={{ ...panelStyle, height: "40px" }}>
        <PanelHeader expanded={shouldExpand} onToggle={onToggle} />
      </div>
    );
  }

  return (
    <div style={{ ...panelStyle, opacity: visible ? 1 : 0, transition: "opacity 0.4s ease" }}>
      <PanelHeader expanded={shouldExpand} onToggle={onToggle} />
      {shouldExpand && (
        <div style={{ padding: "10px 12px", maxHeight: "200px", overflowY: "auto" }}>
          <p style={{
            color: "#8b949e",
            fontFamily: "'Segoe UI', system-ui, sans-serif",
            fontSize: "11px",
            lineHeight: "1.5",
            margin: "0 0 10px 0",
          }}>
            {circuit.explanation}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            <button
              onClick={handleExportSpice}
              style={btnStyleSmall("#58a6ff")}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#1f3a5f"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              ↓ SPICE
            </button>
            <button
              onClick={handleExportKicad}
              style={btnStyleSmall("#d29922")}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#2d2000"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              ↓ KiCad
            </button>
            {getCircuitJSUrl(circuit) && (
              <button
                onClick={() => window.open(getCircuitJSUrl(circuit), "_blank")}
                style={btnStyleSmall("#3fb950")}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#0d2b0d"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                ▶ CircuitJS
              </button>
            )}
            <button
              onClick={handleExportEasyEDA}
              style={btnStyleSmall("#a371f7")}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#2d1d4a"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              ↓ Altium (JSON)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PanelHeader({ expanded, onToggle }) {
  return (
    <div
      onClick={onToggle}
      style={{
        padding: "10px 12px 8px",
        fontSize: "10px",
        letterSpacing: "0.08em",
        color: "#8b949e",
        fontFamily: "'JetBrains Mono', monospace",
        fontWeight: 600,
        borderBottom: "1px solid #30363d",
        cursor: "pointer",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        userSelect: "none",
      }}
    >
      <span>DESIGN EXPLANATION</span>
      <span style={{ color: "#58a6ff", fontSize: "12px" }}>{expanded ? "▼" : "▶"}</span>
    </div>
  );
}

function btnStyle(color, hoverBg) {
  return {
    background: "transparent",
    border: `1px solid ${color}`,
    borderRadius: "6px",
    color: color,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "12px",
    padding: "6px 16px",
    cursor: "pointer",
    transition: "background 0.2s",
  };
}

function btnStyleSmall(color) {
  return {
    background: "transparent",
    border: `1px solid ${color}`,
    borderRadius: "4px",
    color: color,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: "10px",
    padding: "4px 8px",
    cursor: "pointer",
    transition: "background 0.2s",
    textAlign: "center",
  };
}

const panelStyle = {
  background: "#161b22",
  border: "1px solid #30363d",
  borderRadius: "8px",
  overflow: "hidden",
};

const emptyStyle = {
  color: "#484f58",
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: "13px",
  padding: "16px",
};
