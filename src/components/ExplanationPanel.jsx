import React from "react";
import { generateKicadSch } from "../utils/kicadExport";
import { getCircuitJSUrl } from "../utils/circuitjs";
import { downloadEasyEDAJson } from "../utils/easyedaschema";
import { buildBOM, buildBOMPriced, buildBomCsv } from "../design/bom";
import { cached, makeMouserPriceSource } from "../design/distributorPricing";

// Live pricing source, built once if a proxy URL is configured (non-secret URL;
// the distributor key lives only in that proxy). Falls back to the static catalog.
const PRICING_PROXY = process.env.REACT_APP_PRICING_PROXY;
const PRICE_SOURCE = PRICING_PROXY ? cached(makeMouserPriceSource({ baseUrl: PRICING_PROXY })) : null;

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

  const handleExportBom = async () => {
    if (!circuit) return;
    // Live distributor pricing when a proxy is configured; static catalog otherwise.
    const bom = PRICE_SOURCE
      ? await buildBOMPriced(circuit.components, { source: PRICE_SOURCE })
      : buildBOM(circuit.components);
    downloadFile(buildBomCsv(bom), `${circuit.id}_bom.csv`, "text/csv");
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
        <div style={{ padding: "16px 18px" }}>
          <p style={{ color: "var(--text-2)", fontSize: "var(--fs-sm)", lineHeight: 1.6, maxWidth: "68ch", margin: "0 0 16px 0" }}>
            {circuit.explanation}
          </p>
          <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600, marginBottom: "8px" }}>
            Export
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            <ExportButton onClick={handleExportBom} label="BOM (CSV)" />
            <ExportButton onClick={handleExportSpice} label="SPICE netlist" />
            <ExportButton onClick={handleExportKicad} label="KiCad" />
            <ExportButton onClick={handleExportEasyEDA} label="Altium (JSON)" />
            {getCircuitJSUrl(circuit) && (
              <ExportButton onClick={() => window.open(getCircuitJSUrl(circuit), "_blank")} label="Open in CircuitJS" external />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2.5v7.5" /><path d="M4.5 7L8 10.3 11.5 7" /><path d="M3 13h10" />
    </svg>
  );
}
function ExternalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3H3.5v9.5H13V10" /><path d="M9 3h4v4" /><path d="M13 3L7.5 8.5" />
    </svg>
  );
}

function ExportButton({ onClick, label, external }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", gap: "7px",
        background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
        color: "var(--text)", fontSize: "var(--fs-sm)", fontWeight: 500, padding: "7px 12px", cursor: "pointer",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text)"; }}
    >
      <span style={{ display: "inline-flex", color: "var(--text-3)" }}>{external ? <ExternalIcon /> : <DownloadIcon />}</span>
      {label}
    </button>
  );
}

function PanelHeader({ expanded, onToggle }) {
  return (
    <div
      onClick={onToggle}
      style={{
        padding: "13px 18px",
        fontSize: "var(--fs-body)",
        color: "var(--text)",
        fontWeight: 600,
        borderBottom: expanded ? "1px solid var(--border)" : "none",
        cursor: "pointer",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        userSelect: "none",
      }}
    >
      <span>Explanation and exports</span>
      <span style={{ color: "var(--text-3)", display: "inline-flex" }}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: expanded ? "rotate(90deg)" : "none", transition: "transform 160ms var(--ease)" }}>
          <path d="M6 3.5L10.5 8L6 12.5" />
        </svg>
      </span>
    </div>
  );
}

const panelStyle = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r)",
  boxShadow: "var(--shadow-sm)",
  overflow: "hidden",
};
