/**
 * metrics.js — richer measured metrics (Theme B2).
 *
 * The numbers a pro checks before trusting a block. These are pure analyzers over
 * already-run simulation data (no wasm dependency), split by the analysis that
 * feeds them:
 *   • transient step response → settling time, slew rate, overshoot, rise time
 *   • AC open-loop gain/phase  → phase margin, gain margin, unity-gain bandwidth
 *   • two-point measurements   → output impedance, PSRR
 * THD and line/load regulation live in transient.js (they fall out of the same
 * oscillator / regulator waveforms B1 already runs).
 *
 * The transient analyzers reuse the signed node lookup from measure.js, so they
 * read the same { sweep, nodes } result shape spice.js emits for a `.tran` run.
 */

import { nodeMag } from "./measure";

const signal = (result, node) =>
  (node && nodeMag(result, node)) ||
  (result && result.nodes ? result.nodes[Object.keys(result.nodes).pop()] : null);

// ── transient step-response metrics ───────────────────────────────────────────

/**
 * Settling time: the time from t0 to the last instant the signal is OUTSIDE a
 * ±`band` tolerance around its final value (default 2 %). The settled value is
 * the mean of the last `tailFrac` of the run. Returns seconds, or null.
 */
export function measureSettlingTime(result, node, { band = 0.02, tailFrac = 0.1 } = {}) {
  const t = result.sweep;
  const y = signal(result, node);
  if (!t || !y || y.length < 4) return null;
  const start = Math.max(0, Math.floor(y.length * (1 - tailFrac)));
  let fin = 0;
  for (let i = start; i < y.length; i++) fin += y[i];
  fin /= y.length - start;
  const tol = Math.abs(fin) * band || band;
  let lastOut = 0;
  for (let i = 0; i < y.length; i++) if (Math.abs(y[i] - fin) > tol) lastOut = i;
  return t[lastOut] - t[0];
}

/**
 * Slew rate: the maximum |dV/dt| over the run (V/s). For a step response this is
 * the steepest edge — the amplifier's large-signal speed limit. Returns V/s.
 */
export function measureSlewRate(result, node) {
  const t = result.sweep;
  const y = signal(result, node);
  if (!t || !y || y.length < 2) return null;
  let max = 0;
  for (let i = 1; i < y.length; i++) {
    const dt = t[i] - t[i - 1];
    if (dt <= 0) continue;
    const s = Math.abs((y[i] - y[i - 1]) / dt);
    if (s > max) max = s;
  }
  return max;
}

/**
 * Percent overshoot of a step response: how far the peak exceeds the final value,
 * relative to the step size (final − initial). Returns percent (0 = no overshoot).
 */
export function measureOvershoot(result, node, { tailFrac = 0.1 } = {}) {
  const y = signal(result, node);
  if (!y || y.length < 4) return null;
  const start = Math.max(0, Math.floor(y.length * (1 - tailFrac)));
  let fin = 0;
  for (let i = start; i < y.length; i++) fin += y[i];
  fin /= y.length - start;
  const y0 = y[0];
  const step = fin - y0;
  if (step === 0) return 0;
  let peak = y0;
  for (const v of y) {
    if (step > 0 ? v > peak : v < peak) peak = v;
  }
  const os = ((peak - fin) / step) * 100;
  return os > 0 ? os : 0;
}

/**
 * Rise time: time for a monotonic step to go from `lo`..`hi` fraction of its
 * total swing (default 10 %–90 %). Returns seconds, or null.
 */
export function measureRiseTime(result, node, { lo = 0.1, hi = 0.9, tailFrac = 0.1 } = {}) {
  const t = result.sweep;
  const y = signal(result, node);
  if (!t || !y || y.length < 4) return null;
  const start = Math.max(0, Math.floor(y.length * (1 - tailFrac)));
  let fin = 0;
  for (let i = start; i < y.length; i++) fin += y[i];
  fin /= y.length - start;
  const y0 = y[0];
  const span = fin - y0;
  if (span === 0) return null;
  const loV = y0 + lo * span;
  const hiV = y0 + hi * span;
  const cross = (level) => {
    for (let i = 1; i < y.length; i++) {
      const a = y[i - 1];
      const b = y[i];
      if ((a < level && b >= level) || (a > level && b <= level)) {
        const f = (level - a) / (b - a || 1);
        return t[i - 1] + f * (t[i] - t[i - 1]);
      }
    }
    return null;
  };
  const tLo = cross(loV);
  const tHi = cross(hiV);
  return tLo != null && tHi != null ? Math.abs(tHi - tLo) : null;
}

