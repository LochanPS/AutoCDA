/**
 * compose.js — composition engine: chain verified building blocks into larger,
 * arbitrary circuits. This is the path from a fixed menu of 19 topologies to
 * "any circuit": a signal-chain of stages, each an already-SPICE-verified block,
 * wired output -> input, producing one combined netlist that ngspice measures end
 * to end.
 *
 * composeCircuit([{type, targets}, ...]) returns:
 *   { stages, components, netlist, predicted, measureNode, measureKind }
 * - components: every stage's parts, stage-prefixed (S1_R1, S2_C1, …) so refs and
 *   the BOM stay unique.
 * - netlist: one ngspice deck. Each stage's element lines are node-namespaced and
 *   its own stimulus source dropped; a single V1 drives the chain `in -> n1 -> …
 *   -> out`, shared `.model` lines are de-duplicated, and one analysis is added.
 * - predicted: closed-form end-to-end estimate (gain = product of stage gains;
 *   filters cascade their corners) for a quick sanity value before SPICE.
 *
 * verifyComposition(composition, { runSpice }) runs the deck and returns the
 * measured end-to-end result — the honest, composed error.
 */

import { calculateCircuit } from "../utils/circuitFormulas";
import { simDescriptor, circuitOutNode, simulatorAgent } from "../agents/simulatorAgent";
import { designerAgent } from "../agents/designerAgent";
import { measureCutoff, measureGain } from "../sim/measure";

// Node-terminal count by element first letter (how many leading tokens are nodes).
const NODE_COUNT = { R: 2, C: 2, L: 2, D: 2, V: 2, I: 2, E: 4, G: 4, Q: 3, M: 4 };

const isFilter = (type) => /lowpass|highpass|band_pass|integrator|differentiator|sallen|fourth_order/.test(type);
const gainOf = (c) => (c && c.derivedParams && typeof c.derivedParams.Av === "number" ? c.derivedParams.Av : null);

// Rewrite one element line for stage `s`: SUFFIX the ref with _S<s> (keeping the
// element's type letter first, or ngspice mis-types it — e.g. a prefixed "S1_R1"
// reads as a switch), map `in`/`out` to the chain nets, keep ground (0),
// namespace every other node, and leave trailing model names alone.
function remapLine(line, inNet, outNet, s, outTok = "out") {
  const toks = line.trim().split(/\s+/);
  const el = toks[0];
  const n = NODE_COUNT[el[0].toUpperCase()] || 2;
  toks[0] = `${el}_S${s}`;
  for (let i = 1; i <= n && i < toks.length; i++) {
    const node = toks[i];
    if (node === "0") continue;
    else if (node === "in") toks[i] = inNet;
    // A stage may drive its output onto its own node name (e.g. two_stage uses
    // "o2", common_emitter uses "col"), not the literal "out"; map that to the
    // chain net so the next stage is actually connected (else n<i> floats).
    else if (node === "out" || node === outTok) toks[i] = outNet;
    else toks[i] = `S${s}_${node}`;
  }
  return toks.join(" ");
}

// Is this the stage's own small-signal stimulus (V… in 0 … AC …)? Those are dropped;
// real supplies (VCC/Vdd/Vref) are kept and node-namespaced.
const isStimulus = (line) => /^V\S*\s+in\s+0\b.*\bAC\b/i.test(line.trim());
const isAnalysis = (line) => /^\.(ac|dc|op|tran|probe|end|lib)\b/i.test(line.trim());
const isModel = (line) => /^\.model\b/i.test(line.trim());
const isComment = (line) => /^\*/.test(line.trim()) || line.trim() === "";

/**
 * @param {Array<{type:string, targets:object}>} stages  signal order, input -> output
 * @param {{ eSeries?:string }} [opts]
 */
