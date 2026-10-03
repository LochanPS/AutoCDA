/**
 * SimulatorAgent — netlist → measured result (ngspice-wasm).
 *
 * Owns the per-circuit SPICE descriptors: how to build a clean ngspice netlist
 * from a { ref: value } map, which node/analysis to measure, and the scalar
 * target each type is verified against. Pure except for the injected runSpice.
 *
 * @typedef {Object} SimInput
 * @property {string} type            circuit type id
 * @property {Object} targets         design targets
 * @property {Object} valueMap        { [ref]: number } component values
 * @property {(netlist:string)=>Promise<object>} runSpice
 *
 * @typedef {Object} SimOutput
 * @property {boolean} verifiable
 * @property {number|null} measured
 * @property {number|null} target
 * @property {string|null} targetName
 * @property {string[]} errors        real ngspice errors (notes/warnings dropped)
 */

import { measureCutoff, measureGain, measureDC, measureUnityGainFreq } from "../sim/measure";

// Plain decimal / scientific notation — ngspice-valid (never unit symbols).
const num = (v) => Number(Number(v).toPrecision(6)).toString();

// Peak-magnitude frequency of a node in an AC sweep (for band-pass centre).
function measurePeakFreq(result, node) {
  const keys = Object.keys(result.nodes);
  const want = (node || "").toLowerCase().replace(/^[vi]\((.*)\)$/, "$1");
  const key =
    keys.find((k) => k.toLowerCase() === (node || "").toLowerCase()) ||
    keys.find((k) => k.toLowerCase().replace(/^[vi]\((.*)\)$/, "$1") === want) ||
    keys[keys.length - 1];
  const mag = result.nodes[key];
  const freq = result.sweep;
  if (!mag || !freq || !mag.length) return null;
  let idx = 0;
  for (let i = 1; i < mag.length; i++) if (mag[i] > mag[idx]) idx = i;
  return freq[idx];
}

// Real ngspice errors only (drop benign "Note:" / "Warning" lines).
export function realErrors(errors) {
  return (errors || []).filter((e) => !/^\s*(note|warning)\b/i.test(e));
}

