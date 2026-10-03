/**
 * optimize.js — multi-objective design optimization.
 *
 * The reasoning loop (reasoningAgent) hits ONE target within tolerance. Real design
 * is a trade-off: a cheaper or lower-power part may be worth a little more error, and
 * a well-centred design yields better in manufacturing. This optimizer searches a
 * bounded set of buyable candidates, SPICE-grades EVERY one, scores each on a weighted
 * blend of { measured error, cost, power, yield }, and returns the ranked list, the
 * Pareto-optimal (non-dominated) set, and the weight-chosen pick.
 *
 * Design points:
 *  - Every candidate is graded by the SAME SPICE grader as verification (injectable
 *    as `simulate` so this is unit-testable against an analytic model).
 *  - Candidates are E-series-snapped, so each stays a buyable part.
 *  - Objectives that don't apply to a circuit (e.g. static power for an AC filter,
 *    which has no DC operating point here) are detected and dropped, and the weights
 *    renormalised over the objectives that remain — no fake numbers.
 *  - Yield is expensive (Monte-Carlo), so it is computed only for the top-K candidates
 *    by the cheap objectives, then folded in. Inject `yieldFn` to test without MC.
 */

import { snap, neighbors, applyValue } from "./eseries";
import { buildBOM } from "./bom";
import { JOINT_PAIR } from "../agents/reasoningAgent";
import { simulatorAgent, dominantRef } from "../agents/simulatorAgent";

const finite = (x) => typeof x === "number" && isFinite(x);
const fineSeriesFor = (unit) => (unit === "F" ? "E24" : "E96");

export const DEFAULT_WEIGHTS = { error: 1, cost: 0, power: 0, yield: 0 };

// Objective name → the field it reads on a graded candidate.
const FIELD = { error: "errorPct", cost: "cost", power: "power", yield: "yield" };

/**
 * Best-effort static power estimate (watts) for types with a real DC operating point.
 * Returns null for circuits where "power" is not defined here (AC-driven filters,
 * ideal-VCVS op-amp decks) — the optimizer then drops the power objective.
 */
export function estimatePower(type, targets = {}, v = {}) {
  const t = targets;
  switch (type) {
    case "voltage_divider":
      return finite(t.Vin) && finite(v.R1) && finite(v.R2) ? (t.Vin * t.Vin) / (v.R1 + v.R2) : null;
    case "led_limiter":
      return finite(t.Vsupply) && finite(t.I) ? t.Vsupply * t.I : null;
    case "current_source":
      return finite(t.I) ? 12 * t.I : null; // 12 V rail in the sim deck
    case "zener_regulator":
      return finite(t.Vin) && finite(t.Vz) && finite(v.R1) ? ((t.Vin - t.Vz) ** 2) / v.R1 : null;
    case "common_emitter":
      // Quiescent: bias divider off the 12 V rail + collector branch.
      if (finite(v.R1) && finite(v.R2) && finite(v.RC) && finite(v.RE)) {
        const iBias = 12 / (v.R1 + v.R2);
        const iColl = 12 / (v.RC + v.RE);
        return 12 * (iBias + iColl);
      }
      return null;
    default:
      return null; // AC filters / ideal op-amp decks: no static power here
  }
}

const valueMapOf = (components) => {
  const m = {};
  for (const c of components || []) if (c.rawValue != null) m[c.ref] = c.rawValue;
  return m;
};

// Bounded candidate grid: vary the governing component(s) over E-series neighbours
// of the nominal design. A pair gives perSide×perSide; a single ref gives a line.
function candidateValueMaps({ type, components, nominal, perSide }) {
  const tune = (JOINT_PAIR[type] || (dominantRef(type) ? [dominantRef(type)] : [])).filter((r) => nominal[r] != null);
  if (!tune.length) return [{ ...nominal }];
  const unitOf = (ref) => (components.find((c) => c.ref === ref) || {}).unit;
  const k = Math.max(1, Math.floor(perSide / 2));
  const candsFor = (ref) => {
    const series = fineSeriesFor(unitOf(ref));
    const s = snap(nominal[ref], series);
    return [...new Set([s, ...neighbors(nominal[ref], series, k)])].slice(0, perSide);
  };
  if (tune.length === 1) {
    return candsFor(tune[0]).map((v) => ({ ...nominal, [tune[0]]: v }));
  }
  const [a, b] = tune;
  const out = [];
  for (const av of candsFor(a)) for (const bv of candsFor(b)) out.push({ ...nominal, [a]: av, [b]: bv });
  return out;
}

const minMax = (xs) => {
  const f = xs.filter(finite);
  return f.length ? { min: Math.min(...f), max: Math.max(...f) } : { min: 0, max: 0 };
};
// Normalise lower-is-better to [0,1]; flat objective → 0 for all.
const norm = (v, { min, max }) => (!finite(v) ? 1 : max > min ? (v - min) / (max - min) : 0);

/**
 * @param {Object} input
 * @param {string} input.type
 * @param {Object} input.targets
 * @param {Array}  input.components           verified nominal components
 * @param {number} [input.tolerance=0.05]
 * @param {Object} [input.weights]            { error, cost, power, yield } ≥ 0
 * @param {number} [input.perSide=5]          grid size per tuned component
 * @param {number} [input.yieldTopK=4]        candidates to Monte-Carlo for yield
 * @param {number} [input.yieldN=40]          MC runs per yield evaluation
 * @param {(netlist:string)=>Promise<object>} [input.runSpice]
 * @param {(a:{valueMap})=>Promise<{measured,target}>} [input.simulate]  grader override
 * @param {(valueMap:Object)=>Promise<number>} [input.yieldFn]  yield override (0..1)
 * @param {(f:number)=>void} [input.onProgress]
 * @returns {Promise<{objectives, candidates, chosen, pareto, weights}>}
 */
