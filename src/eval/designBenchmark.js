/**
 * designBenchmark.js — end-to-end design capability on the benchmark.
 *
 * For every dataset case whose type is SPICE-verifiable, run the full
 * design→snap→verify→refine pipeline on the GROUND-TRUTH spec (so parsing is
 * factored out) and record whether it converged within tolerance, the honest
 * measured error, and the iteration count. Reports the aggregate "design
 * success rate" and mean error, plus a per-type breakdown.
 *
 * Runs in the browser (needs the wasm engine). Dev hook: window.__designBench().
 */

import { designAndVerify } from "../design/loop";
import { runSpice } from "../sim/spice";
import { isVerifiable } from "../agents/simulatorAgent";
import { makeSpec } from "../spec/circuitSpec";
import { DATASET } from "./benchmarkDataset";

export async function runDesignBenchmark({ runSpice: sim = runSpice, dataset = DATASET, onProgress } = {}) {
  const cases = dataset.filter((d) => isVerifiable(d.type));
  const rows = [];
  for (let i = 0; i < cases.length; i++) {
    const d = cases[i];
    const spec = makeSpec({ type: d.type, targets: d.targets, confidence: 1 });
    let res;
    try {
      res = await designAndVerify(spec, { runSpice: sim });
    } catch (e) {
      res = { converged: false, errorPct: null, iterations: 0, verifiable: true, error: String(e) };
    }
    rows.push({
      id: d.id,
      type: d.type,
      prompt: d.prompt,
      converged: !!res.converged,
      errorPct: res.errorPct,
      iterations: res.iterations,
    });
    if (onProgress) onProgress((i + 1) / cases.length, rows[rows.length - 1]);
  }

  const n = rows.length;
  const withErr = rows.filter((r) => r.errorPct != null);
  const byType = {};
  for (const r of rows) {
    const g = (byType[r.type] = byType[r.type] || { n: 0, converged: 0, errSum: 0, errN: 0 });
    g.n += 1;
    if (r.converged) g.converged += 1;
    if (r.errorPct != null) { g.errSum += r.errorPct; g.errN += 1; }
  }
  const perType = {};
  for (const t of Object.keys(byType)) {
    const g = byType[t];
    perType[t] = { n: g.n, convergedRate: +(g.converged / g.n).toFixed(3), meanErrorPct: g.errN ? +((g.errSum / g.errN) * 100).toFixed(2) : null };
  }

  return {
    n,
    convergedRate: +(rows.filter((r) => r.converged).length / n).toFixed(3),
    meanErrorPct: withErr.length ? +((withErr.reduce((a, r) => a + r.errorPct, 0) / withErr.length) * 100).toFixed(2) : null,
    perType,
    rows,
  };
}

// Dev-only browser hook: await window.__designBench()
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  window.__designBench = async (opts = {}) => {
    // eslint-disable-next-line no-console
    console.log("[designBench] running… (real ngspice)");
    const r = await runDesignBenchmark({
      onProgress: (p, row) =>
        // eslint-disable-next-line no-console
        console.log(`[designBench] ${(p * 100).toFixed(0)}%  ${row.id} ${row.type}  ${row.converged ? "OK" : "MISS"}  err ${row.errorPct == null ? "n/a" : (row.errorPct * 100).toFixed(1) + "%"}`),
      ...opts,
    });
    // eslint-disable-next-line no-console
    console.table(r.perType);
    // eslint-disable-next-line no-console
    console.log(`[designBench] converged ${(r.convergedRate * 100).toFixed(1)}% of ${r.n} | mean error ${r.meanErrorPct}%`);
    return r;
  };
}