// ── per-circuit SPICE descriptors ─────────────────────────────────────────────
const SIM = {
  rc_lowpass: {
    targetName: "fc",
    target: (t) => t.fc,
    dominant: "C1",
    build: (v, t) =>
      `* rc lowpass\nV1 in 0 DC 0 AC 1\nR1 in out ${num(v.R1)}\nC1 out 0 ${num(v.C1)}\n.ac dec 100 ${num(t.fc / 100)} ${num(t.fc * 100)}\n.end`,
    measure: (r) => measureCutoff(r, "out"),
  },
  rc_highpass: {
    targetName: "fc",
    target: (t) => t.fc,
    dominant: "C1",
    build: (v, t) =>
      `* rc highpass\nV1 in 0 DC 0 AC 1\nC1 in out ${num(v.C1)}\nR1 out 0 ${num(v.R1)}\n.ac dec 100 ${num(t.fc / 100)} ${num(t.fc * 100)}\n.end`,
    measure: (r) => measureCutoff(r, "out"),
  },
  voltage_divider: {
    targetName: "Vout",
    target: (t) => t.Vout,
    dominant: "R1",
    build: (v, t) =>
      `* voltage divider\nV1 in 0 DC ${num(t.Vin)}\nR1 in out ${num(v.R1)}\nR2 out 0 ${num(v.R2)}\n.dc V1 ${num(t.Vin)} ${num(t.Vin)} 1\n.end`,
    measure: (r) => measureDC(r, "out"),
  },
  led_limiter: {
    targetName: "I",
    target: (t) => t.I,
    dominant: "R1",
    build: (v, t) =>
      `* led limiter\nV1 in 0 DC ${num(t.Vsupply)}\nR1 in a ${num(v.R1)}\nD1 a 0 DLED\n.model DLED D(Is=1e-15 N=1.8 Rs=2)\n.dc V1 ${num(t.Vsupply)} ${num(t.Vsupply)} 1\n.end`,
    measure: (r) => measureDC(r, "i(v1)"),
  },
  opamp_inverting: {
    targetName: "Av",
    target: (t) => t.Av,
    dominant: "Rf",
    build: (v) =>
      `* inverting opamp (ideal VCVS)\nV1 in 0 DC 0 AC 1\nR1 in inv ${num(v.R1)}\nRf inv out ${num(v.Rf)}\nE1 out 0 0 inv 1e6\n.ac lin 1 1000 1000\n.end`,
    measure: (r) => measureGain(r, "in", "out"),
  },
  opamp_noninverting: {
    targetName: "Av",
    target: (t) => t.Av,
    dominant: "Rf",
    build: (v) =>
      `* noninverting opamp (ideal VCVS)\nV1 in 0 DC 0 AC 1\nRg inv 0 ${num(v.R1)}\nRf inv out ${num(v.Rf)}\nE1 out 0 in inv 1e6\n.ac lin 1 1000 1000\n.end`,
    measure: (r) => measureGain(r, "in", "out"),
  },
  common_emitter: {
    targetName: "Av",
    target: (t) => t.Av,
    dominant: "RE",
    outNode: "col",
    build: (v) =>
      `* common emitter\nVCC vcc 0 DC 12\nVin in 0 DC 0 AC 1\nR1 vcc base ${num(v.R1)}\nR2 base 0 ${num(v.R2)}\nRC vcc col ${num(v.RC)}\nRE emit 0 ${num(v.RE)}\nC1 in base 10u\nQ1 col base emit QN\n.model QN NPN(Bf=200 Is=1e-14)\n.ac lin 1 1000 1000\n.end`,
    measure: (r) => measureGain(r, "in", "col"),
  },
  band_pass: {
    targetName: "fc",
    target: (t) => Math.sqrt(t.fL * t.fH),
    dominant: "C1",
    build: (v, t) =>
      `* band pass (HP then LP)\nV1 in 0 DC 0 AC 1\nC1 in a ${num(v.C1)}\nR1 a 0 ${num(v.R1)}\nR2 a out ${num(v.R2)}\nC2 out 0 ${num(v.C2)}\n.ac dec 100 ${num(t.fL / 100)} ${num(t.fH * 100)}\n.end`,
    measure: (r) => measurePeakFreq(r, "out"),
  },
  zener_regulator: {
    targetName: "Vz",
    target: (t) => t.Vz,
    dominant: "R1",
    // Shunt regulator with a nominal 10 mA load. The zener model's breakdown is
    // set to the target Vz; the measured output confirms the series R keeps the
    // diode in regulation (if R1 is too large the output droops below Vz).
    build: (v, t) => {
      const RL = num((t.Vz || 5) / 0.01);
      return `* zener shunt regulator\nVin in 0 DC ${num(t.Vin)}\nR1 in out ${num(v.R1)}\nDz 0 out ZD\nRL out 0 ${RL}\n.model ZD D(BV=${num(v.Dz)} IBV=0.005 RS=1)\n.dc Vin ${num(t.Vin)} ${num(t.Vin)} 1\n.end`;
    },
    measure: (r) => measureDC(r, "out"),
  },
  sallen_key_lowpass: {
    targetName: "fc",
    target: (t) => t.fc,
    dominant: "R1",
    // Unity-gain Sallen-Key low-pass (ideal op-amp as a VCVS buffer). 2nd order,
    // four coupled passives; no single-component closed form, so the loop refines.
    build: (v, t) =>
      `* sallen-key low-pass (unity gain)\nV1 in 0 AC 1\nR1 in a ${num(v.R1)}\nR2 a b ${num(v.R2)}\nC2 b 0 ${num(v.C2)}\nC1 a out ${num(v.C1)}\nE1 out 0 b 0 1\n.ac dec 100 ${num(t.fc / 100)} ${num(t.fc * 100)}\n.end`,
    measure: (r) => measureCutoff(r, "out"),
  },
  sallen_key_highpass: {
    targetName: "fc",
    target: (t) => t.fc,
    dominant: "R1",
    build: (v, t) =>
      `* sallen-key high-pass (unity gain)\nV1 in 0 AC 1\nC1 in a ${num(v.C1)}\nC2 a b ${num(v.C2)}\nR2 b 0 ${num(v.R2)}\nR1 a out ${num(v.R1)}\nE1 out 0 b 0 1\n.ac dec 100 ${num(t.fc / 100)} ${num(t.fc * 100)}\n.end`,
    measure: (r) => measureCutoff(r, "out"),
  },
  two_stage_amplifier: {
    targetName: "Av",
    target: (t) => t.Av,
    dominant: "Rf1",
    outNode: "o2",
    // Two cascaded ideal non-inverting stages (VCVS op-amps); measure end-to-end gain.
    build: (v) =>
      `* two-stage non-inverting amplifier\nVin in 0 AC 1\nRg1 inv1 0 ${num(v.Rg1)}\nRf1 inv1 o1 ${num(v.Rf1)}\nE1 o1 0 in inv1 1e6\nRg2 inv2 0 ${num(v.Rg2)}\nRf2 inv2 o2 ${num(v.Rf2)}\nE2 o2 0 o1 inv2 1e6\n.ac lin 1 1000 1000\n.end`,
    measure: (r) => measureGain(r, "in", "o2"),
  },
  opamp_summing: {
    targetName: "Av",
    target: (t) => t.Av,
    dominant: "Rf",
    build: (v) =>
      `* inverting summing amp (one input driven)\nV1 in 0 AC 1\nR1 in inv ${num(v.R1)}\nR2 0 inv ${num(v.R2)}\nRf inv out ${num(v.Rf)}\nE1 out 0 0 inv 1e6\n.ac lin 1 1000 1000\n.end`,
    measure: (r) => measureGain(r, "in", "out"),
  },
  opamp_difference: {
    targetName: "Av",
    target: (t) => t.Av,
    dominant: "Rf",
    build: (v) =>
      `* difference amp (V2 grounded)\nV1 in 0 AC 1\nR1 in inv ${num(v.R1)}\nRf inv out ${num(v.Rf)}\nR2 0 p ${num(v.R2)}\nRg p 0 ${num(v.Rg)}\nE1 out 0 p inv 1e6\n.ac lin 1 1000 1000\n.end`,
    measure: (r) => measureGain(r, "in", "out"),
  },
  rc_integrator: {
    targetName: "fc",
    target: (t) => t.fc,
    dominant: "R1",
    build: (v, t) =>
      `* op-amp integrator\nV1 in 0 AC 1\nR1 in inv ${num(v.R1)}\nC1 inv out ${num(v.C1)}\nE1 out 0 0 inv 1e6\n.ac dec 100 ${num(t.fc / 100)} ${num(t.fc * 100)}\n.end`,
    measure: (r) => measureUnityGainFreq(r, "in", "out"),
  },
  rc_differentiator: {
    targetName: "fc",
    target: (t) => t.fc,
    dominant: "R1",
    build: (v, t) =>
      `* op-amp differentiator\nV1 in 0 AC 1\nC1 in inv ${num(v.C1)}\nR1 inv out ${num(v.R1)}\nE1 out 0 0 inv 1e6\n.ac dec 100 ${num(t.fc / 100)} ${num(t.fc * 100)}\n.end`,
    measure: (r) => measureUnityGainFreq(r, "in", "out"),
  },
  fourth_order_lowpass: {
    targetName: "fc",
    target: (t) => t.fc,
    dominant: "R1a",
    build: (v, t) =>
      `* 4th-order butterworth low-pass (2 cascaded sallen-key)\nV1 in 0 AC 1\nR1a in a1 ${num(v.R1a)}\nR2a a1 b1 ${num(v.R2a)}\nC2a b1 0 ${num(v.C2a)}\nC1a a1 o1 ${num(v.C1a)}\nE1 o1 0 b1 0 1\nR1b o1 a2 ${num(v.R1b)}\nR2b a2 b2 ${num(v.R2b)}\nC2b b2 0 ${num(v.C2b)}\nC1b a2 out ${num(v.C1b)}\nE2 out 0 b2 0 1\n.ac dec 100 ${num(t.fc / 100)} ${num(t.fc * 100)}\n.end`,
    measure: (r) => measureCutoff(r, "out"),
  },
  current_source: {
    targetName: "I",
    target: (t) => t.I,
    dominant: "R1",
    build: (v) =>
      `* op-amp + nmos constant current sink\nVdd vdd 0 DC 12\nVref ref 0 DC 2\nRload vdd d 1k\nVsense d drain DC 0\nM1 drain gate src src NM\nR1 src 0 ${num(v.R1)}\nE1 gate 0 ref src 100000\n.model NM NMOS(VTO=1 KP=2)\n.op\n.end`,
    measure: (r) => { const dc = measureDC(r, "i(vsense)"); return dc == null ? null : Math.abs(dc); },
  },
  rc_oscillator: {
    targetName: "f",
    target: (t) => t.f,
    dominant: "C1",
    // A Wien-bridge oscillator runs at the frequency where its frequency-setting
    // network has zero phase shift — the resonant peak of the Wien band-pass,
    // f0 = 1/(2*pi*R*C). We verify that peak directly with an AC sweep (robust),
    // rather than relying on a transient oscillation to start and sustain (which
    // needs amplitude-limiting nonlinearity SPICE will not reliably converge on).
    build: (v, t) =>
      `* wien frequency network\nV1 in 0 AC 1\nR1 in a ${num(v.R1)}\nC1 a out ${num(v.C1)}\nRp out 0 ${num(v.R1)}\nCp out 0 ${num(v.C1)}\n.ac dec 200 ${num(t.f / 100)} ${num(t.f * 100)}\n.end`,
    measure: (r) => measurePeakFreq(r, "out"),
  },
};

