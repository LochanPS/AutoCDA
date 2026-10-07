/**
 * paramSearch.js — A4: parametric search over design intent.
 *
 * optimizeMulti (optimize.js) grades a grid of buyable candidates on {error, cost,
 * power, yield} and blends them by soft weights. A4 turns that into a first-class
 * *intent*: "cheapest low-pass under 2% error at 1 kHz", "lowest-power divider".
 * That is a different query shape — a HARD constraint (error ≤ X) plus a SINGLE
 * objective to minimize/maximize — not a weighted blend. This module parses that
 * intent and runs the constrained search:
 *
 *   1. grade every candidate (reusing optimizeMulti's grid + SPICE grader),
 *   2. keep only the FEASIBLE ones (measured error within the stated constraint),
 *   3. rank the feasible set by the objective (cost/power/error min, yield max),
 *   4. return the winner, the ranked feasible list, and — when nothing is feasible
 *      — the closest-by-error best-effort plus an honest reason.
 *
 * The objective is still graded by the same SPICE path as verification, so the
 * "cheapest that still passes" answer is a verified answer, not a guess.
 */

import { parsePrompt } from "../utils/circuitParser";
import { optimizeMulti } from "./optimize";

const finite = (x) => typeof x === "number" && isFinite(x);

// objective keyword → { objective, direction }
const OBJECTIVE_PATTERNS = [
  { re: /\b(cheapest|lowest[- ]?cost|least expensive|minimum cost|min cost|lowest price|cheapest buyable)\b/i, objective: "cost", direction: "min" },
  { re: /\b(lowest[- ]?power|least power|minimum power|min power|low[- ]?power|most efficient)\b/i, objective: "power", direction: "min" },
  { re: /\b(highest[- ]?yield|best yield|most robust|most reliable|highest robustness)\b/i, objective: "yield", direction: "max" },
  { re: /\b(most accurate|lowest error|tightest|best accuracy|smallest error|minimum error)\b/i, objective: "error", direction: "min" },
];

// The objective field on a graded candidate (optimize.js shape).
const FIELD = { cost: "cost", power: "power", yield: "yield", error: "errorPct" };

/**
 * Parse a search intent. Reuses the circuit parser for type+targets, then pulls
 * the optimization objective and the hard error constraint from the same text.
 * @param {string} text
 * @returns {{type, targets, objective, direction, errorConstraint:number|null,
 *            confidence, assumed}|null}
 */
export function parseSearchIntent(text) {
  const spec = parsePrompt(text || "");
  if (!spec || !spec.type || spec.confidence === 0) return null;

  let objective = null, direction = null;
  for (const p of OBJECTIVE_PATTERNS) {
    if (p.re.test(text)) { objective = p.objective; direction = p.direction; break; }
  }
  if (!objective) return null; // no optimization intent → this is a plain design, not a search

  // Hard error constraint: "under 2%", "within 1%", "below 0.5%", "max error 3%",
  // "≤ 2 %". Falls back to the spec's tolerance when the text states none.
  const m =
    text.match(/\b(?:under|within|below|less than|<=?|≤|max(?:imum)?(?: error)?|no more than)\s*(\d+(?:\.\d+)?)\s*%/i) ||
    text.match(/(\d+(?:\.\d+)?)\s*%\s*(?:error|tolerance|accuracy)/i);
  const errorConstraint = m ? parseFloat(m[1]) / 100 : null;

  return {
    type: spec.type,
    targets: spec.targets,
    objective,
    direction,
    errorConstraint,
    confidence: spec.confidence,
    assumed: spec.assumed,
  };
}

/**
 * Constrained parametric search.
 * @param {Object} input
 * @param {string} input.type
 * @param {Object} input.targets
 * @param {Array}  input.components           verified nominal components
 * @param {"cost"|"power"|"yield"|"error"} input.objective
 * @param {"min"|"max"} [input.direction]     inferred from objective when omitted
 * @param {number} [input.errorConstraint]    hard cap on measured error (fraction);
 *                                             defaults to `tolerance`
 * @param {number} [input.tolerance=0.05]
 * @param {number} [input.perSide=7]
 * @param {Function} [input.runSpice] @param {Function} [input.simulate] @param {Function} [input.yieldFn]
 * @returns {Promise<{feasibleCount, best, ranked, objective, direction,
 *   errorConstraint, bestEffort?, reason?, objectives, candidates}>}
 */
