/**
 * llmBenchmark.mjs — measure the lift the LLM router gives over regex alone.
 *
 * The deployed router trusts the regex parser when confident (>=0.9) and asks the
 * LLM otherwise. This runs that router over the HARD/colloquial tail (where regex
 * struggles) and reports regex-alone vs router type accuracy, plus how often the
 * LLM was called and how often it was right.
 *
 * Reads OPENROUTER_API_KEY (or REACT_APP_ANTHROPIC_KEY) from the environment or a
 * local .env (gitignored). The key is never printed. Free OpenRouter models are
 * rate-limited, so this samples and paces itself.
 *
 *   node --import ./server/loader.mjs scripts/llmBenchmark.mjs [sampleSize]
 */
import fs from "node:fs";

// Minimal .env loader (don't overwrite anything already in the environment).
try {
  for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch { /* no .env — rely on the real environment */ }

const { DATASET } = await import("../src/eval/benchmarkDataset.js");
const { parsePrompt } = await import("../src/utils/circuitParser.js");
const { parseWithLLM, selectProvider } = await import("../src/parse/llmParser.js");

const provider = selectProvider();
if (!provider) {
  console.error("No LLM key found. Set OPENROUTER_API_KEY in .env (or the environment) and retry.");
  process.exit(1);
}
console.error(`Using provider: ${provider.name} (${provider.model})`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const N = Number(process.argv[2]) || 30;
const hard = DATASET.filter((c) => c.difficulty === "hard").slice(0, N);

let regexCorrect = 0, routerCorrect = 0, llmCalls = 0, llmCorrect = 0, llmErrors = 0;

for (const c of hard) {
  const p = parsePrompt(c.prompt);
  const regexOk = p.type === c.type;
  if (regexOk) regexCorrect++;

  if (p.type && p.confidence >= 0.9) {
    // router trusts regex
    if (regexOk) routerCorrect++;
    continue;
  }
  // router asks the LLM; back off on rate-limit (429 is common on free models)
  let spec = null;
  for (let attempt = 0; attempt < 3 && !spec; attempt++) {
    try { spec = await parseWithLLM(c.prompt); llmCalls++; }
    catch (e) { llmErrors++; const is429 = /\(429\)/.test(e.message); if (attempt < 2) await sleep(is429 ? 12000 : 4000); }
  }
  const llmOk = spec && spec.type === c.type;
  if (llmOk) { routerCorrect++; llmCorrect++; }
  console.error(`  "${c.prompt.slice(0, 44)}" label=${c.type} regex=${p.type}(${p.confidence}) llm=${spec ? spec.type : "—"} ${llmOk ? "✓" : ""}`);
  await sleep(1500); // pace for free-tier rate limits
}

const pct = (a, b) => (b ? +((a / b) * 100).toFixed(1) : 0);
const out = {
  sample: hard.length,
  regexAloneAccuracy: pct(regexCorrect, hard.length),
  routerAccuracy: pct(routerCorrect, hard.length),
  liftPoints: +(pct(routerCorrect, hard.length) - pct(regexCorrect, hard.length)).toFixed(1),
  llmCalls, llmCorrect, llmErrors,
  llmHitRate: pct(llmCorrect, llmCalls),
  provider: provider.name, model: provider.model,
};
console.log("\n" + JSON.stringify(out, null, 2));
