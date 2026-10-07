import React, { useState, useCallback } from "react";
import ResultPlot from "./ResultPlot";
import { runSpice } from "../sim/spice";
import { composeCircuit, verifyComposition, checkImpedanceMatch, perStageErrors } from "../design/compose";
import { buildBOM } from "../design/bom";
import { SUPPORTED_TYPES } from "../spec/circuitSpec";

// Stage types that chain meaningfully in an AC signal path (filters + amps). DC
// one-shots (dividers, LED limiters, regulators) are excluded on purpose.
const CHAIN_TYPE_IDS = [
  "rc_lowpass", "rc_highpass", "sallen_key_lowpass", "sallen_key_highpass",
  "band_pass", "fourth_order_lowpass",
  "opamp_inverting", "opamp_noninverting", "two_stage_amplifier",
];
const CHAIN_TYPES = CHAIN_TYPE_IDS
  .map((id) => SUPPORTED_TYPES.find((t) => t.id === id))
  .filter(Boolean);

const FIELD_META = {
  fc: { label: "Cutoff", unit: "Hz", eng: true, def: 1000 },
  fL: { label: "Low edge", unit: "Hz", eng: true, def: 300 },
  fH: { label: "High edge", unit: "Hz", eng: true, def: 3000 },
  Av: { label: "Gain", unit: "×", eng: false, def: 10 },
};

const typeName = (id) => (SUPPORTED_TYPES.find((t) => t.id === id) || {}).name || id;
const fieldsFor = (id) => ((SUPPORTED_TYPES.find((t) => t.id === id) || {}).fields || []);

// Parse "2k", "1.5M", "470" into a number; returns null when unparseable.
function parseEng(raw) {
  if (typeof raw === "number") return raw;
  const s = String(raw).trim().replace(/hz$/i, "").trim();
  const m = s.match(/^(-?\d*\.?\d+)\s*([kKmMgG])?$/);
  if (!m) return null;
  const mult = { k: 1e3, K: 1e3, m: 1e6, M: 1e6, g: 1e9, G: 1e9 }[m[2]] || 1;
  return parseFloat(m[1]) * mult;
}

function defaultStage(type) {
  const targets = {};
  for (const f of fieldsFor(type)) targets[f] = (FIELD_META[f] || { def: 1 }).def;
  return { type, targets };
}

const fmtHz = (f) => (f == null ? "n/a" : f >= 1e6 ? `${+(f / 1e6).toPrecision(3)} MHz` : f >= 1e3 ? `${+(f / 1e3).toPrecision(3)} kHz` : `${+f.toPrecision(3)} Hz`);
const fmtMeasured = (kind, v) => (v == null ? "n/a" : kind === "cutoff" ? fmtHz(v) : `${+v.toPrecision(4)}×`);

