/**
 * opampModel.js — a NON-IDEAL op-amp macromodel + the decks that expose the
 * numbers an ideal VCVS can't: closed-loop bandwidth and phase/gain margin.
 *
 * The verify decks use an ideal op-amp (E-source gain 1e6) — correct for sizing,
 * but it has infinite gain-bandwidth and no poles, so "bandwidth" and "stability"
 * are undefined. This 2-pole macromodel has finite open-loop gain (100 dB), a
 * dominant pole at 10 Hz (gain-bandwidth ≈ 1 MHz), a second pole at ~1 MHz (so the
 * phase margin is real and depends on the feedback factor), and a 75 Ω output.
 * The analyzers in metrics.js then compute the margins.
 *
 * Pure: builds netlist strings and reads parsed AC results; no wasm import.
 */
import { measureCutoff } from "./measure";
import { measureStability, measureOutputImpedance } from "./metrics";

// 2-pole op-amp subcircuit. Buffers (gain-1 VCVS) isolate the RC poles so each
// pole is independent. Aol=1e5, fp1=1/(2π·15.9k·1µ)≈10 Hz, fp2=1/(2π·159·1n)≈1 MHz.
export const OPAMP_SUBCKT =
  `.subckt NIOP vp vn vo\n` +
  `Ein n1 0 vp vn 1e5\n` +
  `Rp1 n1 n2 15.9k\nCp1 n2 0 1u\n` +
  `Eb1 n3 0 n2 0 1\n` +
  `Rp2 n3 n4 159\nCp2 n4 0 1n\n` +
  `Eo n5 0 n4 0 1\nRout n5 vo 75\n` +
  `.ends\n`;

const num = (v) => Number(Number(v).toPrecision(6)).toString();

/** Feedback factor β = R1/(R1+Rf) (noise gain's reciprocal) for either amp. */
export function betaOf(valueMap) {
  const R1 = Number(valueMap.R1);
  const Rf = Number(valueMap.Rf);
  if (!(R1 > 0) || !(Rf >= 0)) return null;
  return R1 / (R1 + Rf);
}

/** Closed-loop AC deck for the non-ideal amp (measure −3 dB bandwidth at `out`). */
export function bandwidthDeck(type, v) {
  if (type === "opamp_noninverting") {
    return `* non-inverting closed loop (non-ideal op-amp)\nV1 in 0 AC 1\nX1 in inv out NIOP\nRg inv 0 ${num(v.R1)}\nRf inv out ${num(v.Rf)}\n.ac dec 40 10 10Meg\n${OPAMP_SUBCKT}.end`;
  }
  // inverting
  return `* inverting closed loop (non-ideal op-amp)\nV1 in 0 AC 1\nR1 in inv ${num(v.R1)}\nRf inv out ${num(v.Rf)}\nX1 0 inv out NIOP\n.ac dec 40 10 10Meg\n${OPAMP_SUBCKT}.end`;
}

/** Open-loop AC deck: `out` = Aol(f) of the macromodel (for margin analysis). */
export function openLoopDeck() {
  return `* op-amp open-loop gain/phase\nV1 in 0 AC 1\nX1 in 0 out NIOP\n.ac dec 40 1 100Meg\n${OPAMP_SUBCKT}.end`;
}

// Find the complex series for a node (tolerant of case / v() wrapper).
function complexOf(result, node) {
  const nc = result && result.nodesComplex;
  if (!nc) return null;
  const want = String(node).toLowerCase();
  const key = Object.keys(nc).find((k) => k.toLowerCase() === want)
    || Object.keys(nc).find((k) => k.toLowerCase().replace(/^[vi]\((.*)\)$/, "$1") === want);
  return key ? nc[key] : null;
}

/**
 * Gain(dB) and continuous (unwrapped) phase(deg) vs frequency from an AC result.
 * @returns {{freq:number[], gainDb:number[], phaseDeg:number[]}|null}
 */
export function acGainPhase(result, node) {
  const freq = result && result.sweep;
  const cx = complexOf(result, node);
  if (!freq || !cx || !cx.length) return null;
  const gainDb = cx.map((v) => 20 * Math.log10(Math.hypot(v.real, v.img) || 1e-30));
  const raw = cx.map((v) => (Math.atan2(v.img, v.real) * 180) / Math.PI);
  // Unwrap: keep each step within ±180° of the previous (a rolling-off loop goes
  // continuously negative).
  const phaseDeg = [raw[0]];
  for (let i = 1; i < raw.length; i++) {
    let p = raw[i];
    while (p - phaseDeg[i - 1] > 180) p -= 360;
    while (p - phaseDeg[i - 1] < -180) p += 360;
    phaseDeg.push(p);
  }
  return { freq, gainDb, phaseDeg };
}

/**
 * Op-amp "pro metrics" for a verified inverting/non-inverting amp: closed-loop
 * bandwidth, and phase/gain margin from the loop gain (Aol·β). Pure over runSpice.
 * @returns {Promise<Object|null>} metric object (same shape metricsAgent returns)
 */
export async function collectOpampMetrics({ type, valueMap, runSpice }) {
  if (type !== "opamp_inverting" && type !== "opamp_noninverting") return null;
  const m = {};

  // Closed-loop bandwidth.
  try {
    const r = await runSpice(bandwidthDeck(type, valueMap));
    const fc = measureCutoff(r, "out");
    if (typeof fc === "number" && isFinite(fc)) m.bandwidth = { value: fc, unit: "Hz", label: "Closed-loop bandwidth (−3 dB)" };
  } catch { /* skip */ }

  // Phase/gain margin from loop gain = Aol·β.
  try {
    const beta = betaOf(valueMap);
    const r = await runSpice(openLoopDeck());
    const gp = acGainPhase(r, "out");
    if (gp && beta > 0) {
      const betaDb = 20 * Math.log10(beta);
      const loopDb = gp.gainDb.map((g) => g + betaDb);
      const st = measureStability(gp.freq, loopDb, gp.phaseDeg);
      if (st && typeof st.phaseMargin === "number" && isFinite(st.phaseMargin)) {
        m.phaseMargin = { value: st.phaseMargin, unit: "°", label: "Phase margin" };
        if (typeof st.crossoverHz === "number" && isFinite(st.crossoverHz)) m.gainBandwidth = { value: st.crossoverHz, unit: "Hz", label: "Loop-gain crossover" };
      }
      if (st && typeof st.gainMargin === "number" && isFinite(st.gainMargin)) m.gainMargin = { value: st.gainMargin, unit: "dB", label: "Gain margin" };
    }
  } catch { /* skip */ }

  return Object.keys(m).length ? m : null;
}

export { measureOutputImpedance };
