import { evaluateParser } from "./parserBenchmark";
import { DATASET, datasetByType } from "./benchmarkDataset";
import { SUPPORTED_TYPES } from "../spec/circuitSpec";

describe("benchmark dataset", () => {
  test("covers all 10 supported types", () => {
    const by = datasetByType();
    for (const t of SUPPORTED_TYPES) expect(by[t.id]?.length || 0).toBeGreaterThan(0);
  });

  test("every case has canonical numeric targets for its type's fields", () => {
    const fields = Object.fromEntries(SUPPORTED_TYPES.map((t) => [t.id, t.fields]));
    for (const item of DATASET) {
      for (const f of fields[item.type]) {
        expect(typeof item.targets[f]).toBe("number");
      }
    }
  });
});

describe("regex parser on the benchmark", () => {
  let report;
  beforeAll(async () => { report = await evaluateParser(); });

  test("prints the scorecard", () => {
    // eslint-disable-next-line no-console
    console.log(`regex: type ${(report.typeAccuracy * 100).toFixed(1)}%  exact ${(report.exactMatch * 100).toFixed(1)}%  coverage ${(report.coverage * 100).toFixed(1)}%`);
    // eslint-disable-next-line no-console
    console.log("byDifficulty", JSON.stringify(report.byDifficulty));
    expect(report.n).toBe(DATASET.length);
  });

  test("nails easy / canonical cases", () => {
    expect(report.byDifficulty.easy.typeAccuracy).toBeGreaterThanOrEqual(0.95);
    expect(report.byStyle.canonical.typeAccuracy).toBeGreaterThanOrEqual(0.9);
  });

  test("solid overall type accuracy", () => {
    expect(report.typeAccuracy).toBeGreaterThanOrEqual(0.6);
    expect(report.exactMatch).toBeGreaterThanOrEqual(0.55);
  });

  test("confidence is calibrated (higher when correct)", () => {
    expect(report.meanConfidenceCorrect).toBeGreaterThan(report.meanConfidenceWrong);
  });
});
