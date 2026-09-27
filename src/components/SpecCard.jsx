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

const mono = "'JetBrains Mono', monospace";
const labelStyle = {
  fontSize: "10px", letterSpacing: "0.08em", color: "#8b949e",
  fontFamily: mono, fontWeight: 600, marginBottom: "4px",
};
const inputStyle = {
  width: "100%", background: "#0d1117", border: "1px solid #30363d", borderRadius: "6px",
  padding: "7px 9px", color: "#e6edf3", fontFamily: mono, fontSize: "11px", outline: "none",
};

/**
 * Confirm-before-run editable spec card.
 * @param {object}   props
 * @param {import('../spec/circuitSpec').CircuitSpec} props.spec
 * @param {(spec) => void} props.onChange  called with an updated CircuitSpec
 * @param {() => void}     props.onRun
 * @param {() => void}     props.onCancel
 */
export default function SpecCard({ spec, onChange, onRun, onCancel }) {
  if (!spec) return null;

  const typeDef = SUPPORTED_TYPES.find((t) => t.id === spec.type);
  const fields = typeDef ? typeDef.fields : [];
  const { ok, errors } = validateSpec(spec);

  // Switch circuit type: keep any target values that carry over, drop the rest.
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
    // Editing a field invalidates any assumption note about it.
    const assumed = (spec.assumed || []).filter((a) => !a.startsWith(`${field} `));
    onChange(makeSpec({
      ...spec,
      targets: { ...spec.targets, [field]: num },
      assumed,
    }));
  };

  const handleConstraintChange = (key, value) => {
    onChange(makeSpec({
      ...spec,
      constraints: { ...spec.constraints, [key]: value },
    }));
  };

  return (
    <div style={{
      background: "#161b22", border: "1px solid #388bfd", borderRadius: "8px",
      padding: "12px", display: "flex", flexDirection: "column", gap: "10px",
    }}>
      <div style={{
        fontSize: "10px", letterSpacing: "0.08em", color: "#58a6ff",
        fontFamily: mono, fontWeight: 700,
      }}>
        CONFIRM DESIGN SPEC
      </div>

      {/* Circuit type */}
      <div>
        <div style={labelStyle}>CIRCUIT TYPE</div>
        <select
          value={spec.type || ""}
          onChange={(e) => handleTypeChange(e.target.value)}
          style={{ ...inputStyle, cursor: "pointer" }}
        >
          {SUPPORTED_TYPES.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Target fields */}
      {fields.map((field) => {
        const meta = FIELD_META[field] || { label: field, unit: "" };
        const val = spec.targets[field];
        return (
          <div key={field}>
            <div style={labelStyle}>
              {meta.label.toUpperCase()} {meta.unit && `(${meta.unit})`}
            </div>
            <input
              type="number"
              value={Number.isNaN(val) || val === undefined ? "" : val}
              onChange={(e) => handleTargetChange(field, e.target.value)}
              style={inputStyle}
            />
          </div>
        );
      })}

      {/* Constraints */}
      <div style={{ display: "flex", gap: "8px" }}>
        <div style={{ flex: 1 }}>
          <div style={labelStyle}>TOLERANCE</div>
          <select
            value={spec.constraints.tolerance}
            onChange={(e) => handleConstraintChange("tolerance", parseFloat(e.target.value))}
            style={{ ...inputStyle, cursor: "pointer" }}
          >
            <option value={0.01}>1%</option>
            <option value={0.02}>2%</option>
            <option value={0.05}>5%</option>
            <option value={0.1}>10%</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <div style={labelStyle}>E-SERIES</div>
          <select
            value={spec.constraints.eSeries}
            onChange={(e) => handleConstraintChange("eSeries", e.target.value)}
            style={{ ...inputStyle, cursor: "pointer" }}
          >
            {E_SERIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Assumptions */}
      {spec.assumed && spec.assumed.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
          {spec.assumed.map((a, i) => (
            <div key={i} style={{
              fontSize: "10px", color: "#d29922", fontFamily: mono, lineHeight: 1.4,
            }}>
              ⚠ {a}
            </div>
          ))}
        </div>
      )}

      {/* Validation errors */}
      {!ok && errors.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
          {errors.map((e, i) => (
            <div key={i} style={{
              fontSize: "10px", color: "#f85149", fontFamily: mono, lineHeight: 1.4,
            }}>
              {e}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "6px" }}>
        <button
          onClick={onRun}
          disabled={!ok}
          style={{
            flex: 1, background: ok ? "#238636" : "#1a1f27", border: "none", borderRadius: "6px",
            color: ok ? "#fff" : "#484f58", fontFamily: mono, fontSize: "11px",
            padding: "8px 12px", cursor: ok ? "pointer" : "not-allowed", fontWeight: 600,
          }}
        >
          Run ▶
        </button>
        <button
          onClick={onCancel}
          style={{
            background: "#1a1f27", border: "1px solid #30363d", borderRadius: "6px",
            color: "#8b949e", fontFamily: mono, fontSize: "11px",
            padding: "8px 12px", cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