export async function parametricSearch({
  type,
  targets,
  components,
  objective,
  direction,
  errorConstraint,
  tolerance = 0.05,
  perSide = 7,
  runSpice,
  simulate,
  yieldFn,
  yieldN = 40,
}) {
  if (!FIELD[objective]) throw new Error(`parametricSearch: unknown objective "${objective}"`);
  const dir = direction || (objective === "yield" ? "max" : "min");
  const cap = finite(errorConstraint) ? errorConstraint : tolerance;
  const field = FIELD[objective];

  // Reuse the optimizer's grid + grading. Weight the objective so the (expensive)
  // yield MC is driven; for a yield search grade EVERY candidate (topK = all).
  const weights = { error: 0, cost: 0, power: 0, yield: 0, [objective === "error" ? "error" : objective]: 1 };
  const opt = await optimizeMulti({
    type, targets, components, tolerance, weights, perSide,
    yieldTopK: objective === "yield" ? 100000 : 4, yieldN,
    runSpice, simulate, yieldFn,
  });

  const all = opt.candidates || [];
  const value = (g) => g[field];
  const hasField = all.some((g) => finite(value(g)));
  if (!hasField) {
    return {
      feasibleCount: 0, best: null, ranked: [], objective, direction: dir, errorConstraint: cap,
      objectives: opt.objectives, candidates: all,
      reason: `objective "${objective}" is not defined for a ${type} here`,
    };
  }

  const cmp = (a, b) => (dir === "max" ? value(b) - value(a) : value(a) - value(b));
  const feasible = all.filter((g) => finite(g.errorPct) && g.errorPct <= cap && finite(value(g)));
  const ranked = [...feasible].sort(cmp);

  if (ranked.length) {
    return {
      feasibleCount: ranked.length, best: ranked[0], ranked,
      objective, direction: dir, errorConstraint: cap, objectives: opt.objectives, candidates: all,
    };
  }

  // Nothing meets the constraint → honest best-effort: the lowest-error candidate.
  const byError = [...all].filter((g) => finite(g.errorPct)).sort((a, b) => a.errorPct - b.errorPct);
  return {
    feasibleCount: 0, best: null, ranked: [],
    bestEffort: byError[0] || null,
    objective, direction: dir, errorConstraint: cap, objectives: opt.objectives, candidates: all,
    reason: byError[0]
      ? `no candidate meets ≤ ${(cap * 100).toFixed(1)}% error; closest is ${(byError[0].errorPct * 100).toFixed(1)}% — loosen the constraint or raise the E-series`
      : "no candidate produced a valid measurement",
  };
}

/**
 * End-to-end convenience: intent text → parse → design → constrained search.
 * `designer` returns verified nominal components for a spec (e.g. a wrapper over
 * orchestrate); injected so this stays testable without the wasm engine.
 * @param {string} text
 * @param {{designer:Function, runSpice?, simulate?, yieldFn?, perSide?, tolerance?}} deps
 * @returns {Promise<{intent, search}|{intent:null, reason:string}>}
 */
export async function searchFromIntent(text, { designer, runSpice, simulate, yieldFn, perSide, tolerance } = {}) {
  const intent = parseSearchIntent(text);
  if (!intent) return { intent: null, reason: "no optimization intent found (state an objective like 'cheapest' or 'lowest power')" };
  const components = await designer({ type: intent.type, targets: intent.targets });
  const search = await parametricSearch({
    type: intent.type, targets: intent.targets, components,
    objective: intent.objective, direction: intent.direction,
    errorConstraint: intent.errorConstraint, tolerance, perSide,
    runSpice, simulate, yieldFn,
  });
  return { intent, search };
}