export default function ChainBuilder() {
  const [stages, setStages] = useState(() => [
    defaultStage("rc_lowpass"),
    defaultStage("opamp_noninverting"),
  ]);
  const [rawInputs, setRawInputs] = useState({}); // "si-field" -> raw text while editing
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [out, setOut] = useState(null); // { composition, v, bom }

  const setStage = useCallback((i, next) => {
    setStages((prev) => prev.map((s, j) => (j === i ? next : s)));
    setError("");
  }, []);

  const changeType = (i, type) => { setStage(i, defaultStage(type)); };
  const changeField = (i, field, raw) => {
    setRawInputs((p) => ({ ...p, [`${i}-${field}`]: raw }));
    const n = parseEng(raw);
    setStages((prev) => prev.map((s, j) => (j === i ? { ...s, targets: { ...s.targets, [field]: n == null ? NaN : n } } : s)));
    setError("");
  };
  const addStage = () => { setStages((p) => [...p, defaultStage("opamp_noninverting")]); setError(""); };
  const removeStage = (i) => { setStages((p) => p.filter((_, j) => j !== i)); setOut(null); setError(""); };
  const move = (i, dir) => {
    setStages((p) => {
      const j = i + dir;
      if (j < 0 || j >= p.length) return p;
      const n = [...p]; [n[i], n[j]] = [n[j], n[i]]; return n;
    });
    setOut(null);
  };

  const design = useCallback(async () => {
    if (running) return;
    setError("");
    setOut(null);

    if (!stages.length) { setError("Add at least one stage."); return; }
    for (let i = 0; i < stages.length; i++) {
      for (const f of fieldsFor(stages[i].type)) {
        const v = stages[i].targets[f];
        if (typeof v !== "number" || !isFinite(v) || v <= 0) {
          setError(`Stage ${i + 1} (${typeName(stages[i].type)}): "${(FIELD_META[f] || {}).label || f}" needs a positive value.`);
          return;
        }
      }
    }

    setRunning(true);
    let composition, v, impedance, perStage;
    try {
      const specs = stages.map((s) => ({ type: s.type, targets: s.targets }));
      composition = composeCircuit(specs);
      v = await verifyComposition(composition, { runSpice });
      // A2 composition depth: inter-stage loading check + per-stage attribution.
      impedance = checkImpedanceMatch(specs);
      perStage = await perStageErrors(specs, { runSpice });
    } catch (e) {
      setRunning(false);
      const detail = (e && e.message ? String(e.message) : "").trim().slice(0, 160);
      setError(`Couldn't build or verify the chain${detail ? ` (${detail})` : ""}.`);
      return;
    }
    const bom = buildBOM(composition.components);
    setOut({ composition, v, bom, impedance, perStage });
    setRunning(false);
  }, [stages, running]);

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: "14px", overflowY: "auto", paddingRight: "4px" }}>
      <div style={{ ...card, padding: "16px 18px" }}>
        <div style={{ fontSize: "var(--fs-h2)", fontWeight: 700, color: "var(--text)", marginBottom: "6px" }}>Build a chain</div>
        <div style={{ fontSize: "var(--fs-sm)", color: "var(--text-2)", lineHeight: 1.55, maxWidth: "70ch" }}>
          Stack SPICE-verified building blocks into one signal chain. Each stage drives the next; AutoCDA designs every stage,
          wires them into a single ngspice deck, and measures the <strong>end-to-end</strong> response — the honest, composed result.
        </div>
      </div>

      <div style={card}>
        <div style={cardHead}>
          <span style={{ fontSize: "var(--fs-body)", fontWeight: 600, color: "var(--text)" }}>Stages (input → output)</span>
          <button style={ghostBtn} onClick={addStage}>+ Add stage</button>
        </div>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
          {stages.map((s, i) => (
            <div key={i} style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "flex-end", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "10px 12px" }}>
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-3)", fontWeight: 700, width: "20px" }}>{i + 1}</span>
              <Labeled label="Stage type">
                <select value={s.type} onChange={(e) => changeType(i, e.target.value)} style={selectStyle}>
                  {CHAIN_TYPES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Labeled>
              {fieldsFor(s.type).map((f) => {
                const meta = FIELD_META[f] || { label: f, unit: "" };
                const key = `${i}-${f}`;
                const shown = rawInputs[key] != null ? rawInputs[key] : String(s.targets[f] ?? "");
                return (
                  <Labeled key={f} label={`${meta.label} (${meta.unit})`}>
                    <input
                      value={shown}
                      onChange={(e) => changeField(i, f, e.target.value)}
                      placeholder={meta.eng ? "e.g. 2k" : "e.g. 10"}
                      style={inputStyle}
                    />
                  </Labeled>
                );
              })}
              <div style={{ display: "flex", gap: "4px", marginLeft: "auto" }}>
                <button style={iconBtn} title="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button style={iconBtn} title="Move down" disabled={i === stages.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button style={{ ...iconBtn, color: "var(--danger)" }} title="Remove" onClick={() => removeStage(i)}>×</button>
              </div>
            </div>
          ))}
          {stages.length === 0 && <div style={{ fontSize: "var(--fs-sm)", color: "var(--text-3)" }}>No stages yet — add one to start.</div>}

          {error && <div style={{ color: "var(--danger)", fontSize: "var(--fs-sm)", lineHeight: 1.45 }}>{error}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={design}
              disabled={running}
              style={{
                background: running ? "var(--surface-2)" : "var(--accent)", border: "none", borderRadius: "var(--r-sm)",
                color: running ? "var(--text-3)" : "#fff", fontSize: "var(--fs-sm)", fontWeight: 600,
                padding: "10px 20px", cursor: running ? "progress" : "pointer",
              }}
            >
              {running ? "Designing + verifying…" : "Design + verify chain"}
            </button>
          </div>
        </div>
      </div>

      {out && <ChainResults out={out} />}
    </div>
  );
}

const FILTER_RE = /lowpass|highpass|band_pass|integrator|differentiator|sallen|fourth_order/;