export function composeCircuit(stages, { eSeries = "E24" } = {}) {
  if (!Array.isArray(stages) || stages.length === 0) throw new Error("composeCircuit: need at least one stage");

  const designed = stages.map((s, i) => {
    const circuit = calculateCircuit(s.type, s.targets || {});
    if (!circuit) throw new Error(`composeCircuit: unknown type "${s.type}"`);
    return { ...s, index: i, circuit };
  });

  const components = [];
  const elementLines = [];
  const models = new Map();
  const n = designed.length;

  designed.forEach((d, i) => {
    const inNet = i === 0 ? "in" : `n${i}`;
    const outNet = i === n - 1 ? "out" : `n${i + 1}`;
    // Stage-tagged components for the BOM / parts list (match the netlist names).
    for (const c of d.circuit.components) {
      components.push({ ...c, ref: `${c.ref}_S${i + 1}`, stage: i + 1, stageType: d.type });
    }
    // Source the stage's raw netlist from its SPICE descriptor when available
    // (clean, node-consistent), else from the circuit's own netlist field.
    const desc = simDescriptor(d.type);
    const outTok = circuitOutNode(d.type);
    const valueMap = {};
    d.circuit.components.forEach((c) => { if (c.rawValue != null) valueMap[c.ref] = c.rawValue; });
    const raw = desc && desc.build ? desc.build(valueMap, d.targets || {}) : "";
    for (const line of raw.split("\n")) {
      if (isComment(line) || isAnalysis(line) || isStimulus(line)) continue;
      if (isModel(line)) { const name = line.trim().split(/\s+/)[1]; if (!models.has(name)) models.set(name, line.trim()); continue; }
      if (line.trim()) elementLines.push(remapLine(line, inNet, outNet, i + 1, outTok));
    }
  });

  // Analysis range + measurement from the stage mix.
  const anyFilter = designed.some((d) => isFilter(d.type));
  const fcs = designed.map((d) => d.circuit.derivedParams && (d.circuit.derivedParams.fc || d.circuit.derivedParams.f)).filter(Boolean);
  const flo = fcs.length ? Math.min(...fcs) / 100 : 1;
  const fhi = fcs.length ? Math.max(...fcs) * 100 : 1e6;
  const analysis = anyFilter ? `.ac dec 100 ${flo.toPrecision(4)} ${fhi.toPrecision(4)}` : `.ac lin 1 1000 1000`;

  const netlist = [
    `* composed: ${designed.map((d) => d.type).join(" -> ")}`,
    `V1 in 0 AC 1`,
    ...elementLines,
    ...[...models.values()],
    analysis,
    `.end`,
  ].join("\n");

  // Closed-form end-to-end prediction.
  const gains = designed.map((d) => gainOf(d.circuit)).filter((g) => g != null);
  const predicted = {};
  if (gains.length === designed.length && gains.length) predicted.totalGain = gains.reduce((a, b) => a * b, 1);
  if (anyFilter && fcs.length) predicted.dominantCorner = anyFilter ? Math.min(...fcs) : null;

  return {
    stages: designed.map((d) => ({ type: d.type, targets: d.targets })),
    components,
    netlist,
    predicted,
    measureNode: "out",
    measureKind: anyFilter ? "cutoff" : "gain",
  };
}

/** Run the composed deck through SPICE and measure the end-to-end result. */
export async function verifyComposition(composition, { runSpice }) {
  const result = await runSpice(composition.netlist);
  const measured =
    composition.measureKind === "cutoff"
      ? measureCutoff(result, composition.measureNode)
      : measureGain(result, "in", composition.measureNode);
  return { measured, measureKind: composition.measureKind, result, errors: (result.errors || []).filter((e) => !/^\s*(note|warning)/i.test(e)) };
}

// ── A2: composition depth — branching, impedance matching, per-stage error ──────
//
// composeCircuit chains stages in a straight line. Real circuits branch (one
// source driving several loads), and cascading real blocks only works when each
// stage's output impedance is low versus the next stage's input impedance — else
// the connection itself loses signal (loading). And when a composed design misses
// its end-to-end target, you need to know WHICH stage drifted. These three tools
// close that gap; all are pure / injectable, so they test without the wasm engine.

const parallelR = (a, b) => (a * b) / (a + b);

/**
 * Approximate small-signal input/output impedance of a stage, from its topology
 * and (ideal) component values. Used for loading checks, not as a verified metric.
 * Ideal op-amp outputs are modeled at a realistic ~75 Ω; non-inverting / in-amp
 * inputs are effectively open (modeled 1 GΩ). Returns {zin, zout} in ohms, with
 * null on a side that isn't meaningfully a voltage port for this type.
 * @returns {{zin:number|null, zout:number|null}}
 */
