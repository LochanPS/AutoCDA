/**
 * followup.js — parse a natural-language follow-up into a delta on the current
 * CircuitSpec, for multi-turn design iteration.
 *
 * After a verified result, the user types things like:
 *   "lower the gain to 8"      → set a target
 *   "raise the cutoff by 50%"  → scale a target
 *   "double the gain"          → scale a target
 *   "use E96"                  → constraint: E-series
 *   "tighter tolerance"        → constraint: tolerance
 *   "sharpen the rolloff"      → step the filter order UP (more parts, steeper)
 *   "cut cost 20%"             → step the filter order DOWN (drop the op-amp)
 *
 * This is the regex fast path, consistent with circuitParser. It returns a NEW
 * spec (via makeSpec, so it is validated) plus a human change label, OR a calm
 * error message when it can't read the edit. The caller re-runs orchestrate() on
 * the new spec so every change stays SPICE-verified.
 *
 * Pure module — no React, no side effects.
 */

import { makeSpec, SUPPORTED_TYPES } from "../spec/circuitSpec";

// Filter-order ladders. Sharpen steps up (steeper rolloff, adds parts / an
// op-amp stage); cheapen steps down (drops a stage → lower part cost). Targets
// (fc) carry straight across, so the change stays SPICE-gradable.
const SHARPEN = {
  rc_lowpass: "sallen_key_lowpass",
  sallen_key_lowpass: "fourth_order_lowpass",
  rc_highpass: "sallen_key_highpass",
};
const CHEAPEN = {
  fourth_order_lowpass: "sallen_key_lowpass",
  sallen_key_lowpass: "rc_lowpass",
  sallen_key_highpass: "rc_highpass",
};

const E_SERIES = ["E12", "E24", "E96"];
const TOL_MIN = 0.001;
const TOL_MAX = 0.5;

const FIELD_LABEL = {
  Av: "gain", fc: "cutoff", f: "frequency", fL: "low cutoff", fH: "high cutoff",
  Vout: "output voltage", Vin: "input voltage", Vz: "zener voltage",
  Vsupply: "supply voltage", I: "current",
};

function typeName(type) {
  const d = SUPPORTED_TYPES.find((t) => t.id === type);
  return d ? d.name : type;
}

function fail(message) {
  return { ok: false, message };
}

// ── number/unit extraction ───────────────────────────────────────────────────

const PFX = { p: 1e-12, n: 1e-9, u: 1e-6, "µ": 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, meg: 1e6, g: 1e9, G: 1e9 };

function parseFreq(text) {
  let m = text.match(/(\d+(?:\.\d+)?)\s*(k|m|g|meg)?\s*(?:hz|hertz)\b/i);
  if (!m) m = text.match(/(\d+(?:\.\d+)?)\s*(k|m|g|meg)\b/i);
  if (!m) m = text.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const pfx = m[2] ? (PFX[m[2].toLowerCase()] ?? 1) : 1;
  return parseFloat(m[1]) * pfx;
}
function parseVoltage(text) {
  let m = text.match(/(\d+(?:\.\d+)?)\s*(m|k)?\s*v\b/i);
  if (!m) m = text.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const pfx = m[2] ? (PFX[m[2].toLowerCase()] ?? 1) : 1;
  return parseFloat(m[1]) * pfx;
}
function parseCurrent(text) {
  let m = text.match(/(\d+(?:\.\d+)?)\s*(m|u|µ)?\s*a(?:mps?|mpere)?\b/i);
  if (!m) m = text.match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const pfx = m[2] ? (PFX[m[2].toLowerCase()] ?? 1) : 1;
  return parseFloat(m[1]) * pfx;
}
function parseNumber(text) {
  const m = text.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}
function parsePercent(text) {
  const m = text.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? parseFloat(m[1]) / 100 : null;
}