// ── AC open-loop stability metrics ────────────────────────────────────────────

/**
 * Phase & gain margin from an open-loop Bode response. `freq`, `gainDb`, and
 * `phaseDeg` are equal-length arrays from an AC sweep (phaseDeg is the loop
 * phase; wrap it continuously, i.e. −180…−360 for a rolling-off loop).
 *   phase margin = 180° + phase at the unity-gain (0 dB) crossover
 *   gain margin  = −gain(dB) at the −180° phase crossover
 * Returns { phaseMargin, gainMargin, crossoverHz, phaseCrossHz } (nulls if the
 * relevant crossing isn't in range). Interpolated in log-frequency.
 */
export function measureStability(freq, gainDb, phaseDeg) {
  if (!freq || !gainDb || !phaseDeg || freq.length < 2) return null;
  const logInterp = (i, a, lvl, b) => {
    const t = (lvl - a) / (b - a || 1);
    return Math.pow(10, Math.log10(freq[i - 1]) + t * (Math.log10(freq[i]) - Math.log10(freq[i - 1])));
  };
  let crossoverHz = null;
  let phaseMargin = null;
  for (let i = 1; i < gainDb.length; i++) {
    const a = gainDb[i - 1];
    const b = gainDb[i];
    if ((a >= 0 && b < 0) || (a < 0 && b >= 0)) {
      crossoverHz = logInterp(i, a, 0, b);
      const t = (0 - a) / (b - a || 1);
      const ph = phaseDeg[i - 1] + t * (phaseDeg[i] - phaseDeg[i - 1]);
      phaseMargin = 180 + ph;
      break;
    }
  }
  let phaseCrossHz = null;
  let gainMargin = null;
  for (let i = 1; i < phaseDeg.length; i++) {
    const a = phaseDeg[i - 1];
    const b = phaseDeg[i];
    if ((a >= -180 && b < -180) || (a < -180 && b >= -180)) {
      phaseCrossHz = logInterp(i, a, -180, b);
      const t = (-180 - a) / (b - a || 1);
      gainMargin = -(gainDb[i - 1] + t * (gainDb[i] - gainDb[i - 1]));
      break;
    }
  }
  return { phaseMargin, gainMargin, crossoverHz, phaseCrossHz };
}

// ── two-point small-signal metrics ────────────────────────────────────────────

/**
 * Output impedance from a no-load vs loaded DC/AC measurement:
 *   Zout = (Vopen − Vloaded) / Iload,  where Iload = Vloaded / Rload.
 * Give the open-circuit output, the loaded output, and the load resistance.
 * Returns ohms, or null.
 */
export function measureOutputImpedance(vOpen, vLoaded, rLoad) {
  if (![vOpen, vLoaded, rLoad].every((x) => typeof x === "number" && isFinite(x)) || rLoad <= 0) return null;
  const iLoad = vLoaded / rLoad;
  if (iLoad === 0) return null;
  return (vOpen - vLoaded) / iLoad;
}

/**
 * Power-supply rejection ratio in dB: how much a ripple on the supply is
 * attenuated at the output. Give the supply ripple amplitude and the resulting
 * output ripple amplitude (same units). PSRR(dB) = 20·log10(ΔVsupply/ΔVout).
 * Higher is better. Returns dB, or null.
 */
export function measurePSRR(supplyRipple, outputRipple) {
  if (![supplyRipple, outputRipple].every((x) => typeof x === "number" && isFinite(x))) return null;
  if (outputRipple <= 0 || supplyRipple <= 0) return null;
  return 20 * Math.log10(supplyRipple / outputRipple);
}
