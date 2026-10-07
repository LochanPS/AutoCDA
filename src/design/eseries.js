/**
 * eseries.js — snap ideal component values to standard (buyable) E-series values.
 *
 * Real resistors and capacitors only exist at the IEC 60063 preferred values
 * (E12 / E24 / E96 mantissas × a power of ten). Snapping an ideal computed value
 * to the nearest buyable one introduces genuine, honest error — the error the
 * SPICE loop (Phase 2.3) then measures. Pure module, no side effects.
 *
 * Exports:
 *   E12, E24, E96                 standard mantissa arrays (1.0 ≤ m < 10)
 *   snap(value, series="E24")     nearest standard value (correct decade)
 *   neighbors(value, series, k=2) k nearest standard values below + above
 *   formatResistance, formatCapacitance   re-exported display helpers
 */

import { formatResistance, formatCapacitance } from "../utils/circuitFormulas";

export { formatResistance, formatCapacitance };

// ── standard mantissa tables (IEC 60063) ─────────────────────────────────────

export const E12 = [
  1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2,
];

export const E24 = [
  1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0,
  3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1,
];

export const E96 = [
  1.0, 1.02, 1.05, 1.07, 1.1, 1.13, 1.15, 1.18, 1.21, 1.24, 1.27, 1.3,
  1.33, 1.37, 1.4, 1.43, 1.47, 1.5, 1.54, 1.58, 1.62, 1.65, 1.69, 1.74,
  1.78, 1.82, 1.87, 1.91, 1.96, 2.0, 2.05, 2.1, 2.15, 2.21, 2.26, 2.32,
  2.37, 2.43, 2.49, 2.55, 2.61, 2.67, 2.74, 2.8, 2.87, 2.94, 3.01, 3.09,
  3.16, 3.24, 3.32, 3.4, 3.48, 3.57, 3.65, 3.74, 3.83, 3.92, 4.02, 4.12,
  4.22, 4.32, 4.42, 4.53, 4.64, 4.75, 4.87, 4.99, 5.11, 5.23, 5.36, 5.49,
  5.62, 5.76, 5.9, 6.04, 6.19, 6.34, 6.49, 6.65, 6.81, 6.98, 7.15, 7.32,
  7.5, 7.68, 7.87, 8.06, 8.25, 8.45, 8.66, 8.87, 9.09, 9.31, 9.53, 9.76,
];

const TABLES = { E12, E24, E96 };

/**
 * Return a copy of a component with a new rawValue AND a regenerated display
 * string, so the shown value never drifts from the actual (snapped) value.
 */
export function applyValue(component, value) {
  let display = component.display;
  if (component.unit === "Ω") display = formatResistance(value);
  else if (component.unit === "F") display = formatCapacitance(value);
  return { ...component, rawValue: value, display };
}

function tableFor(series) {
  const t = TABLES[String(series).toUpperCase()];
  if (!t) throw new Error(`eseries: unknown series "${series}" (use E12/E24/E96)`);
  return t;
}

// All standard values within [lo, hi] for a series (across decades).
function valuesInRange(lo, hi, series) {
  const table = tableFor(series);
  const out = [];
  const eLo = Math.floor(Math.log10(lo));
  const eHi = Math.ceil(Math.log10(hi));
  for (let e = eLo; e <= eHi; e++) {
    const scale = Math.pow(10, e);
    for (const m of table) {
      const v = Number((m * scale).toPrecision(12));
      if (v >= lo && v <= hi) out.push(v);
    }
  }
  return out;
}

/**
 * Synthesize a near-arbitrary resistance from TWO standard resistors in series or
 * parallel — the textbook way to beat the single-part (~1%) granularity floor and
 * reach sub-0.1%. Returns the best realization (and the single-part baseline if it
 * is already closest).
 * @param {number} target  desired resistance (ohms)
 * @param {string} [series="E24"]
 * @returns {{ value:number, mode:"single"|"series"|"parallel", a:number, b:number|null, errorPct:number }}
 */
export function synthesizeResistor(target, series = "E24") {
  if (!(target > 0) || !isFinite(target)) return { value: target, mode: "single", a: target, b: null, errorPct: 0 };
  const logErr = (v) => Math.abs(Math.log(v / target));
  const single = snap(target, series);
  let best = { value: single, mode: "single", a: single, b: null, errorPct: Math.abs(single - target) / target, _e: logErr(single) };
  // Series: both parts <= target. Parallel: both parts >= target.
  const lows = valuesInRange(target / 3, target * 1.001, series);
  const highs = valuesInRange(target * 0.999, target * 3, series);
  for (let i = 0; i < lows.length; i++) {
    for (let j = i; j < lows.length; j++) {
      const v = lows[i] + lows[j];
      const e = logErr(v);
      if (e < best._e) best = { value: +v.toPrecision(12), mode: "series", a: lows[i], b: lows[j], errorPct: Math.abs(v - target) / target, _e: e };
    }
  }
  for (let i = 0; i < highs.length; i++) {
    for (let j = i; j < highs.length; j++) {
      const v = (highs[i] * highs[j]) / (highs[i] + highs[j]);
      const e = logErr(v);
      if (e < best._e) best = { value: +v.toPrecision(12), mode: "parallel", a: highs[i], b: highs[j], errorPct: Math.abs(v - target) / target, _e: e };
    }
  }
  delete best._e;
  return best;
}

