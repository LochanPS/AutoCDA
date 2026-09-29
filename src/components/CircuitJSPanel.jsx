import React, { useEffect, useRef } from "react";
import { getCircuitJSEmbed } from "../utils/circuitjs";

export default function CircuitJSPanel({ circuit, visible }) {
  const iframeRef = useRef(null);

  useEffect(() => {
    if (!circuit || !iframeRef.current) return;

    const embed = getCircuitJSEmbed(circuit);
    if (!embed) return;

    // Post message to iframe to load new circuit
    iframeRef.current.contentWindow.postMessage(
      { type: "load_circuit", circuit: embed },
      "https://www.falstad.com"
    );
  }, [circuit]);

  if (!circuit) {
    return (
      <div style={panelStyle}>
        <PanelHeader />
        <div style={emptyStyle}>No simulation loaded</div>
      </div>
    );
  }

  const embed = getCircuitJSEmbed(circuit);
  if (!embed) {
    return (
      <div style={panelStyle}>
        <PanelHeader />
        <div style={emptyStyle}>Circuit not supported in browser simulator</div>
      </div>
    );
  }

  return (
    <div style={{ ...panelStyle, opacity: visible ? 1 : 0, transition: "opacity 0.3s ease" }}>
      <PanelHeader />
      <iframe
        ref={iframeRef}
        src={`https://www.falstad.com/circuit/circuitjs.html?${embed}`}
        style={{ width: "100%", flex: 1, minHeight: "360px", border: "none" }}
        title="CircuitJS Simulator"
      />
    </div>
  );
}

function PanelHeader() {
  return (
    <div style={{
      padding: "13px 18px",
      fontSize: "var(--fs-sm)",
      color: "var(--text-2)",
      fontWeight: 600,
      borderBottom: "1px solid var(--border)",
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    }}>
      <span>Live simulator</span>
      <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-3)", fontWeight: 500 }}>Powered by CircuitJS</span>
    </div>
  );
}

const panelStyle = {
  width: "100%",
  height: "100%",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r)",
  boxShadow: "var(--shadow-sm)",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const emptyStyle = {
  color: "var(--text-3)",
  fontSize: "var(--fs-sm)",
  padding: "16px",
  margin: "auto",
};