export function stageImpedance(type, v = {}) {
  const HI = 1e9; // ~open (non-inverting op-amp / instrumentation-amp input)
  const LO = 75;  // realistic op-amp output impedance
  switch (type) {
    case "rc_lowpass":
    case "rc_highpass":
      return { zin: v.R1 ?? null, zout: v.R1 ?? null };
    case "band_pass":
      return { zin: v.R1 ?? null, zout: v.R2 ?? v.R1 ?? null };
    case "voltage_divider":
      return v.R1 != null && v.R2 != null ? { zin: v.R1 + v.R2, zout: parallelR(v.R1, v.R2) } : { zin: null, zout: null };
    case "common_emitter":
      return { zin: v.R1 != null && v.R2 != null ? parallelR(v.R1, v.R2) : null, zout: v.RC ?? null };
    case "opamp_inverting":
    case "opamp_summing":
    case "opamp_difference":
      return { zin: v.R1 ?? null, zout: LO };
    case "opamp_noninverting":
    case "two_stage_amplifier":
    case "instrumentation_amp":
      return { zin: HI, zout: LO };
    case "sallen_key_lowpass":
    case "sallen_key_highpass":
    case "mfb_lowpass":
    case "fourth_order_lowpass":
    case "rc_integrator":
    case "rc_differentiator":
      return { zin: v.R1 ?? null, zout: LO };
    default:
      return { zin: null, zout: null }; // regulators / sources: not a signal port here
  }
}

// Default linear edges [[0,1],[1,2],…] for an n-stage chain.
const linearEdges = (n) => Array.from({ length: Math.max(0, n - 1) }, (_, i) => [i, i + 1]);

/**
 * Inter-stage impedance-matching report. For each wired connection it computes
 * the voltage-divider loading loss zout/(zin+zout): a stage with output impedance
 * zout driving a load zin delivers only zin/(zin+zout) of its signal. ok when the
 * loss is within `threshold` (default 1%). The honest "does cascading these two
 * actually work, or do you need a buffer?" check.
 * @param {Array<{type,targets}>} stages
 * @param {{edges?:number[][], threshold?:number}} [opts]
 * @returns {Array<{from,to,zout,zin,ratio,loadingErrorPct,ok,note}>}
 */
export function checkImpedanceMatch(stages, { edges, threshold = 0.01 } = {}) {
  const z = stages.map((s) => {
    const c = calculateCircuit(s.type, s.targets || {});
    const v = {};
    if (c) c.components.forEach((x) => { if (x.rawValue != null) v[x.ref] = x.rawValue; });
    return c ? stageImpedance(s.type, v) : { zin: null, zout: null };
  });
  const E = Array.isArray(edges) && edges.length ? edges : linearEdges(stages.length);
  return E.map(([a, b]) => {
    const zout = z[a].zout;
    const zin = z[b].zin;
    if (zout == null || zin == null) {
      return { from: a + 1, to: b + 1, zout, zin, ratio: null, loadingErrorPct: null, ok: null, note: "impedance not modeled for one side" };
    }
    const loadingErrorPct = zout / (zin + zout);
    const ok = loadingErrorPct <= threshold;
    return {
      from: a + 1, to: b + 1, zout, zin, ratio: zin / zout, loadingErrorPct, ok,
      note: ok
        ? "well matched — negligible loading"
        : `stage ${a + 1} Zout ≈ ${Math.round(zout)} Ω loads stage ${b + 1} Zin ≈ ${Math.round(zin)} Ω: ${(loadingErrorPct * 100).toFixed(1)}% signal loss — insert a buffer`,
    };
  });
}

/**
 * Per-stage verification: design + SPICE-grade each stage ON ITS OWN against its
 * own target, so a composed miss can be attributed to the stage that drifted
 * rather than only reported end-to-end. Pure over the injected grader.
 * @param {Array<{type,targets}>} stages
 * @param {{runSpice?:Function, simulate?:Function}} deps
 * @returns {Promise<Array<{stage,type,targetName,target,measured,errorPct,verifiable}>>}
 */
export async function perStageErrors(stages, { runSpice, simulate } = {}) {
  const out = [];
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    const d = designerAgent({ type: s.type, targets: s.targets || {} });
    if (!d.ok) { out.push({ stage: i + 1, type: s.type, verifiable: false, reason: "unknown type" }); continue; }
    const valueMap = {};
    for (const c of d.snapped) if (c.rawValue != null) valueMap[c.ref] = c.rawValue;
    const grade = simulate || ((a) => simulatorAgent({ type: s.type, targets: s.targets || {}, valueMap: a.valueMap, runSpice }));
    const sim = await grade({ valueMap, type: s.type, targets: s.targets || {} });
    const measured = sim && sim.measured;
    const target = sim && sim.target;
    const errorPct =
      typeof measured === "number" && typeof target === "number" && target !== 0 ? Math.abs((measured - target) / target) : null;
    out.push({ stage: i + 1, type: s.type, targetName: sim && sim.targetName, target, measured, errorPct, verifiable: !!(sim && sim.verifiable) });
  }
  return out;
}

