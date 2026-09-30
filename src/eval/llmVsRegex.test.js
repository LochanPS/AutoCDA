import { runLlmVsRegex } from "./llmVsRegex";

describe("LLM vs regex parsing study", () => {
  let r;
  beforeAll(async () => { r = await runLlmVsRegex(); });

  test("prints the comparison", () => {
    // eslint-disable-next-line no-console
    console.log(`n=${r.n}`);
    // eslint-disable-next-line no-console
    console.log("regex   ", JSON.stringify(r.regex));
    // eslint-disable-next-line no-console
    console.log("llm     ", JSON.stringify(r.llm));
    // eslint-disable-next-line no-console
    console.log("combined", JSON.stringify(r.combined));
    // eslint-disable-next-line no-console
    console.log(`LLM +${(r.deltaTypeAccuracy * 100).toFixed(1)}pp | combined +${(r.combinedGainOverRegex * 100).toFixed(1)}pp`);
    expect(r.n).toBeGreaterThanOrEqual(100);
  });

  test("LLM beats regex overall and especially on hard cases", () => {
    expect(r.llm.typeAccuracy).toBeGreaterThan(r.regex.typeAccuracy);
    expect(r.llm.hardType).toBeGreaterThan(r.regex.hardType);
    expect(r.llm.typeAccuracy).toBeGreaterThanOrEqual(0.9);
  });

  test("combined router is at least as good as regex (fast path never hurts)", () => {
    expect(r.combined.typeAccuracy).toBeGreaterThanOrEqual(r.regex.typeAccuracy);
    // regex fast path preserves its easy-case accuracy in the router
    expect(r.combined.easyType).toBeGreaterThanOrEqual(r.regex.easyType - 1e-9);
  });
});
