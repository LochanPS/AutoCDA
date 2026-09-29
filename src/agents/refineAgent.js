/**
 * RefineAgent — the deterministic E-series local search.
 *
 * Starting from the snapped design, it tries the dominant component's snapped
 * value and its nearest E-series neighbours, measuring each with the
 * SimulatorAgent, and keeps the one with the lowest honest (measured) error.
 * Bounded to MAX_ITERATIONS simulations; deterministic (fixed neighbourhood and
 * order). NO randomness, NO LLM.
 *
 * @typedef {Object} RefineOutput
 * @property {string} dominant
 * @property {{candidate:number, measured:number, errorPct:number}|null} best
 * @property {Array<{ref, value, measured, errorPct}>} trace
 * @property {number} iterations
 * @property {string[]} errors
 */

import { snap, neighbors } from "../design/eseries";
import { simulatorAgent, dominantRef } from "./simulatorAgent";

export const MAX_ITERATIONS = 5;

function valueMap(components) {
  const m = {};
  for (const c of components) if (c.rawValue != null) m[c.ref] = c.rawValue;
  return m;
}

/**
 * @param {{type, targets, snapped, idealComponents, tolerance, eSeries, runSpice, onStatus?}} input
 * @returns {Promise<RefineOutput>}
 */
export async function refineAgent({ type, targets, snapped, idealComponents, tolerance = 0.05, eSeries = "E24", runSpice, onStatus }) {
  const dominant = dominantRef(type);
  const dominantIdeal = valueMap(idealComponents)[dominant];

  // Candidate set: snapped value first, then its E-series neighbours. Bounded.
  const snappedDominant = snap(dominantIdeal, eSeries);
  const candidateSet = [snappedDominant, ...neighbors(dominantIdeal, eSeries, 2)];
  const candidates = [...new Set(candidateSet)].slice(0, MAX_ITERATIONS);

  const baseVals = valueMap(snapped);
  const trace = [];
  let best = null;
  let errors = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const vals = { ...baseVals, [dominant]: candidate };
    if (onStatus) onStatus(`Simulating ${dominant} candidate ${i + 1}/${candidates.length}`);

    const sim = await simulatorAgent({ type, targets, valueMap: vals, runSpice });
    errors = sim.errors;
    const measured = sim.measured;
    const errorPct =
      measured == null || !isFinite(measured)
        ? null
        : Math.abs((measured - sim.target) / sim.target);

    trace.push({ ref: dominant, value: candidate, measured, errorPct });

    if (errorPct != null && (best == null || errorPct < best.errorPct)) {
      best = { candidate, measured, errorPct };
    }
    // Early exit once within tolerance (deterministic order preserved).
    if (errorPct != null && errorPct <= tolerance) break;
  }

  return { dominant, best, trace, iterations: trace.length, errors };
}
