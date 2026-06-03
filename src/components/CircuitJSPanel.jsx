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
    <div style={{ ...panelStyle, opacity: visible ? 1 : 0, transition: "opacity 0.4s ease" }}>
      <PanelHeader />
      <iframe
        ref={iframeRef}
        src={`https://www.falstad.com/circuit/circuitjs.html?${embed}`}
        style={{
          width: "100%", height: "400px", border: "none", borderRadius: "8px"
        }}
        title="CircuitJS Simulator"
      />
    </div>
  );
}

function PanelHeader() {
  return (
    <div style={{
      padding: "10px 16px 8px",
      fontSize: "10px",
      letterSpacing: "0.08em",
      color: "#8b949e",
      fontFamily: "'JetBrains Mono', monospace",
      fontWeight: 600,
      borderBottom: "1px solid #30363d",
    }}>
      LIVE SIMULATOR (CircuitJS)
    </div>
  );
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
