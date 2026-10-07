/**
 * transient.js — pure analyzers over a parsed SPICE *transient* result (B1).
 *
 * Phase-1/2 verification could only measure AC (gain, -3 dB) and DC (node V, I).
 * Two circuit types had no honest measurement path and were "analytical-only":
 *   • oscillators — their defining number (oscillation frequency, amplitude) only
 *     exists in the time domain; an AC sweep of the frequency network is a proxy.
 *   • zener / shunt regulators — line and load regulation only show up when the
 *     supply or the load actually moves.
 *
 * These analyzers close that gap. They are pure (no wasm dependency), so agents
 * and tests import them directly; spice.js parses a `.tran` run into the same
 * { sweep, nodes } shape the AC/DC analyzers already consume, with `sweepType`
 * === "time" and `sweep` the (generally non-uniform) time axis.
 *
 * Public API:
 *   spectrum(result, node, opts)            → { freq[], mag[], df, dt, N }
 *   measureOscillation(result, node, opts)  → { freq, vpp, amplitude, rms, dcOffset, method }
 *   measureFrequency(result, node, opts)    → number|null  (oscillation freq, Hz)
 *   measureTHD(result, node, opts)          → number|null  (total harmonic distortion, ratio)
 *   measureSettled(result, node, opts)      → number|null  (steady-state value)
 *   measureLineRegulation(result, opts)     → { dVout, dVin, perVolt, percent }|null
 *   measureLoadRegulation(result, opts)     → { before, after, dVout }|null
 *
 * Also exports the building blocks (fft, resampleUniform, zeroCrossFrequency) so
 * they can be unit-tested and reused.
 */

import { nodeMag } from "./measure";

// ── FFT (radix-2 Cooley–Tukey, in-place) ─────────────────────────────────────

/** Smallest power of two ≥ n. */
export function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * In-place radix-2 FFT. `re`/`im` are Float64Array of equal, power-of-two length.
 * Transforms in place; no return value.
 */