export async function optimizeMulti({
  type,
  targets,
  components,
  tolerance = 0.05,
  weights = DEFAULT_WEIGHTS,
  perSide = 5,
  yieldTopK = 4,
  yieldN = 40,
  runSpice,
  simulate,
  yieldFn,
  onProgress,
}) {
  const w = { error: 0, cost: 0, power: 0, yield: 0, ...weights };
  const nominal = valueMapOf(components);
  const grade = simulate || ((a) => simulatorAgent({ type, targets, valueMap: a.valueMap, runSpice }));
  const maps = candidateValueMaps({ type, components, nominal, perSide });

  // Grade every candidate on the cheap objectives (error, cost, power).
  const graded = [];
  for (let i = 0; i < maps.length; i++) {
    const valueMap = maps[i];
    const sim = await grade({ valueMap });
    const measured = sim && sim.measured;
    const target = sim && sim.target;
    const errorPct = finite(measured) && finite(target) && target !== 0 ? Math.abs((measured - target) / target) : null;
    const cand = components.map((c) => (valueMap[c.ref] != null && valueMap[c.ref] !== c.rawValue ? applyValue(c, valueMap[c.ref]) : c));
    const cost = buildBOM(cand).total;
    const power = estimatePower(type, targets, valueMap);
    graded.push({ valueMap, components: cand, measured, target, errorPct, cost, power, inSpec: errorPct != null && errorPct <= tolerance, yield: null });
    if (onProgress) onProgress(((i + 1) / (maps.length + 1)) * 0.75);
  }

  const valid = graded.filter((g) => finite(g.errorPct));
  const pool = valid.length ? valid : graded;

  // Which objectives actually apply (≥1 finite value, and the user weights it > 0).
  const hasPower = pool.some((g) => finite(g.power));
  const wantYield = w.yield > 0 && (yieldFn || runSpice);
  const objectives = ["error", "cost", "power", "yield"].filter((o) =>
    w[o] > 0 && (o === "error" || o === "cost" ? true : o === "power" ? hasPower : wantYield)
  );
  // If nothing is weighted/applicable, fall back to pure error.
  const activeObjs = objectives.length ? objectives : ["error"];

  // Yield: compute only for the top-K by the cheap-objective score, then fold in.
  if (activeObjs.includes("yield")) {
    const cheapObjs = activeObjs.filter((o) => o !== "yield");
    const ranges0 = Object.fromEntries(cheapObjs.map((o) => [o, minMax(pool.map((g) => g[FIELD[o]]))]));
    const cheapScore = (g) => {
      const wsum = cheapObjs.reduce((s, o) => s + w[o], 0) || 1;
      return cheapObjs.reduce((s, o) => s + w[o] * norm(g[FIELD[o]], ranges0[o]), 0) / wsum;
    };
    const top = [...pool].sort((a, b) => cheapScore(a) - cheapScore(b)).slice(0, Math.max(1, yieldTopK));
    for (let i = 0; i < top.length; i++) {
      const g = top[i];
      try {
        g.yield = yieldFn
          ? await yieldFn(g.valueMap)
          : await builtinYield({ type, targets, components: g.components, tolerance, runSpice, N: yieldN });
      } catch { g.yield = null; }
      if (onProgress) onProgress(0.75 + ((i + 1) / top.length) * 0.25);
    }
  }
  if (onProgress) onProgress(1);

  // Normalise + weighted score (lower = better). Yield is higher-better → inverted.
  const ranges = Object.fromEntries(activeObjs.map((o) => [o, minMax(pool.map((g) => g[FIELD[o]]))]));
  const wsum = activeObjs.reduce((s, o) => s + w[o], 0) || 1;
  const scoreOf = (g) =>
    activeObjs.reduce((s, o) => {
      const n = norm(g[FIELD[o]], ranges[o]);
      return s + w[o] * (o === "yield" ? 1 - n : n);
    }, 0) / wsum;

  const scored = pool.map((g) => ({ ...g, score: scoreOf(g) }));
  scored.sort((a, b) => a.score - b.score);

  // Pareto front over the active objectives (error/cost/power lower-better, yield higher).
  const better = (x, y, o) => (o === "yield" ? (x.yield ?? -1) > (y.yield ?? -1) : (x[FIELD[o]] ?? Infinity) < (y[FIELD[o]] ?? Infinity));
  const noWorse = (x, y, o) => (o === "yield" ? (x.yield ?? -1) >= (y.yield ?? -1) : (x[FIELD[o]] ?? Infinity) <= (y[FIELD[o]] ?? Infinity));
  const dominates = (x, y) => activeObjs.every((o) => noWorse(x, y, o)) && activeObjs.some((o) => better(x, y, o));
  const pareto = scored.filter((x) => !scored.some((y) => y !== x && dominates(y, x)));

  return {
    objectives: activeObjs,
    weights: w,
    tolerance,
    candidates: scored,
    chosen: scored[0] || null,
    pareto,
  };
}

async function builtinYield({ type, targets, components, tolerance, runSpice, N }) {
  const { runToleranceSweep } = await import("./montecarlo");
  const spec = { type, targets, constraints: { tolerance } };
  const res = await runToleranceSweep(spec, components, { runSpice, N });
  return res && res.supported ? res.yield : null;
}
