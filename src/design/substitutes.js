/**
 * substitutes.js — C4: when the ideal part is unavailable or expensive, suggest a
 * buyable equivalent and RE-VERIFY it in SPICE so the swap is still within spec.
 *
 * "Equivalent" here means a nearby standard (E-series) value whose use keeps the
 * circuit's measured error within tolerance — not just a part with the same
 * printed value. We propose candidates by value proximity, then (optionally) run
 * each through the same simulator the design was verified with and keep only the
 * ones that still pass. The simulator, not a datasheet match, decides.
 *
 * Pure over the injected grader, so it tests without the wasm engine.
 */
import { neighbors, snap } from "./eseries";
import { simulatorAgent } from "../agents/simulatorAgent";

const finite = (x) => typeof x === "number" && isFinite(x);

/**
 * Nearby standard values within `within` (fractional) of `value`, closest first,
 * excluding the value itself. These are the buyable alternatives to try.
 * @param {number} value
 * @param {{within?:number, series?:string, k?:number}} [opts]
 * @returns {Array<{value:number, deltaPct:number}>}
 */
export function substituteValues(value, { within = 0.02, series = "E96", k = 10 } = {}) {
  if (!finite(value) || value <= 0) return [];
  const self = snap(value, series);
  const cands = [...new Set([...neighbors(value, series, k)])]
    .filter((v) => finite(v) && v > 0 && v !== self)
    .map((v) => ({ value: v, deltaPct: (v - value) / value }))
    .filter((c) => Math.abs(c.deltaPct) <= within)
    .sort((a, b) => Math.abs(a.deltaPct) - Math.abs(b.deltaPct));
  return cands.map((c) => ({ value: c.value, deltaPct: +(c.deltaPct * 100).toFixed(3) }));
}

const valueMapOf = (components) => {
  const m = {};
  for (const c of components || []) if (c.rawValue != null) m[c.ref] = c.rawValue;
  return m;
};

/**
 * Re-verify a design with one component swapped to `newValue`. Returns the measured
 * result and whether it still meets tolerance. Pure over the injected grader.
 * @param {{type, targets, components, ref, newValue, tolerance?, runSpice?, simulate?}} input
 * @returns {Promise<{ref, newValue, measured, target, errorPct, ok}>}
 */
export async function reVerifyWithSubstitute({ type, targets, components, ref, newValue, tolerance = 0.05, runSpice, simulate }) {
  const valueMap = { ...valueMapOf(components), [ref]: newValue };
  const grade = simulate || ((a) => simulatorAgent({ type, targets, valueMap: a.valueMap, runSpice }));
  const sim = await grade({ valueMap });
  const measured = sim && sim.measured;
  const target = sim && sim.target;
  const errorPct = finite(measured) && finite(target) && target !== 0 ? Math.abs((measured - target) / target) : null;
  return { ref, newValue, measured, target, errorPct, ok: errorPct != null && errorPct <= tolerance };
}

/**
 * Propose SPICE-verified substitutes for one component: nearby standard values that
 * still keep the whole circuit within tolerance, best (closest) first. Bounded by
 * `max` candidates to keep the simulation count small.
 * @returns {Promise<Array<{value, deltaPct, measured, errorPct, ok}>>}
 */
export async function proposeVerifiedSubstitutes({ type, targets, components, ref, within = 0.02, series, tolerance = 0.05, max = 5, runSpice, simulate }) {
  const comp = (components || []).find((c) => c.ref === ref);
  if (!comp || comp.rawValue == null) return [];
  const ser = series || (comp.unit === "F" ? "E24" : "E96");
  const candidates = substituteValues(comp.rawValue, { within, series: ser }).slice(0, max);
  const out = [];
  for (const c of candidates) {
    const r = await reVerifyWithSubstitute({ type, targets, components, ref, newValue: c.value, tolerance, runSpice, simulate });
    out.push({ value: c.value, deltaPct: c.deltaPct, measured: r.measured, errorPct: r.errorPct, ok: r.ok });
  }
  // Verified (ok) first, then by smallest error.
  return out.sort((a, b) => (b.ok - a.ok) || ((a.errorPct ?? 1) - (b.errorPct ?? 1)));
}
