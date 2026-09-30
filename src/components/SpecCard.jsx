import React from "react";
import { SUPPORTED_TYPES, makeSpec, validateSpec } from "../spec/circuitSpec";

// Human labels + units for each target field key (keys match circuitParser).
const FIELD_META = {
  fc: { label: "Cutoff frequency", unit: "Hz" },
  fL: { label: "Low cutoff", unit: "Hz" },
  fH: { label: "High cutoff", unit: "Hz" },
  f: { label: "Frequency", unit: "Hz" },
  Vin: { label: "Input voltage", unit: "V" },
  Vout: { label: "Output voltage", unit: "V" },
  Vsupply: { label: "Supply voltage", unit: "V" },
  Vz: { label: "Zener voltage", unit: "V" },
  I: { label: "Current", unit: "A" },
  Av: { label: "Gain", unit: "×" },
};

const E_SERIES = ["E12", "E24", "E96"];

const labelStyle = {
  display: "block", fontSize: "var(--fs-xs)", color: "var(--text-2)",
  fontWeight: 600, marginBottom: "5px",
};
const controlStyle = {
  width: "100%", background: "var(--surface)", border: "1px solid var(--border)",
  borderRadius: "var(--r-sm)", padding: "9px 11px", color: "var(--text)",
  fontSize: "var(--fs-body)", outline: "none",
};
const focusOn = (e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.boxShadow = "0 0 0 3px var(--accent-soft)"; };
const focusOff = (e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; };

function AlertIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2.2L14.4 13H1.6L8 2.2z" /><path d="M8 6.6v3" /><path d="M8 11.6h.01" />
    </svg>
  );
}
function BoltIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M9 1.5L3.5 9H7l-1 5.5L12.5 7H9l0-5.5z" />
    </svg>
  );
}
function SparkIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 2.5l1.2 3.3L12.5 7 9.2 8.2 8 11.5 6.8 8.2 3.5 7l3.3-1.2L8 2.5z" />
    </svg>
  );
}

const SOURCE_META = {
  fast: { label: "Fast match", Icon: BoltIcon },
  llm: { label: "AI match", Icon: SparkIcon },
  manual: { label: "Manual", Icon: null },
};

function SourceChip({ source }) {
  const m = SOURCE_META[source];
  if (!m) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "var(--fs-xs)", fontWeight: 600, color: "var(--text-2)", background: "var(--surface-2)", border: "1px solid var(--border)", padding: "3px 9px", borderRadius: "999px" }}>
      {m.Icon ? <span style={{ display: "inline-flex", color: "var(--accent)" }}><m.Icon /></span> : null}
      {m.label}
    </span>
  );
}

/**
 * Confirm-before-run editable spec card.
 * @param {object}   props
 * @param {import('../spec/circuitSpec').CircuitSpec} props.spec
 * @param {(spec) => void} props.onChange
 * @param {() => void}     props.onRun
 * @param {() => void}     props.onCancel
 */
