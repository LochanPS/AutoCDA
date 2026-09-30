/**
 * reasoningLoop.js — angle 4: does a closed reasoning loop beat the fixed grid?
 *
 * For every SPICE-verifiable dataset case, run the full design pipeline twice on
 * the GROUND-TRUTH spec (parsing factored out):
 *   grid       RefineAgent — sweep a fixed E-series neighbourhood of the snap
 *   reasoning  ReasoningAgent — propose → SPICE-grade → observe → re-propose
 * Both are graded by the SAME real ngspice engine, so the comparison is honest.
 * Reports convergence rate, mean measured error, and mean simulation count for
 * each strategy, plus the per-case detail.
 *
 * Pass { propose: llmReasoningProposer() } to put a real Claude call in the loop
 * (needs a key); omit it for the deterministic secant proposer (no key).
 *
 * Runs in the browser (needs the wasm engine). Dev hook: window.__reasoningLoop().
 */

import { orchestrate } from "../agents/orchestrator";
import { runSpice } from "../sim/spice";
import { isVerifiable } from "../agents/simulatorAgent";
import { makeSpec } from "../spec/circuitSpec";
import { DATASET } from "./benchmarkDataset";

const agg = (rows, pick) => {
  const vals = rows.map(pick).filter((x) => x != null && isFinite(x));
  return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(4) : null;
};

export async function runReasoningLoop({ runSpice: sim = runSpice, dataset = DATASET, tolerance = 0.05, propose, onProgress } = {}) {
  const cases = dataset.filter((d) => isVerifiable(d.type));
  const rows = [];

  for (let i = 0; i < cases.length; i++) {
    const d = cases[i];
    const spec = makeSpec({ type: d.type, targets: d.targets, confidence: 1, constraints: { tolerance } });
    let grid, reason;
    try {
      grid = await orchestrate(spec, { runSpice: sim, strategy: "grid" });
    } catch (e) {
      grid = { converged: false, errorPct: null, iterations: 0, error: String(e) };
    }
    try {
      reason = await orchestrate(spec, { runSpice: sim, strategy: "reasoning", propose });
    } catch (e) {
      reason = { converged: false, errorPct: null, iterations: 0, error: String(e) };
    }
    rows.push({
      id: d.id,
      type: d.type,
      gridConverged: grid.converged,
      gridErrorPct: grid.errorPct,
      gridSims: grid.iterations,
      reasonConverged: reason.converged,
      reasonErrorPct: reason.errorPct,
      reasonSims: reason.iterations,
    });
    if (onProgress) onProgress((i + 1) / cases.length, rows[rows.length - 1]);
  }

  const rate = (key) => +(rows.filter((r) => r[key]).length / rows.length).toFixed(3);
  const summary = {
    n: rows.length,
    grid: { convergence: rate("gridConverged"), meanErrorPct: agg(rows, (r) => r.gridErrorPct), meanSims: agg(rows, (r) => r.gridSims) },
    reasoning: { convergence: rate("reasonConverged"), meanErrorPct: agg(rows, (r) => r.reasonErrorPct), meanSims: agg(rows, (r) => r.reasonSims) },
  };
  return { ...summary, rows };
}

// Dev-only browser hook.
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  window.__reasoningLoop = async (opts = {}) => {
    const r = await runReasoningLoop({ ...opts, onProgress: (p) => (p * 100).toFixed(0) });
    // eslint-disable-next-line no-console
    console.table({ grid: r.grid, reasoning: r.reasoning });
    // eslint-disable-next-line no-console
    console.log(`[reasoningLoop] n=${r.n} | grid ${(r.grid.convergence * 100).toFixed(0)}% @ ${r.grid.meanSims} sims | reasoning ${(r.reasoning.convergence * 100).toFixed(0)}% @ ${r.reasoning.meanSims} sims`);
    return r;
  };
}
