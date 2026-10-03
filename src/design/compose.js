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
import { simDescriptor, circuitOutNode } from "../agents/simulatorAgent";
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