/** Descriptor for a type (internal). */
export function simDescriptor(type) {
  return SIM[type];
}

/** The node a stage drives its output onto in its own deck (default "out"). */
export function circuitOutNode(type) {
  const d = SIM[type];
  return (d && d.outNode) || "out";
}

/** Whether this circuit type has a real SPICE measurement path. */
export function isVerifiable(type) {
  const d = SIM[type];
  return !!(d && d.verifiable !== false);
}

/** The dominant component ref the refine loop searches over, or null. */
export function dominantRef(type) {
  const d = SIM[type];
  return d && d.verifiable !== false ? d.dominant : null;
}

/** The scalar target { name, value } this type is verified against, or null. */
export function circuitTargetInfo(type, targets) {
  const d = SIM[type];
  if (!d || d.verifiable === false) return null;
  return { name: d.targetName, value: d.target(targets || {}) };
}

/** Build the ngspice netlist for a value map. */
export function buildNetlist(type, valueMap, targets) {
  const d = SIM[type];
  if (!d || d.verifiable === false) return null;
  return d.build(valueMap, targets || {});
}

/**
 * Low-level: build + run + measure once. Returns the measured scalar (or null).
 */
export async function simulateMeasure(type, targets, valueMap, { runSpice }) {
  const d = SIM[type];
  if (!d || d.verifiable === false) return null;
  const result = await runSpice(d.build(valueMap, targets || {}));
  return d.measure(result);
}

/**
 * SimulatorAgent: measure a value map against its target, with metadata.
 * @param {SimInput} input
 * @returns {Promise<SimOutput>}
 */
export async function simulatorAgent({ type, targets, valueMap, runSpice }) {
  const d = SIM[type];
  if (!d || d.verifiable === false) {
    return { verifiable: false, measured: null, target: null, targetName: null, errors: [] };
  }
  const result = await runSpice(d.build(valueMap, targets || {}));
  return {
    verifiable: true,
    measured: d.measure(result),
    target: d.target(targets || {}),
    targetName: d.targetName,
    errors: realErrors(result.errors),
  };
}