const fmtOhm = (r) => (r == null ? "n/a" : r >= 1e9 ? "≈∞ (op-amp in)" : r >= 1e6 ? `${+(r / 1e6).toPrecision(3)} MΩ` : r >= 1e3 ? `${+(r / 1e3).toPrecision(3)} kΩ` : `${Math.round(r)} Ω`);

function ChainResults({ out }) {
  const { composition, v, bom, impedance, perStage } = out;
  const kind = composition.measureKind;
  const filterStages = composition.stages.filter((s) => FILTER_RE.test(s.type)).length;
  // The closed-form prediction is only trustworthy for pure-gain cascades and for
  // a single filter stage. With ≥2 filters, stages load and interact — the naive
  // "dominant corner" misses it, so we defer to the SPICE-measured value instead
  // of printing a number that looks wrong next to the real one.
  const predReliable = kind === "gain" || filterStages <= 1;
  const predicted = kind === "gain" ? composition.predicted.totalGain : composition.predicted.dominantCorner;

  return (
    <>
      <div style={card}>
        <div style={cardHead}>
          <span style={{ fontSize: "var(--fs-body)", fontWeight: 600, color: "var(--text)" }}>End-to-end result</span>
          <span style={badge}>{composition.stages.length} stages · SPICE-measured</span>
        </div>
        <div style={{ padding: "16px", display: "flex", flexWrap: "wrap", gap: "16px 40px" }}>
          <Stat label={`Measured ${kind === "gain" ? "gain" : "corner"}`} value={fmtMeasured(kind, v.measured)} accent="var(--success)" />
          <Stat label="Predicted (closed-form)" value={predReliable ? (predicted == null ? "n/a" : fmtMeasured(kind, predicted)) : "—"} />
          <Stat label="BOM / unit" value={`$${bom.total.toFixed(3)}`} />
          <Stat label="Parts" value={String(composition.components.filter((c) => c.unit === "Ω" || c.unit === "F").length)} />
        </div>
        {!predReliable && (
          <div style={{ borderTop: "1px solid var(--border)", background: "var(--surface-2)", padding: "9px 16px", fontSize: "var(--fs-xs)", color: "var(--text-3)" }}>
            {filterStages} filter stages cascade and load each other — no simple closed form for the combined corner. The SPICE-measured value is the real one.
          </div>
        )}
        {v.errors && v.errors.length > 0 && (
          <div style={{ borderTop: "1px solid var(--border)", background: "var(--warn-soft)", padding: "10px 16px", fontSize: "var(--fs-xs)", color: "var(--warn)", whiteSpace: "pre-wrap", fontFamily: "var(--font-mono, monospace)" }}>
            {v.errors.slice(0, 4).join("\n")}
          </div>
        )}
      </div>

      {perStage && perStage.length > 0 && (
        <div style={card}>
          <div style={cardHead}>
            <span style={{ fontSize: "var(--fs-body)", fontWeight: 600, color: "var(--text)" }}>Per-stage vs end-to-end</span>
            <span style={badge}>each stage measured on its own</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr><th style={th}>Stage</th><th style={th}>Type</th><th style={thR}>Target</th><th style={thR}>Measured</th><th style={thR}>Error</th></tr>
            </thead>
            <tbody>
              {perStage.map((p) => (
                <tr key={p.stage}>
                  <td style={{ ...td, color: "var(--text-2)" }}>{p.stage}</td>
                  <td style={{ ...td, color: "var(--text)" }}>{typeName(p.type).replace(/ \(.*\)$/, "")}</td>
                  <td className="tnum" style={tdR}>{p.target == null ? "—" : `${+p.target.toPrecision(4)} ${p.targetName || ""}`}</td>
                  <td className="tnum" style={tdR}>{p.measured == null ? "n/a" : +p.measured.toPrecision(4)}</td>
                  <td className="tnum" style={{ ...tdR, color: p.errorPct == null ? "var(--text-3)" : p.errorPct <= 0.05 ? "var(--success)" : "var(--warn)" }}>
                    {p.errorPct == null ? "—" : `${(p.errorPct * 100).toFixed(2)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ borderTop: "1px solid var(--border)", background: "var(--surface-2)", padding: "9px 16px", fontSize: "var(--fs-xs)", color: "var(--text-3)" }}>
            A stage that passes on its own but drifts end-to-end points at an interface problem — see loading below.
          </div>
        </div>
      )}

      {impedance && impedance.length > 0 && (
        <div style={card}>
          <div style={cardHead}>
            <span style={{ fontSize: "var(--fs-body)", fontWeight: 600, color: "var(--text)" }}>Inter-stage impedance match</span>
            <span style={badge}>{impedance.filter((r) => r.ok === false).length ? "loading detected" : "well matched"}</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr><th style={th}>Interface</th><th style={thR}>Zout</th><th style={thR}>Zin (next)</th><th style={thR}>Loading loss</th><th style={th}>Verdict</th></tr>
            </thead>
            <tbody>
              {impedance.map((r, i) => (
                <tr key={i}>
                  <td style={{ ...td, color: "var(--text-2)" }}>S{r.from} → S{r.to}</td>
                  <td className="tnum" style={tdR}>{fmtOhm(r.zout)}</td>
                  <td className="tnum" style={tdR}>{fmtOhm(r.zin)}</td>
                  <td className="tnum" style={{ ...tdR, color: r.ok === false ? "var(--warn)" : "var(--text)" }}>
                    {r.loadingErrorPct == null ? "—" : `${(r.loadingErrorPct * 100).toFixed(1)}%`}
                  </td>
                  <td style={{ ...td, color: r.ok === false ? "var(--warn)" : r.ok ? "var(--success)" : "var(--text-3)", fontSize: "var(--fs-xs)" }}>
                    {r.ok == null ? "not modeled" : r.ok ? "ok" : "add a buffer"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={card}>
        <div style={cardHead}><span style={{ fontSize: "var(--fs-body)", fontWeight: 600, color: "var(--text)" }}>Combined schematic</span></div>
        <div style={{ padding: "16px", overflowX: "auto" }}>
          <BlockDiagram stages={composition.stages} />
        </div>
      </div>

      <div style={card}>
        <div style={cardHead}><span style={{ fontSize: "var(--fs-body)", fontWeight: 600, color: "var(--text)" }}>Combined response (node: out)</span></div>
        <div style={{ padding: "12px 10px" }}>
          {v.result ? <ResultPlot result={v.result} height={300} maxNodes={2} /> : <div style={{ padding: "20px", color: "var(--text-3)" }}>No plot data.</div>}
        </div>
      </div>

      <div style={card}>
        <div style={cardHead}><span style={{ fontSize: "var(--fs-body)", fontWeight: 600, color: "var(--text)" }}>Combined bill of materials</span>
          <span className="tnum" style={{ fontSize: "var(--fs-sm)", color: "var(--text-2)", fontWeight: 600 }}>${bom.total.toFixed(2)} / unit</span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>Ref</th><th style={th}>Value</th><th style={th}>MPN</th>
              <th style={thR}>Qty</th><th style={thR}>Unit</th><th style={thR}>Line</th>
            </tr>
          </thead>
          <tbody>
            {bom.rows.map((r, i) => (
              <tr key={i}>
                <td style={{ ...td, fontFamily: "var(--font-mono, monospace)", color: "var(--text-2)" }}>{r.ref}</td>
                <td className="tnum" style={{ ...td, color: "var(--text)" }}>{r.value}</td>
                <td style={{ ...td, fontFamily: "var(--font-mono, monospace)", color: "var(--text-2)", fontSize: "var(--fs-xs)" }}>{r.mpn}</td>
                <td className="tnum" style={tdR}>{r.qty}</td>
                <td className="tnum" style={tdR}>${r.unitPrice.toFixed(3)}</td>
                <td className="tnum" style={{ ...tdR, fontWeight: 500 }}>${r.lineTotal.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details style={{ ...card, padding: 0 }}>
        <summary style={{ padding: "13px 16px", cursor: "pointer", fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--text-2)" }}>Composed ngspice deck</summary>
        <pre style={{ margin: 0, padding: "0 16px 16px", fontSize: "12px", color: "var(--text-2)", fontFamily: "var(--font-mono, monospace)", whiteSpace: "pre-wrap" }}>{composition.netlist}</pre>
      </details>
    </>
  );
}

// Honest block-level schematic of the chain: one labelled box per verified stage,
// wired in series from the input source to the output node.
function BlockDiagram({ stages }) {
  const boxW = 150, boxH = 66, gap = 46, padL = 70, padR = 60, top = 24;
  const width = padL + stages.length * boxW + (stages.length - 1) * gap + padR;
  const height = top + boxH + 54;
  const cy = top + boxH / 2;

  const targetLabel = (s) => {
    if (s.targets.fc != null) return fmtHz(s.targets.fc);
    if (s.targets.fL != null && s.targets.fH != null) return `${fmtHz(s.targets.fL)}–${fmtHz(s.targets.fH)}`;
    if (s.targets.Av != null) return `gain ${+s.targets.Av.toPrecision(3)}×`;
    return "";
  };
  const shortName = (id) => typeName(id).replace(/ \(.*\)$/, "");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={Math.max(width, 480)} height={height} style={{ maxWidth: "none" }} xmlns="http://www.w3.org/2000/svg">
      {/* source */}
      <circle cx={34} cy={cy} r={16} fill="none" stroke="var(--accent)" strokeWidth="2" />
      <text x={34} y={cy - 2} textAnchor="middle" fontSize="9" fill="var(--text-2)">~</text>
      <text x={34} y={cy + 9} textAnchor="middle" fontSize="9" fill="var(--text-2)">Vin</text>
      <line x1={50} y1={cy} x2={padL} y2={cy} stroke="var(--accent)" strokeWidth="1.5" />

      {stages.map((s, i) => {
        const x = padL + i * (boxW + gap);
        return (
          <g key={i}>
            <rect x={x} y={top} width={boxW} height={boxH} rx="8" fill="var(--surface-2)" stroke="var(--accent)" strokeWidth="1.5" />
            <text x={x + boxW / 2} y={top + 20} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--text)">Stage {i + 1}</text>
            <text x={x + boxW / 2} y={top + 38} textAnchor="middle" fontSize="11" fill="var(--text)">{shortName(s.type)}</text>
            <text x={x + boxW / 2} y={top + 54} textAnchor="middle" fontSize="10" fill="var(--text-3)">{targetLabel(s)}</text>
            {i < stages.length - 1 && (
              <>
                <line x1={x + boxW} y1={cy} x2={x + boxW + gap} y2={cy} stroke="var(--accent)" strokeWidth="1.5" />
                <polygon points={`${x + boxW + gap},${cy} ${x + boxW + gap - 7},${cy - 4} ${x + boxW + gap - 7},${cy + 4}`} fill="var(--accent)" />
                <text x={x + boxW + gap / 2} y={cy - 8} textAnchor="middle" fontSize="9" fill="var(--text-3)">n{i + 1}</text>
              </>
            )}
          </g>
        );
      })}

      {/* output */}
      {(() => {
        const lastX = padL + (stages.length - 1) * (boxW + gap) + boxW;
        return (
          <g>
            <line x1={lastX} y1={cy} x2={lastX + padR - 18} y2={cy} stroke="var(--accent)" strokeWidth="1.5" />
            <circle cx={lastX + padR - 16} cy={cy} r={4} fill="#1a7f42" />
            <text x={lastX + padR - 16} y={cy - 10} textAnchor="middle" fontSize="10" fill="#1a7f42">out</text>
          </g>
        );
      })()}
    </svg>
  );
}

function Labeled({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-3)", fontWeight: 600 }}>{label}</span>
      {children}
    </label>
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

const card = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--shadow-sm)", overflow: "hidden", flexShrink: 0 };
const cardHead = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 16px", borderBottom: "1px solid var(--border)" };
const ghostBtn = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", color: "var(--text)", fontSize: "var(--fs-xs)", fontWeight: 600, padding: "7px 12px", cursor: "pointer" };
const selectStyle = { background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "8px 10px", color: "var(--text)", fontSize: "var(--fs-sm)", outline: "none", minWidth: "200px" };
const inputStyle = { background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "8px 10px", color: "var(--text)", fontSize: "var(--fs-sm)", outline: "none", width: "100px" };
const iconBtn = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", color: "var(--text-2)", width: "30px", height: "30px", cursor: "pointer", fontSize: "14px", lineHeight: 1 };
const badge = { fontSize: "var(--fs-xs)", fontWeight: 600, padding: "3px 10px", borderRadius: "999px", background: "var(--accent-soft)", color: "var(--accent)" };
const th = { textAlign: "left", padding: "8px 16px", fontSize: "var(--fs-xs)", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600, borderBottom: "1px solid var(--border)" };
const thR = { ...th, textAlign: "right" };
const td = { padding: "9px 16px", fontSize: "var(--fs-sm)", borderBottom: "1px solid var(--border)" };
const tdR = { ...td, textAlign: "right", fontFamily: "var(--font-mono, monospace)" };
