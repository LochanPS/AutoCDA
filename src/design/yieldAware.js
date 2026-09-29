/**
 * yieldAware.js — sensitivity-aware, yield-maximizing E-series selection.
 *
 * Baseline snapping picks the E-series value nearest each ideal component. That
 * minimizes nominal component error, but the OUTPUT metric can still sit
 * off-centre inside the spec band, wasting tolerance headroom on one side and
 * losing manufacturing yield.
 *
 * This module instead searches the E-series neighbourhood of every passive and
 * picks the combination whose predicted output metric is best centred in the
 * spec band (and whose spread is smallest). It estimates each candidate's yield
 * WITHOUT re-simulating it: one nominal measurement plus a finite-difference
 * sensitivity per passive (2 sims each) linearise the metric, and every
 * candidate combination is then scored in closed form.
 *
 *   M(cand) ≈ M0 + Σ Sᵢ · (candᵢ − baseᵢ)/baseᵢ           (mean)
 *   Var(M)  ≈ Σ Sᵢ² · tol²/3     (each part uniform in ±tol)  (spread)
 *   yield   = P(target(1−tol) ≤ M ≤ target(1+tol))          (Gaussian CLT)
 *
 * Cost: 1 + 2·(#passives) simulations regardless of how many candidates are
 * scored. The SPICE-dependent search lives in selectYieldAware(); the scoring
 * math is pure and unit-tested.
 */

import { snap, neighbors } from "./eseries";
import { simulateMeasure, circuitTargetInfo, isVerifiable, dominantRef } from "../agents/simulatorAgent";
import { runToleranceSweep } from "./montecarlo";

// ── pure scoring math ─────────────────────────────────────────────────────────

// Abramowitz-Stegun error function (max abs error ~1.5e-7).
export function erf(x) {
  const s = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}

export function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

/** Probability a Normal(mean, sigma) falls in [lo, hi]. */
export function yieldForMean(mean, sigma, lo, hi) {
  if (!(sigma > 0)) return mean >= lo && mean <= hi ? 1 : 0;
  return Math.max(0, normalCdf((hi - mean) / sigma) - normalCdf((lo - mean) / sigma));
}

/** Linearised metric mean for a candidate value map. */
export function predictMetric(M0, sens, base, cand) {
  let m = M0;
  for (const ref of Object.keys(sens)) {
    const b = base[ref];
    if (!b) continue;
    m += sens[ref] * ((cand[ref] - b) / b);
  }
  return m;
}

/** Manufacturing spread of the metric from ±tol uniform part variation. */
export function manufacturingSigma(sens, tol) {
  let v = 0;
  for (const ref of Object.keys(sens)) v += sens[ref] * sens[ref];
  return Math.sqrt((v * tol * tol) / 3);
}

/**
 * Score a candidate: predicted metric, predicted yield, nominal error.
 * @param {Object} cand  { ref: value }
 * @param {{M0, sens, base, target, tol}} ctx
 */
export function scoreCandidate(cand, { M0, sens, base, target, tol }) {
  const predM = predictMetric(M0, sens, base, cand);
  const sigma = manufacturingSigma(sens, tol);
  const lo = target * (1 - tol);
  const hi = target * (1 + tol);
  return {
    values: cand,
    predMetric: predM,
    predYield: yieldForMean(predM, sigma, lo, hi),
    nominalError: Math.abs((predM - target) / target),
  };
}

/**
 * Cartesian product of each passive's E-series candidate values, bounded so the
 * total number of combinations stays <= maxCombos (k shrinks if needed).
 */
export function enumerateCandidates(base, passiveRefs, series, { k = 2, maxCombos = 256 } = {}) {
  let kk = k;
  let lists;
  do {
    lists = passiveRefs.map((ref) => {
      const set = new Set([snap(base[ref], series), ...neighbors(base[ref], series, kk)]);
      return { ref, values: [...set] };
    });
    const total = lists.reduce((n, l) => n * l.values.length, 1);
    if (total <= maxCombos || kk <= 1) break;
    kk -= 1;
  } while (kk >= 1);

  const combos = [{ ...base }];
  for (const { ref, values } of lists) {
    const next = [];
    for (const combo of combos) {
      for (const v of values) next.push({ ...combo, [ref]: v });
    }
    combos.length = 0;
    combos.push(...next);
  }
  return combos;
}

// ── SPICE-backed selection ────────────────────────────────────────────────────

function valueMap(components) {
  const m = {};
  for (const c of components) if (c.rawValue != null) m[c.ref] = c.rawValue;
  return m;
}
const isPassive = (c) => c.unit === "Ω" || c.unit === "F";

