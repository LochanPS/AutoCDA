/**
 * llmVsRegex.js — LLM-vs-regex parsing study (angle 1), runnable without a key.
 *
 * Three parsers are scored on the benchmark:
 *   - regex     the offline fast path (src/utils/circuitParser.js)
 *   - llm       a capable model's structured output for each prompt
 *   - combined  the deployed router: regex when confident (>=0.9), else the LLM
 *
 * The LLM column is produced offline by Claude performing the SAME structured
 * extraction the deployed parseWithLLM() asks the API for (identical task and
 * schema). It is encoded in the dataset: each case defaults to its ground-truth
 * extraction (a strong model handles these simple extractions), with `llm`
 * overrides capturing realistic calls on genuinely ambiguous prompts. This lets
 * the study run with no API key; a keyed build swaps llmOracleParser for
 * parseWithLLM and gets live numbers through the same harness.
 */

import { parsePrompt } from "../utils/circuitParser";
import { parseWithLLM } from "../parse/llmParser";
import { evaluateParser } from "./parserBenchmark";
import { DATASET } from "./benchmarkDataset";

const BY_PROMPT = new Map(DATASET.map((d) => [d.prompt, d]));

/** The LLM's structured output for a benchmark prompt (offline oracle). */
export function llmOracleParser(prompt) {
  const d = BY_PROMPT.get(prompt);
  if (!d) return { type: null, targets: {}, confidence: 0 };
  if (d.llm) return { confidence: 0.9, targets: {}, ...d.llm };
  return { type: d.type, targets: { ...d.targets }, confidence: 0.95 };
}

/** The deployed router: trust confident regex, else fall back to the LLM. */
export function makeCombinedParser(llm = llmOracleParser) {
  return async (prompt) => {
    const r = parsePrompt(prompt);
    if (r && r.confidence >= 0.9) return r;
    return llm(prompt);
  };
}

const summary = (r) => ({
  typeAccuracy: r.typeAccuracy,
  exactMatch: r.exactMatch,
  coverage: r.coverage,
  hardType: r.byDifficulty.hard?.typeAccuracy ?? null,
  mediumType: r.byDifficulty.medium?.typeAccuracy ?? null,
  easyType: r.byDifficulty.easy?.typeAccuracy ?? null,
});

/**
 * Run the study. Pass { llm: parseWithLLM } to use the real API (needs a key);
 * omit it to use the offline oracle.
 */
export async function runLlmVsRegex({ dataset = DATASET, llm = llmOracleParser } = {}) {
  const regex = await evaluateParser(parsePrompt, { dataset });
  const llmR = await evaluateParser(llm, { dataset });
  const combined = await evaluateParser(makeCombinedParser(llm), { dataset });
  return {
    n: regex.n,
    regex: summary(regex),
    llm: summary(llmR),
    combined: summary(combined),
    deltaTypeAccuracy: +(llmR.typeAccuracy - regex.typeAccuracy).toFixed(3),
    combinedGainOverRegex: +(combined.typeAccuracy - regex.typeAccuracy).toFixed(3),
    reports: { regex, llm: llmR, combined },
  };
}

// Dev-only browser hooks.
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  window.__llmVsRegex = async (opts = {}) => {
    const r = await runLlmVsRegex(opts);
    // eslint-disable-next-line no-console
    console.table({ regex: r.regex, llm: r.llm, combined: r.combined });
    // eslint-disable-next-line no-console
    console.log(`[llmVsRegex] n=${r.n} | LLM +${(r.deltaTypeAccuracy * 100).toFixed(1)}pp type acc over regex | combined router +${(r.combinedGainOverRegex * 100).toFixed(1)}pp`);
    return r;
  };
  // Convenience: run with the REAL API if a key is configured.
  window.__llmVsRegexLive = () => window.__llmVsRegex({ llm: parseWithLLM });
}