// Which target field does the phrase reference, among those the spec actually
// has? Returns an array of keys (freq on a band-pass touches both edges).
function resolveFields(text, targets) {
  const t = text.toLowerCase();
  const has = (k) => Object.prototype.hasOwnProperty.call(targets, k);
  if (/\bgain\b|\bav\b/.test(t) && has("Av")) return { keys: ["Av"], kind: "gain" };
  if (/\bcut[\s-]?off|rolloff|roll[\s-]?off|frequenc|freq|\bfc\b|\bf0\b|\bhz\b/.test(t)) {
    if (has("fc")) return { keys: ["fc"], kind: "freq" };
    if (has("f")) return { keys: ["f"], kind: "freq" };
    if (has("fL") || has("fH")) return { keys: ["fL", "fH"].filter(has), kind: "freq" };
  }
  if (/\bvoltage\b|\bvout\b|output\b/.test(t)) {
    if (has("Vout")) return { keys: ["Vout"], kind: "voltage" };
  }
  if (/\bcurrent\b|\bamps?\b|\bma\b/.test(t) && has("I")) return { keys: ["I"], kind: "current" };
  return null;
}

function parseByKind(text, kind) {
  switch (kind) {
    case "freq": return parseFreq(text);
    case "voltage": return parseVoltage(text);
    case "current": return parseCurrent(text);
    default: return parseNumber(text);
  }
}

function fmtField(key, value) {
  switch (FIELD_LABEL[key] && key) {
    case "fc": case "f": case "fL": case "fH":
      return value >= 1e3 ? `${+(value / 1e3).toPrecision(3)} kHz` : `${+value.toPrecision(3)} Hz`;
    case "I":
      return value < 1 ? `${+(value * 1e3).toPrecision(3)} mA` : `${+value.toPrecision(3)} A`;
    case "Av":
      return `${+value.toPrecision(3)}×`;
    default:
      return `${+value.toPrecision(3)} V`;
  }
}

/**
 * Apply a follow-up edit to the current spec.
 * @param {import('../spec/circuitSpec').CircuitSpec} spec - current spec
 * @param {string} text - the follow-up phrase
 * @returns {{ok:true, spec, change:{kind,label}} | {ok:false, message:string}}
 */