/**
 * Branching composition: wire stages as a tree/DAG (fan-out), not just a line.
 * `edges` are [fromIndex, toIndex] pairs; omitted → a linear chain. A single V1
 * drives the root(s) at `in`; each stage writes a unique output net `y<i+1>` and
 * reads its predecessor's net (or `in`). Stages sharing a predecessor form a
 * branch — one source fanning out to several loads (use checkImpedanceMatch to
 * confirm the fan-out doesn't overload the source). Every terminal stage (no
 * outgoing edge) becomes a measurement point. One input per stage (no mixing).
 * @param {{stages:Array<{type,targets}>, edges?:number[][]}} graph
 * @returns {{stages, edges, components, netlist, measurePoints, predicted}}
 */
export function composeGraph({ stages, edges } = {}) {
  if (!Array.isArray(stages) || stages.length === 0) throw new Error("composeGraph: need at least one stage");
  const n = stages.length;
  const E = Array.isArray(edges) && edges.length ? edges : linearEdges(n);
  const pred = new Array(n).fill(null);
  const outDeg = new Array(n).fill(0);
  for (const [a, b] of E) {
    if (!(a >= 0 && a < n && b >= 0 && b < n)) throw new Error(`composeGraph: edge [${a},${b}] out of range`);
    if (pred[b] != null) throw new Error(`composeGraph: stage ${b} has multiple inputs (unsupported)`);
    pred[b] = a;
    outDeg[a]++;
  }

  const designed = stages.map((s, i) => {
    const circuit = calculateCircuit(s.type, s.targets || {});
    if (!circuit) throw new Error(`composeGraph: unknown type "${s.type}"`);
    return { ...s, index: i, circuit };
  });

  const outNetOf = (i) => `y${i + 1}`;
  const inNetOf = (i) => (pred[i] == null ? "in" : outNetOf(pred[i]));

  const components = [];
  const elementLines = [];
  const models = new Map();

  designed.forEach((d, i) => {
    for (const c of d.circuit.components) components.push({ ...c, ref: `${c.ref}_S${i + 1}`, stage: i + 1, stageType: d.type });
    const desc = simDescriptor(d.type);
    const outTok = circuitOutNode(d.type);
    const valueMap = {};
    d.circuit.components.forEach((c) => { if (c.rawValue != null) valueMap[c.ref] = c.rawValue; });
    const raw = desc && desc.build ? desc.build(valueMap, d.targets || {}) : "";
    for (const line of raw.split("\n")) {
      if (isComment(line) || isAnalysis(line) || isStimulus(line)) continue;
      if (isModel(line)) { const name = line.trim().split(/\s+/)[1]; if (!models.has(name)) models.set(name, line.trim()); continue; }
      if (line.trim()) elementLines.push(remapLine(line, inNetOf(i), outNetOf(i), i + 1, outTok));
    }
  });

  const terminals = designed.filter((_, i) => outDeg[i] === 0).map((d) => d.index);
  const anyFilter = designed.some((d) => isFilter(d.type));
  const fcs = designed.map((d) => d.circuit.derivedParams && (d.circuit.derivedParams.fc || d.circuit.derivedParams.f)).filter(Boolean);
  const flo = fcs.length ? Math.min(...fcs) / 100 : 1;
  const fhi = fcs.length ? Math.max(...fcs) * 100 : 1e6;
  const analysis = anyFilter ? `.ac dec 100 ${flo.toPrecision(4)} ${fhi.toPrecision(4)}` : `.ac lin 1 1000 1000`;

  const netlist = [
    `* composed graph: ${n} stage(s), ${terminals.length} output(s)`,
    `V1 in 0 AC 1`,
    ...elementLines,
    ...[...models.values()],
    analysis,
    `.end`,
  ].join("\n");

  const measurePoints = terminals.map((i) => ({
    stageIndex: i, type: stages[i].type, node: outNetOf(i), kind: isFilter(stages[i].type) ? "cutoff" : "gain",
  }));

  const gains = designed.map((d) => gainOf(d.circuit)).filter((g) => g != null);
  const predicted = {};
  if (gains.length === designed.length && gains.length) predicted.totalGain = gains.reduce((a, b) => a * b, 1);

  return { stages: designed.map((d) => ({ type: d.type, targets: d.targets })), edges: E, components, netlist, measurePoints, predicted };
}

/** Run a branching composition and measure every terminal output. */
export async function verifyGraph(graph, { runSpice }) {
  const result = await runSpice(graph.netlist);
  const outputs = graph.measurePoints.map((mp) => ({
    ...mp,
    measured: mp.kind === "cutoff" ? measureCutoff(result, mp.node) : measureGain(result, "in", mp.node),
  }));
  return { outputs, result, errors: (result.errors || []).filter((e) => !/^\s*(note|warning)/i.test(e)) };
}