export default function SpecCard({ spec, onChange, onRun, onCancel, source = "fast", lowConfidence = false, llmInLoop = false, onLlmInLoopChange, hasKey = false }) {
  if (!spec) return null;

  const typeDef = SUPPORTED_TYPES.find((t) => t.id === spec.type);
  const fields = typeDef ? typeDef.fields : [];
  const { ok, errors } = validateSpec(spec);

  const handleTypeChange = (newType) => {
    const nextDef = SUPPORTED_TYPES.find((t) => t.id === newType);
    const nextTargets = {};
    if (nextDef) {
      for (const f of nextDef.fields) {
        if (spec.targets[f] !== undefined) nextTargets[f] = spec.targets[f];
      }
    }
    onChange(makeSpec({ ...spec, type: newType, targets: nextTargets, assumed: [] }));
  };

  const handleTargetChange = (field, raw) => {
    const num = raw === "" ? NaN : parseFloat(raw);
    const assumed = (spec.assumed || []).filter((a) => !a.startsWith(`${field} `));
    onChange(makeSpec({ ...spec, targets: { ...spec.targets, [field]: num }, assumed }));
  };

  const handleConstraintChange = (key, value) => {
    onChange(makeSpec({ ...spec, constraints: { ...spec.constraints, [key]: value } }));
  };

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r)",
      padding: "16px", display: "flex", flexDirection: "column", gap: "14px", boxShadow: "var(--shadow-md)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <span style={{ fontSize: "var(--fs-body)", fontWeight: 700, color: "var(--text)" }}>Confirm the design</span>
        <SourceChip source={source} />
      </div>

      {lowConfidence && (
        <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "var(--fs-xs)", color: "var(--warn)", background: "var(--warn-soft)", borderRadius: "var(--r-sm)", padding: "10px 12px", lineHeight: 1.45 }}>
          <span style={{ flexShrink: 0, marginTop: "1px", display: "inline-flex" }}><AlertIcon /></span>
          <span>Low-confidence match. Please check the fields below before running.</span>
        </div>
      )}

      <div>
        <label style={labelStyle}>Circuit type</label>
        <select value={spec.type || ""} onChange={(e) => handleTypeChange(e.target.value)} style={{ ...controlStyle, cursor: "pointer" }} onFocus={focusOn} onBlur={focusOff}>
          {SUPPORTED_TYPES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>

      {fields.map((field) => {
        const meta = FIELD_META[field] || { label: field, unit: "" };
        const val = spec.targets[field];
        return (
          <div key={field}>
            <label style={labelStyle}>{meta.label}{meta.unit ? ` (${meta.unit})` : ""}</label>
            <input
              type="number"
              className="tnum"
              value={Number.isNaN(val) || val === undefined ? "" : val}
              onChange={(e) => handleTargetChange(field, e.target.value)}
              style={controlStyle}
              onFocus={focusOn}
              onBlur={focusOff}
            />
          </div>
        );
      })}

      <div style={{ display: "flex", gap: "10px" }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Tolerance</label>
          <select value={spec.constraints.tolerance} onChange={(e) => handleConstraintChange("tolerance", parseFloat(e.target.value))} style={{ ...controlStyle, cursor: "pointer" }} onFocus={focusOn} onBlur={focusOff}>
            <option value={0.01}>1%</option>
            <option value={0.02}>2%</option>
            <option value={0.05}>5%</option>
            <option value={0.1}>10%</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>E-series</label>
          <select value={spec.constraints.eSeries} onChange={(e) => handleConstraintChange("eSeries", e.target.value)} style={{ ...controlStyle, cursor: "pointer" }} onFocus={focusOn} onBlur={focusOff}>
            {E_SERIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {spec.assumed && spec.assumed.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", background: "var(--warn-soft)", borderRadius: "var(--r-sm)", padding: "10px 12px" }}>
          {spec.assumed.map((a, i) => (
            <div key={i} style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "var(--fs-xs)", color: "var(--warn)", lineHeight: 1.45 }}>
              <span style={{ flexShrink: 0, marginTop: "1px", display: "inline-flex" }}><AlertIcon /></span>
              <span>{a}</span>
            </div>
          ))}
        </div>
      )}

      <label
        title={hasKey ? "Let Claude choose each next component value from the live SPICE measurement, in a closed loop." : "Set REACT_APP_ANTHROPIC_KEY to enable. Without a key, a deterministic solver drives the same loop."}
        style={{
          display: "flex", alignItems: "flex-start", gap: "9px", cursor: hasKey ? "pointer" : "not-allowed",
          background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
          padding: "10px 12px", opacity: hasKey ? 1 : 0.6,
        }}
      >
        <input
          type="checkbox"
          checked={llmInLoop && hasKey}
          disabled={!hasKey}
          onChange={(e) => onLlmInLoopChange && onLlmInLoopChange(e.target.checked)}
          style={{ marginTop: "2px", cursor: hasKey ? "pointer" : "not-allowed", accentColor: "var(--accent)" }}
        />
        <span style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "var(--fs-xs)", fontWeight: 600, color: "var(--text)" }}>
            <span style={{ display: "inline-flex", color: "var(--accent)" }}><SparkIcon /></span>
            AI in the loop
          </span>
          <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-2)", lineHeight: 1.4 }}>
            {hasKey
              ? "Claude proposes each next part value from the live SPICE result."
              : "Needs REACT_APP_ANTHROPIC_KEY. Off = deterministic solver runs the same loop."}
          </span>
        </span>
      </label>

      {!ok && errors.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          {errors.map((e, i) => (
            <div key={i} style={{ fontSize: "var(--fs-xs)", color: "var(--danger)", lineHeight: 1.45 }}>{e}</div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: "8px" }}>
        <button
          onClick={onRun}
          disabled={!ok}
          style={{
            flex: 1, background: ok ? "var(--accent)" : "var(--surface-2)", border: "none", borderRadius: "var(--r-sm)",
            color: ok ? "#fff" : "var(--text-3)", fontSize: "var(--fs-body)", fontWeight: 600,
            padding: "10px 12px", cursor: ok ? "pointer" : "not-allowed",
          }}
          onMouseEnter={(e) => { if (ok) e.currentTarget.style.background = "var(--accent-hover)"; }}
          onMouseLeave={(e) => { if (ok) e.currentTarget.style.background = "var(--accent)"; }}
        >
          Run design
        </button>
        <button
          onClick={onCancel}
          style={{
            background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
            color: "var(--text-2)", fontSize: "var(--fs-body)", fontWeight: 500,
            padding: "10px 14px", cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