export function applyFollowup(spec, text) {
  if (!spec || !spec.type) return fail("Run a design first, then refine it.");
  const raw = (text || "").trim();
  if (!raw) return fail("Type an edit, e.g. “use E96” or “lower the gain to 8”.");
  const t = raw.toLowerCase();
  const targets = spec.targets || {};
  const constraints = spec.constraints || {};

  // 1. E-series ---------------------------------------------------------------
  const eMatch = t.match(/\be(12|24|96)\b/);
  if (eMatch) {
    const eSeries = `E${eMatch[1]}`;
    if (eSeries === constraints.eSeries) return fail(`Already on ${eSeries}.`);
    return {
      ok: true,
      spec: makeSpec({ ...spec, constraints: { ...constraints, eSeries } }),
      change: { kind: "eseries", label: `Switched to ${eSeries} values` },
    };
  }

  // 2. Sharpen (order up) -----------------------------------------------------
  if (/\bsharpen|steeper|sharper|steep\b|higher[\s-]?order|more poles|tighter roll/.test(t)) {
    const next = SHARPEN[spec.type];
    if (!next) return fail("This is already the steepest rolloff I can build for this filter.");
    return {
      ok: true,
      spec: makeSpec({ ...spec, type: next, targets: { ...targets }, confidence: 1, assumed: [] }),
      change: { kind: "order_up", label: `Sharpened the rolloff (${typeName(spec.type)} → ${typeName(next)})` },
    };
  }

  // 3. Cut cost (order down, drop a stage) ------------------------------------
  if (/\bcut\s+cost|cheaper|reduce\s+cost|lower\s+cost|less\s+expensive|save\s+money|cost\s+down/.test(t)) {
    const next = CHEAPEN[spec.type];
    if (!next) return fail("This design is already at its cheapest topology — there’s no stage to drop.");
    return {
      ok: true,
      spec: makeSpec({ ...spec, type: next, targets: { ...targets }, confidence: 1, assumed: [] }),
      change: { kind: "cost_down", label: `Simplified to cut cost (${typeName(spec.type)} → ${typeName(next)})` },
    };
  }

  // 4. Tolerance --------------------------------------------------------------
  const tolPct = t.match(/(\d+(?:\.\d+)?)\s*%\s*tolerance/)
    || t.match(/tolerance\s*(?:of|to|=|:)?\s*(\d+(?:\.\d+)?)\s*%/)
    || t.match(/within\s*(\d+(?:\.\d+)?)\s*%/)
    || t.match(/[±±]\s*(\d+(?:\.\d+)?)\s*%/);
  const wantsTol = /tolerance|tighter|loosen|looser|relax|precise|precision/.test(t);
  if (tolPct) {
    const tol = Math.min(TOL_MAX, Math.max(TOL_MIN, parseFloat(tolPct[1]) / 100));
    return {
      ok: true,
      spec: makeSpec({ ...spec, constraints: { ...constraints, tolerance: tol } }),
      change: { kind: "tolerance", label: `Set tolerance to ${+(tol * 100).toPrecision(3)}%` },
    };
  }
  if (wantsTol) {
    const cur = constraints.tolerance ?? 0.05;
    const tighter = /tighter|tight|precise|precision/.test(t);
    const tol = Math.min(TOL_MAX, Math.max(TOL_MIN, tighter ? cur / 2 : cur * 2));
    return {
      ok: true,
      spec: makeSpec({ ...spec, constraints: { ...constraints, tolerance: tol } }),
      change: { kind: "tolerance", label: `${tighter ? "Tightened" : "Loosened"} tolerance to ${+(tol * 100).toPrecision(3)}%` },
    };
  }

  // 5. Target set / scale -----------------------------------------------------
  const field = resolveFields(raw, targets);
  if (field) {
    const pct = parsePercent(raw);
    const isScaleWord = /\bdouble|triple|quadruple|halve|half\b/.test(t);
    const isByPct = pct != null && /\bby\b|increase|decrease|raise|lower|reduce|boost|cut|up|down/.test(t);
    const isSet = /\b(set|make|to|=|at)\b/.test(t) && !isByPct && !isScaleWord;

    // scale
    if (isScaleWord || isByPct) {
      let factor;
      let verb;
      if (/\bdouble\b/.test(t)) { factor = 2; verb = "Doubled"; }
      else if (/\btriple\b/.test(t)) { factor = 3; verb = "Tripled"; }
      else if (/\bquadruple\b/.test(t)) { factor = 4; verb = "Quadrupled"; }
      else if (/\bhalve|half\b/.test(t)) { factor = 0.5; verb = "Halved"; }
      else {
        const up = /increase|raise|boost|\bup\b|higher|more/.test(t);
        factor = up ? 1 + pct : 1 - pct;
        verb = up ? "Raised" : "Lowered";
      }
      if (!(factor > 0) || !isFinite(factor)) return fail("I couldn’t read that change amount.");
      const nextTargets = { ...targets };
      for (const k of field.keys) nextTargets[k] = +(targets[k] * factor).toPrecision(6);
      const label = verb === "Raised" || verb === "Lowered"
        ? `${verb} the ${FIELD_LABEL[field.keys[0]]} by ${+(pct * 100).toPrecision(3)}%`
        : `${verb} the ${FIELD_LABEL[field.keys[0]]}`;
      return {
        ok: true,
        spec: makeSpec({ ...spec, targets: nextTargets, assumed: [] }),
        change: { kind: "target_scale", label },
      };
    }

    // set absolute
    if (isSet || /\d/.test(raw)) {
      if (field.keys.length > 1) return fail("Which edge? Try “raise the low cutoff to …” or scale both with “by X%”.");
      const key = field.keys[0];
      const value = parseByKind(raw, field.kind);
      if (value == null || !isFinite(value) || value <= 0) return fail(`I couldn’t read a valid ${FIELD_LABEL[key]} value.`);
      return {
        ok: true,
        spec: makeSpec({ ...spec, targets: { ...targets, [key]: value }, assumed: [] }),
        change: { kind: "target_set", label: `Set ${FIELD_LABEL[key]} to ${fmtField(key, value)}` },
      };
    }
  }

  // A field word was used but this circuit doesn't have it.
  if (/\bgain\b|\bcut[\s-]?off|rolloff|frequenc|freq|\bvoltage\b|\bcurrent\b/.test(t)) {
    return fail(`This ${typeName(spec.type)} doesn’t have that parameter to change.`);
  }

  return fail(
    "I couldn’t read that as an edit. Try “use E96”, “lower the gain to 8”, " +
    "“raise the cutoff by 50%”, “tighter tolerance”, or “sharpen the rolloff”."
  );
}
