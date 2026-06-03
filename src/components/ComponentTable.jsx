import React, { useState, useEffect } from "react";
import { parseDisplayValue, formatResistance, formatCapacitance, formatVoltage, formatCurrent } from "../utils/circuitFormulas";

function autoFormat(rawValue, unit) {
  if (rawValue == null) return null;
  if (unit === 'Ω') return formatResistance(rawValue);
  if (unit === 'F') return formatCapacitance(rawValue);
  if (unit === 'V') return formatVoltage(rawValue);
  if (unit === 'A') return formatCurrent(rawValue);
  return String(rawValue);
}

function EditableCell({ component, onCommit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(component.display);

  useEffect(() => {
    if (!editing) setDraft(component.display);
  }, [component.display, editing]);

  if (!component.editable) {
    return <span style={{ color: "#58a6ff", fontFamily: "'JetBrains Mono', monospace" }}>{component.display}</span>;
  }

  const commit = () => {
    setEditing(false);
    const raw = parseDisplayValue(draft, component.unit);
    if (raw !== null && raw > 0) {
      onCommit(component.ref, raw);
    } else {
      setDraft(component.display);
    }
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setEditing(false); setDraft(component.display); } }}
        style={{
          background: "#0d1117", border: "1px solid #58a6ff", borderRadius: "4px",
          color: "#58a6ff", fontFamily: "'JetBrains Mono', monospace", fontSize: "13px",
          padding: "2px 6px", width: "120px", outline: "none",
        }}
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      title="Click to edit"
      style={{
        color: "#58a6ff", fontFamily: "'JetBrains Mono', monospace",
        cursor: "text", borderBottom: "1px dashed #30363d",
        paddingBottom: "1px",
      }}
    >
      {component.display}
      <span style={{ color: "#484f58", fontSize: "10px", marginLeft: "4px" }}>✎</span>
    </span>
  );
}

export default function ComponentTable({ circuit, visible, onComponentChange, expanded, onToggleExpand }) {
  if (!circuit) {
    return (
      <div style={{ ...panelStyle, height: "40px" }}>
        <PanelHeader expanded={expanded} onToggle={onToggleExpand} />
      </div>
    );
  }

  return (
    <div style={{
      opacity: visible ? 1 : 0,
      transition: "opacity 0.4s ease",
      position: expanded ? "absolute" : "relative",
      top: expanded ? "0" : "auto",
      left: expanded ? "0" : "auto",
      right: expanded ? "0" : "auto",
      width: expanded ? "100%" : "auto",
      zIndex: expanded ? 100 : 10,
      maxHeight: expanded ? "300px" : "40px",
      overflow: expanded ? "hidden" : "visible",
    }}>
      <div style={{ ...panelStyle, height: "100%" }}>
        <PanelHeader expanded={expanded} onToggle={onToggleExpand} />
        {expanded && (
          <div style={{ overflowY: "auto", maxHeight: "260px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#21262d" }}>
                  <th style={thStyle}>Ref</th>
                  <th style={thStyle}>Value</th>
                  <th style={thStyle}>Description</th>
                </tr>
              </thead>
              <tbody>
                {circuit.components.map((c, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#1c2128" : "#1a1f27" }}>
                    <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", color: "#8b949e" }}>{c.ref}</td>
                    <td style={{ ...tdStyle }}>
                      <EditableCell
                        component={c}
                        onCommit={(ref, rawValue) => onComponentChange && onComponentChange(ref, rawValue)}
                      />
                    </td>
                    <td style={{ ...tdStyle, color: "#8b949e" }}>{c.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: "6px 16px 8px", fontSize: "10px", color: "#484f58", fontFamily: "'JetBrains Mono', monospace" }}>
              Click any value to edit — graph updates live
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PanelHeader({ expanded, onToggle }) {
  return (
    <div
      onClick={onToggle}
      style={{
        padding: "10px 16px 8px",
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
      <span>COMPONENT LIST</span>
      <span style={{ color: "#58a6ff", fontSize: "12px" }}>{expanded ? "▼" : "▶"}</span>
    </div>
  );
}

const panelStyle = { background: "#1c2128", border: "1px solid #30363d", borderRadius: "8px", overflow: "hidden" };
const thStyle    = { padding: "8px 16px", textAlign: "left", fontSize: "11px", color: "#8b949e", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, borderBottom: "1px solid #30363d" };
const tdStyle    = { padding: "8px 16px", fontSize: "13px", color: "#e6edf3", fontFamily: "'Segoe UI', system-ui, sans-serif", borderBottom: "1px solid #21262d" };
