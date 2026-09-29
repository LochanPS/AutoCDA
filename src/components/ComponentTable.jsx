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
    return <span style={{ color: "#2f6feb", fontFamily: "'JetBrains Mono', monospace" }}>{component.display}</span>;
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
        className="tnum"
        style={{
          background: "var(--surface)", border: "1px solid var(--accent)", borderRadius: "6px",
          color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: "var(--fs-sm)",
          padding: "3px 7px", width: "120px", outline: "none", boxShadow: "0 0 0 3px var(--accent-soft)",
        }}
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      title="Click to edit"
      className="tnum"
      style={{
        color: "var(--accent)", fontFamily: "var(--font-mono)", fontWeight: 500,
        cursor: "text", borderBottom: "1px dashed var(--border-strong)", paddingBottom: "1px",
      }}
    >
      {component.display}
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
    <div style={{ opacity: visible ? 1 : 0, transition: "opacity 0.3s ease" }}>
      <div style={panelStyle}>
        <PanelHeader expanded={expanded} onToggle={onToggleExpand} />
        {expanded && (
          <div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Ref</th>
                  <th style={thStyle}>Value</th>
                  <th style={thStyle}>Description</th>
                </tr>
              </thead>
              <tbody>
                {circuit.components.map((c, i) => (
                  <tr key={i}>
                    <td style={{ ...tdStyle, fontFamily: "var(--font-mono)", color: "var(--text-2)" }}>{c.ref}</td>
                    <td style={{ ...tdStyle }}>
                      <EditableCell
                        component={c}
                        onCommit={(ref, rawValue) => onComponentChange && onComponentChange(ref, rawValue)}
                      />
                    </td>
                    <td style={{ ...tdStyle, color: "var(--text-2)" }}>{c.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: "10px 18px 12px", fontSize: "var(--fs-xs)", color: "var(--text-3)" }}>
              Click any value to edit. The response and simulator update live.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Chevron({ open }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 160ms var(--ease)" }}>
      <path d="M6 3.5L10.5 8L6 12.5" />
    </svg>
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
      <span>Component list</span>
      <span style={{ color: "var(--text-3)", display: "inline-flex" }}><Chevron open={expanded} /></span>
    </div>
  );
}

const panelStyle = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r)", overflow: "hidden", boxShadow: "var(--shadow-sm)" };
const thStyle    = { padding: "9px 18px", textAlign: "left", fontSize: "var(--fs-xs)", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid var(--border)" };
const tdStyle    = { padding: "10px 18px", fontSize: "var(--fs-sm)", color: "var(--text)", borderBottom: "1px solid var(--border)" };
