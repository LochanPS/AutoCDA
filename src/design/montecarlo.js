/**
 * montecarlo.js — manufacturing-yield tolerance analysis.
 *
 * Given a verified design, perturb every passive component independently within
 * its tolerance band, run the REAL ngspice-wasm simulation N times, and report
 * the distribution of the key metric plus the yield (fraction of runs that land
 * within spec). This is genuine manufacturing rigor: the same independent
 * simulator that verifies the nominal design measures every perturbed sample.
 *
 * Reuses the per-type netlist/measure primitives from src/design/loop.js.
 */

import { simulateMeasure, circuitTargetInfo, isVerifiable } from "./loop";

function buildHistogram(samples, binCount, lo, hi) {
  const bins = new Array(binCount).fill(0).map((_, i) => ({
    x0: lo + ((hi - lo) * i) / binCount,
    x1: lo + ((hi - lo) * (i + 1)) / binCount,
    count: 0,
  }));
  const span = hi - lo || 1;
  for (const v of samples) {
    let idx = Math.floor(((v - lo) / span) * binCount);
    if (idx < 0) idx = 0;
    if (idx >= binCount) idx = binCount - 1;
    bins[idx].count += 1;
  }
  return bins.map((b) => ({ ...b, center: (b.x0 + b.x1) / 2 }));
}

/**
 * @param {import('../spec/circuitSpec').CircuitSpec} spec
 * @param {Array<{ref, rawValue, unit}>} components  the verified (nominal) parts
 * @param {{ runSpice, N?, bins?, onProgress? }} opts
 * @returns {Promise<object>} sweep result (see fields below)
 */
export async function runToleranceSweep(spec, components, { runSpice, N = 200, bins = 20, onProgress } = {}) {
  const type = spec.type;
  if (!isVerifiable(type)) return { supported: false };

  const targets = spec.targets || {};
  const tol = spec.constraints?.tolerance ?? 0.05;
  const info = circuitTargetInfo(type, targets);
  const target = info ? info.value : null;

  // Nominal value map + which refs get perturbed (passives only).
  const nominal = {};
  const passiveRefs = [];
  for (const c of components || []) {
    if (c.rawValue != null) nominal[c.ref] = c.rawValue;
    if (c.unit === "Ω" || c.unit === "F") passiveRefs.push(c.ref);
  }

  const samples = [];
  let inSpec = 0;
  for (let i = 0; i < N; i++) {
    const vals = { ...nominal };
    for (const ref of passiveRefs) {
      const factor = 1 + (Math.random() * 2 - 1) * tol; // uniform in ±tolerance
      vals[ref] = nominal[ref] * factor;
    }
    const measured = await simulateMeasure(type, targets, vals, { runSpice });
    if (measured != null && isFinite(measured)) {
      samples.push(measured);
      if (target && Math.abs((measured - target) / target) <= tol) inSpec += 1;
    }
    if (onProgress && (i % 5 === 0 || i === N - 1)) onProgress((i + 1) / N);
  }

  const n = samples.length;
  const mean = n ? samples.reduce((a, b) => a + b, 0) / n : 0;
  const std = n ? Math.sqrt(samples.reduce((a, b) => a + (b - mean) ** 2, 0) / n) : 0;
  const min = n ? Math.min(...samples) : 0;
  const max = n ? Math.max(...samples) : 0;

  return {
    supported: true,
    N,
    n,
    samples,
    yield: inSpec / N, // out of all attempts (failed sims count as out of spec)
    inSpec,
    mean,
    std,
    min,
    max,
    target,
    targetName: info ? info.name : null,
    tolerance: tol,
    bins: buildHistogram(samples, bins, min, max),
  };
}
