/**
 * parserBenchmark.js — evaluate a circuit-intent parser against the benchmark.
 *
 * Pure (no SPICE): runnable in jest and in the browser. Takes any parser that
 * maps prompt -> CircuitSpec (sync or async), so the same harness measures the
 * regex fast path AND the LLM fallback (angle 1: LLM-vs-regex).
 *
 * Metrics:
 *   typeAccuracy   fraction with the correct circuit type
 *   exactMatch     correct type AND all target fields within relTol
 *   coverage       fraction that returned any type (confidence > 0)
 *   confidence calibration (mean confidence on correct vs wrong)
 *   breakdowns by difficulty and style
 */

import { parsePrompt } from "../utils/circuitParser";
import { DATASET } from "./benchmarkDataset";

const near = (a, b, rel) => a != null && b != null && Math.abs(a - b) <= Math.max(rel * Math.abs(b), 1e-9);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function targetsMatch(got, expected, relTol) {
  for (const k of Object.keys(expected)) {
    if (!near(got?.[k], expected[k], relTol)) return false;
  }
  return true;
}

function breakdown(results, key) {
  const groups = {};
  for (const r of results) (groups[r[key]] = groups[r[key]] || []).push(r);
  const out = {};
  for (const g of Object.keys(groups)) {
    const rs = groups[g];
    out[g] = {
      n: rs.length,
      typeAccuracy: +(rs.filter((x) => x.typeOK).length / rs.length).toFixed(3),
      exactMatch: +(rs.filter((x) => x.exactMatch).length / rs.length).toFixed(3),
    };
  }
  return out;
}

/**
 * @param {(prompt:string)=>(object|Promise<object>)} parser
 * @param {{ dataset?, relTol? }} opts
 */
export async function evaluateParser(parser = parsePrompt, { dataset = DATASET, relTol = 0.02 } = {}) {
  const results = [];
  for (const item of dataset) {
    let spec = null;
    try {
      spec = await parser(item.prompt);
    } catch {
      spec = null;
    }
    const gotType = spec ? spec.type : null;
    const typeOK = gotType === item.type;
    const exactMatch = typeOK && targetsMatch(spec.targets, item.targets, relTol);
    results.push({
      id: item.id,
      prompt: item.prompt,
      difficulty: item.difficulty,
      style: item.style,
      expectedType: item.type,
      gotType,
      confidence: spec ? spec.confidence ?? 0 : 0,
      typeOK,
      exactMatch,
    });
  }

  const n = results.length;
  const rate = (f) => +(results.filter(f).length / n).toFixed(3);
  return {
    n,
    typeAccuracy: rate((r) => r.typeOK),
    exactMatch: rate((r) => r.exactMatch),
    coverage: rate((r) => r.gotType != null),
    meanConfidenceCorrect: +mean(results.filter((r) => r.typeOK).map((r) => r.confidence)).toFixed(3),
    meanConfidenceWrong: +mean(results.filter((r) => !r.typeOK).map((r) => r.confidence)).toFixed(3),
    byDifficulty: breakdown(results, "difficulty"),
    byStyle: breakdown(results, "style"),
    misses: results.filter((r) => !r.exactMatch).map((r) => ({ id: r.id, prompt: r.prompt, expected: r.expectedType, got: r.gotType, typeOK: r.typeOK })),
    results,
  };
}

// Dev-only browser hook: await window.__parserBench()  (regex by default)
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  window.__parserBench = async (parser) => {
    const r = await evaluateParser(parser);
    // eslint-disable-next-line no-console
    console.log(`[parserBench] type ${(r.typeAccuracy * 100).toFixed(1)}% | exact ${(r.exactMatch * 100).toFixed(1)}% | coverage ${(r.coverage * 100).toFixed(1)}% | conf ok ${r.meanConfidenceCorrect} vs wrong ${r.meanConfidenceWrong}`);
    // eslint-disable-next-line no-console
    console.table(r.byDifficulty);
    // eslint-disable-next-line no-console
    console.log("[parserBench] misses:", r.misses);
    return r;
  };
}