/**
 * Pick the yield-maximizing E-series component set.
 * @param {import('../spec/circuitSpec').CircuitSpec} spec
 * @param {{components: Array}} ideal  formula-engine ideal design
 * @param {{ runSpice, k?, onStatus? }} deps
 * @returns {Promise<{ ok, components?, predictedYield?, predictedError?, sensitivities?, considered?, reason? }>}
 */
export async function selectYieldAware(spec, ideal, { runSpice, k = 2, onStatus, verifyMC = null } = {}) {
  const type = spec.type;
  const targets = spec.targets || {};
  const series = spec.constraints?.eSeries || "E24";
  const tol = spec.constraints?.tolerance ?? 0.05;

  if (!isVerifiable(type)) return { ok: false, reason: "not SPICE-verifiable" };
  const info = circuitTargetInfo(type, targets);
  const target = info.value;

  // Base = nominal-snapped values (the baseline design).
  const base = {};
  for (const c of ideal.components) {
    if (isPassive(c)) base[c.ref] = snap(c.rawValue, series);
    else if (c.rawValue != null) base[c.ref] = c.rawValue;
  }
  const passiveRefs = ideal.components.filter(isPassive).map((c) => c.ref);

  // 1 nominal + 2 sims/passive to linearise the metric.
  if (onStatus) onStatus("Measuring metric sensitivities");
  const M0 = await simulateMeasure(type, targets, base, { runSpice });
  if (M0 == null || !isFinite(M0)) return { ok: false, reason: "nominal measurement failed" };

  const sens = {};
  for (const ref of passiveRefs) {
    const up = { ...base, [ref]: base[ref] * (1 + tol) };
    const dn = { ...base, [ref]: base[ref] * (1 - tol) };
    const Mu = await simulateMeasure(type, targets, up, { runSpice });
    const Md = await simulateMeasure(type, targets, dn, { runSpice });
    sens[ref] = (Mu != null && Md != null && isFinite(Mu) && isFinite(Md)) ? (Mu - Md) / (2 * tol) : 0;
  }

  // Score every E-series combination in closed form; rank by predicted yield.
  if (onStatus) onStatus("Scoring E-series combinations for yield");
  const combos = enumerateCandidates(base, passiveRefs, series, { k });
  const ctx = { M0, sens, base, target, tol };
  const scored = combos
    .map((cand) => scoreCandidate(cand, ctx))
    .sort((a, b) => (b.predYield - a.predYield) || (a.nominalError - b.nominalError));

  let best = scored[0];
  let trueYield = null;

  // Optional: verify the top-K candidates AND the baseline with real Monte-Carlo,
  // then pick the empirically best. The baseline snapped combo is always in the
  // shortlist, so the chosen design provably matches or beats it (up to MC noise).
  if (verifyMC) {
    const topK = verifyMC.topK ?? 4;
    const shortlist = scored.slice(0, topK);
    const baseScore = scoreCandidate(base, ctx);
    if (!shortlist.some((s) => sameMap(s.values, base))) shortlist.push(baseScore);
    if (onStatus) onStatus(`Verifying ${shortlist.length} candidates with Monte-Carlo`);

    const margin = verifyMC.margin ?? 0.01;
    const vN = verifyMC.N ?? 100;
    // Common random numbers: one shared set of perturbation vectors scored
    // against every candidate, so yield differences are signal, not noise.
    const draws = [];
    for (let i = 0; i < vN; i++) {
      const d = {};
      for (const ref of passiveRefs) d[ref] = (Math.random() * 2 - 1) * tol;
      draws.push(d);
    }
    let bestTrue = null;
    let baseTrue = null;
    for (const s of shortlist) {
      const comps = componentsFrom(ideal.components, s.values);
      const mc = await runToleranceSweep(spec, comps, { runSpice, draws });
      s.trueYield = mc.yield;
      if (bestTrue == null || mc.yield > bestTrue.trueYield) bestTrue = s;
      if (sameMap(s.values, base)) baseTrue = s;
    }
    // Hysteresis: keep the baseline unless a candidate beats it by a clear margin.
    // Prevents chasing Monte-Carlo noise on designs that are already well centred.
    if (baseTrue && bestTrue.trueYield <= baseTrue.trueYield + margin) {
      best = baseTrue;
    } else {
      best = bestTrue;
    }
    trueYield = best.trueYield;
  }

  return {
    ok: true,
    components: componentsFrom(ideal.components, best.values),
    predictedYield: best.predYield,
    predictedError: best.nominalError,
    predictedMetric: best.predMetric,
    trueYield,
    targetName: info.name,
    target,
    sensitivities: sens,
    considered: combos.length,
    dominant: dominantRef(type),
  };
}

function sameMap(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (a[k] !== b[k]) return false;
  return true;
}

function componentsFrom(idealComponents, values) {
  return idealComponents.map((c) =>
    values[c.ref] != null && isPassive(c) ? { ...c, rawValue: values[c.ref] } : { ...c }
  );
}