/**
 * Synthesize a near-arbitrary capacitance from TWO standard capacitors (Theme B3).
 * Capacitors are not made to fine (E96) tolerances, so a single part sets a coarse
 * floor; two in parallel (C = Ca + Cb) or series (C = Ca·Cb/(Ca+Cb)) reach a far
 * denser value set and close the sub-1% gap for capacitor-dominant blocks (RC
 * filters, Wien oscillator). Note the duality with resistors: for caps PARALLEL
 * adds and SERIES reduces — the opposite of resistors.
 * @param {number} target  desired capacitance (farads)
 * @param {string} [series="E24"]  caps top out at E24 in practice
 * @returns {{ value:number, mode:"single"|"series"|"parallel", a:number, b:number|null, errorPct:number }}
 */
export function synthesizeCapacitor(target, series = "E24") {
  if (!(target > 0) || !isFinite(target)) return { value: target, mode: "single", a: target, b: null, errorPct: 0 };
  const logErr = (v) => Math.abs(Math.log(v / target));
  const single = snap(target, series);
  let best = { value: single, mode: "single", a: single, b: null, errorPct: Math.abs(single - target) / target, _e: logErr(single) };
  // Parallel ADDS: both parts <= target. Series REDUCES: both parts >= target.
  const lows = valuesInRange(target / 3, target * 1.001, series);
  const highs = valuesInRange(target * 0.999, target * 3, series);
  for (let i = 0; i < lows.length; i++) {
    for (let j = i; j < lows.length; j++) {
      const v = lows[i] + lows[j];
      const e = logErr(v);
      if (e < best._e) best = { value: +v.toPrecision(12), mode: "parallel", a: lows[i], b: lows[j], errorPct: Math.abs(v - target) / target, _e: e };
    }
  }
  for (let i = 0; i < highs.length; i++) {
    for (let j = i; j < highs.length; j++) {
      const v = (highs[i] * highs[j]) / (highs[i] + highs[j]);
      const e = logErr(v);
      if (e < best._e) best = { value: +v.toPrecision(12), mode: "series", a: highs[i], b: highs[j], errorPct: Math.abs(v - target) / target, _e: e };
    }
  }
  delete best._e;
  return best;
}

/**
 * Synthesize a near-arbitrary value for a part of either kind, picking the right
 * combination algebra from the unit ("F" → capacitor, else resistor).
 * @param {number} target
 * @param {{series?:string, unit?:string}} [opts]
 */
export function synthesizePart(target, { series = "E24", unit = "Ω" } = {}) {
  return unit === "F" ? synthesizeCapacitor(target, series) : synthesizeResistor(target, series);
}

/**
 * All standard values from the decade below `value` up to the decade above,
 * sorted ascending. Covers boundary cases (e.g. 9.5k snapping up to 10k).
 */
function candidateValues(value, table) {
  const mag = Math.floor(Math.log10(value));
  const out = [];
  for (let e = mag - 1; e <= mag + 1; e++) {
    const scale = Math.pow(10, e);
    // toPrecision(12) strips binary-float noise (e.g. 8.2*100 = 819.999…→820)
    // while preserving significant figures at any magnitude (incl. pF/nF).
    for (const m of table) out.push(Number((m * scale).toPrecision(12)));
  }
  return out.sort((a, b) => a - b);
}

// Nearest in LOG space (ratio error), the correct metric for preferred values.
function nearestIndex(value, sorted) {
  let best = 0;
  let bestErr = Infinity;
  for (let i = 0; i < sorted.length; i++) {
    const err = Math.abs(Math.log10(sorted[i] / value));
    if (err < bestErr) {
      bestErr = err;
      best = i;
    }
  }
  return best;
}

/**
 * Snap an ideal value to the nearest standard E-series value in the right decade.
 * @param {number} value  ideal component value (> 0)
 * @param {string} [series="E24"]
 * @returns {number}
 */
export function snap(value, series = "E24") {
  if (!(value > 0) || !isFinite(value)) return value;
  const sorted = candidateValues(value, tableFor(series));
  return sorted[nearestIndex(value, sorted)];
}

/**
 * The k nearest standard values below and above `value`, for the refine search.
 * Returns a flat array sorted ascending: [k below, k above] (the snapped value
 * itself is not included — the loop tests it separately). Fewer than k on a side
 * near the ends of the generated range is fine.
 * @param {number} value
 * @param {string} [series="E24"]
 * @param {number} [k=2]
 * @returns {number[]}
 */
export function neighbors(value, series = "E24", k = 2) {
  if (!(value > 0) || !isFinite(value)) return [];
  const sorted = candidateValues(value, tableFor(series));
  const idx = nearestIndex(value, sorted);
  const below = sorted.slice(Math.max(0, idx - k), idx);
  const above = sorted.slice(idx + 1, idx + 1 + k);
  return [...below, ...above];
}