export function fft(re, im) {
  const N = re.length;
  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  // Butterflies.
  for (let len = 2; len <= N; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len >> 1; k++) {
        const a = i + k;
        const b = a + (len >> 1);
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

// ── resampling (SPICE transient time steps are non-uniform) ───────────────────

/**
 * Resample a monotonic (t, y) series onto M uniformly-spaced samples spanning
 * [t0, tEnd], by linear interpolation. Returns { y: Float64Array, dt }.
 */
export function resampleUniform(t, y, M) {
  const t0 = t[0];
  const tEnd = t[t.length - 1];
  const dt = (tEnd - t0) / (M - 1);
  const out = new Float64Array(M);
  let j = 0;
  for (let i = 0; i < M; i++) {
    const tt = t0 + i * dt;
    while (j < t.length - 2 && t[j + 1] < tt) j++;
    const span = t[j + 1] - t[j] || 1;
    const f = (tt - t[j]) / span;
    out[i] = y[j] + f * (y[j + 1] - y[j]);
  }
  return { y: out, dt };
}

// Hann window in place; returns the coherent-gain factor (sum(w)/N) for scaling.
function hann(buf) {
  const N = buf.length;
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
    buf[i] *= w;
    sum += w;
  }
  return sum / N;
}

// ── internal: pull a settled, mean-removed, uniformly-resampled window ────────

function settledSamples(result, node, { settle = 0.4, window = true } = {}) {
  const t = result.sweep;
  const y = nodeMag(result, node) || (node ? null : result.nodes[Object.keys(result.nodes).pop()]);
  if (!t || !y || t.length < 8) return null;

  const start = Math.floor(t.length * settle);
  const ts = t.slice(start);
  const ys = y.slice(start);
  if (ts.length < 4) return null;

  const M = nextPow2(ts.length);
  const { y: ru, dt } = resampleUniform(ts, ys, M);

  // Remove DC so the fundamental, not the 0 Hz bin, dominates.
  let mean = 0;
  for (let i = 0; i < M; i++) mean += ru[i];
  mean /= M;
  const ac = new Float64Array(M);
  for (let i = 0; i < M; i++) ac[i] = ru[i] - mean;

  let cg = 1;
  if (window) cg = hann(ac);
  return { ac, dt, M, dcOffset: mean, cg };
}

// ── spectrum ──────────────────────────────────────────────────────────────────

/**
 * One-sided magnitude spectrum of the steady-state AC component of `node`.
 * @returns {{freq:number[], mag:number[], df:number, dt:number, N:number}|null}
 */
export function spectrum(result, node, opts = {}) {
  const s = settledSamples(result, node, opts);
  if (!s) return null;
  const { ac, dt, M } = s;
  const re = Float64Array.from(ac);
  const im = new Float64Array(M);
  fft(re, im);
  const half = M >> 1;
  const df = 1 / (dt * M);
  const freq = new Array(half);
  const mag = new Array(half);
  for (let i = 0; i < half; i++) {
    freq[i] = i * df;
    mag[i] = Math.hypot(re[i], im[i]);
  }
  return { freq, mag, df, dt, N: M };
}

// ── oscillation frequency + amplitude ─────────────────────────────────────────

/**
 * Zero-crossing frequency of a (t, y) series over its steady-state tail.
 * Counts rising crossings of the mean and divides by the time they span, with
 * linear interpolation of each crossing instant. Robust, independent of the FFT.
 * @returns {number|null}
 */
export function zeroCrossFrequency(t, y, settle = 0.4) {
  const start = Math.floor(t.length * settle);
  const ts = t.slice(start);
  const ys = y.slice(start);
  if (ys.length < 3) return null;
  let mean = 0;
  for (const v of ys) mean += v;
  mean /= ys.length;
  let first = null;
  let last = null;
  let count = 0;
  for (let i = 1; i < ys.length; i++) {
    const a = ys[i - 1] - mean;
    const b = ys[i] - mean;
    if (a < 0 && b >= 0) {
      const f = a / (a - b);
      const tc = ts[i - 1] + f * (ts[i] - ts[i - 1]);
      if (first === null) first = tc;
      last = tc;
      count++;
    }
  }
  if (count < 2 || last === first) return null;
  return (count - 1) / (last - first);
}

/**
 * Measure an oscillator's steady-state behaviour from a transient run.
 * Frequency comes from the FFT fundamental with parabolic (sub-bin) interpolation;
 * the zero-crossing estimate is used as a sanity cross-check and as a fallback
 * when the spectrum is unusable. Amplitude/Vpp/RMS come from the settled window.
 * @returns {{freq:number|null, vpp:number, amplitude:number, rms:number,
 *            dcOffset:number, method:string}|null}
 */
export function measureOscillation(result, node, opts = {}) {
  const settle = opts.settle ?? 0.4;
  const t = result.sweep;
  const y = nodeMag(result, node) || (node ? null : result.nodes[Object.keys(result.nodes).pop()]);
  if (!t || !y || t.length < 8) return null;

  // Amplitude metrics from the settled (raw) window.
  const start = Math.floor(t.length * settle);
  const tail = y.slice(start);
  let max = -Infinity;
  let min = Infinity;
  let mean = 0;
  for (const v of tail) {
    if (v > max) max = v;
    if (v < min) min = v;
    mean += v;
  }
  mean /= tail.length;
  let ss = 0;
  for (const v of tail) ss += (v - mean) * (v - mean);
  const rms = Math.sqrt(ss / tail.length);
  const vpp = max - min;

  // Frequency: FFT fundamental, parabolic-interpolated.
  let freq = null;
  let method = "none";
  const spec = spectrum(result, node, { settle });
  if (spec && spec.mag.length > 3) {
    const { mag, df } = spec;
    let k = 1;
    for (let i = 2; i < mag.length; i++) if (mag[i] > mag[k]) k = i;
    if (k >= 1 && k < mag.length - 1) {
      const a = mag[k - 1];
      const b = mag[k];
      const c = mag[k + 1];
      const denom = a - 2 * b + c;
      const delta = denom !== 0 ? 0.5 * (a - c) / denom : 0;
      freq = (k + delta) * df;
      method = "fft";
    } else if (k > 0) {
      freq = k * df;
      method = "fft";
    }
  }

  const zc = zeroCrossFrequency(t, y, settle);
  // If the FFT picked an implausible bin (e.g. a harmonic because the window was
  // short), trust the zero-cross estimate, which tracks the fundamental directly.
  if (freq == null || (zc && Math.abs(freq - zc) / zc > 0.1)) {
    if (zc != null) {
      freq = zc;
      method = "zero-cross";
    }
  }

  return { freq, vpp, amplitude: vpp / 2, rms, dcOffset: mean, method };
}

/** Oscillation frequency only (Hz), or null. The verify loop's scalar. */
export function measureFrequency(result, node, opts = {}) {
  const m = measureOscillation(result, node, opts);
  return m ? m.freq : null;
}

/**
 * Total harmonic distortion of `node`: sqrt(Σ harmonic² ) / fundamental, over
 * the first `nHarm` harmonics (default 5). Pure FFT readout; a bonus the same
 * spectrum gives for free. @returns {number|null} ratio (0.01 === 1 %).
 */
export function measureTHD(result, node, { nHarm = 5, settle = 0.4 } = {}) {
  const spec = spectrum(result, node, { settle });
  if (!spec || spec.mag.length < 4) return null;
  const { mag } = spec;
  let k = 1;
  for (let i = 2; i < mag.length; i++) if (mag[i] > mag[k]) k = i;
  if (k < 1) return null;
  const fund = mag[k];
  if (!(fund > 0)) return null;
  // Interpolated peak power per harmonic: sum the bin and its two neighbours so
  // spectral leakage from the Hann window is counted with each harmonic.
  const binEnergy = (c) => {
    if (c < 1 || c >= mag.length) return 0;
    const lo = Math.max(1, c - 1);
    const hi = Math.min(mag.length - 1, c + 1);
    let e = 0;
    for (let i = lo; i <= hi; i++) e += mag[i] * mag[i];
    return e;
  };
  const fundE = binEnergy(k);
  let harmE = 0;
  for (let h = 2; h <= nHarm; h++) harmE += binEnergy(k * h);
  if (!(fundE > 0)) return null;
  return Math.sqrt(harmE / fundE);
}

// ── settled / regulation ──────────────────────────────────────────────────────

/**
 * Steady-state value of `node`: the mean of the last `tail` fraction of the run.
 * For a regulator's output this is Vout once the transient has settled.
 * @returns {number|null}
 */
export function measureSettled(result, node, { tail = 0.1 } = {}) {
  const y = nodeMag(result, node);
  if (!y || !y.length) return null;
  const start = Math.max(0, Math.floor(y.length * (1 - tail)));
  let sum = 0;
  let n = 0;
  for (let i = start; i < y.length; i++) {
    sum += y[i];
    n++;
  }
  return n ? sum / n : null;
}

/**
 * Line regulation from a transient where the supply (`inNode`) ramps: the change
 * in output per volt of input, measured between a settled point early in the run
 * and the end. @returns {{dVout, dVin, perVolt, percent}|null}
 *   perVolt = ΔVout/ΔVin (V/V);  percent = perVolt * 100 (%/V, output per input volt)
 */
export function measureLineRegulation(result, { outNode = "out", inNode = "in", loFrac = 0.1, hiFrac = 1 } = {}) {
  const vo = nodeMag(result, outNode);
  const vi = nodeMag(result, inNode);
  if (!vo || !vi || vo.length < 2) return null;
  const n = vo.length;
  const loI = Math.min(n - 1, Math.max(0, Math.floor(n * loFrac)));
  const hiI = Math.min(n - 1, Math.floor(n * hiFrac) - (hiFrac >= 1 ? 1 : 0));
  const dVin = vi[hiI] - vi[loI];
  const dVout = vo[hiI] - vo[loI];
  if (dVin === 0) return null;
  const perVolt = dVout / dVin;
  return { dVout, dVin, perVolt, percent: perVolt * 100 };
}

/**
 * Load regulation from a transient where the load steps at `stepFrac` of the run:
 * output just before the step vs. the settled output at the end.
 * @returns {{before, after, dVout}|null}
 */
export function measureLoadRegulation(result, { outNode = "out", stepFrac = 0.5, guard = 0.05, tail = 0.1 } = {}) {
  const vo = nodeMag(result, outNode);
  if (!vo || vo.length < 4) return null;
  const n = vo.length;
  const beforeI = Math.max(0, Math.floor(n * (stepFrac - guard)));
  const before = vo[beforeI];
  const tailStart = Math.max(0, Math.floor(n * (1 - tail)));
  let sum = 0;
  let cnt = 0;
  for (let i = tailStart; i < n; i++) {
    sum += vo[i];
    cnt++;
  }
  const after = cnt ? sum / cnt : vo[n - 1];
  return { before, after, dVout: after - before };
}
