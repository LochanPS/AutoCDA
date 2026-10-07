/**
 * paramSearch.test.js — A4: parametric search over intent.
 *   parseSearchIntent   intent text → { type, targets, objective, errorConstraint }
 *   parametricSearch    hard error constraint + single objective, over graded grid
 *
 * The search reuses optimizeMulti's grid + grader; we inject `simulate` (and, for
 * yield, `yieldFn`) so the whole thing runs deterministically without wasm.
 */

import { parseSearchIntent, parametricSearch, searchFromIntent } from "./paramSearch";
import { designerAgent } from "../agents/designerAgent";

const nominal = (type, targets) => {
  const d = designerAgent({ type, targets });
  return d.snapped;
};

// Analytic graders (optimize.js calls grade({ valueMap })).
const rcSim = (targets) => async ({ valueMap: v }) => ({
  measured: 1 / (2 * Math.PI * v.R1 * v.C1), target: targets.fc, targetName: "fc",
});
const divSim = (targets) => async ({ valueMap: v }) => ({
  measured: (targets.Vin * v.R2) / (v.R1 + v.R2), target: targets.Vout, targetName: "Vout",
});

describe("parseSearchIntent", () => {
  test.each([
    ["cheapest low pass under 2% at 1kHz", "rc_lowpass", "cost", "min", 0.02],
    ["lowest power voltage divider 12v to 5v within 1%", "voltage_divider", "power", "min", 0.01],
    ["most accurate 2kHz low pass", "rc_lowpass", "error", "min", null],
    ["highest yield divider 9v to 3.3v", "voltage_divider", "yield", "max", null],
  ])("%s", (text, type, objective, direction, errorConstraint) => {
    const s = parseSearchIntent(text);
    expect(s).toBeTruthy();
    expect(s.type).toBe(type);
    expect(s.objective).toBe(objective);
    expect(s.direction).toBe(direction);
    expect(s.errorConstraint).toBe(errorConstraint);
  });

  test("a plain design request (no objective) is NOT a search", () => {
    expect(parseSearchIntent("low pass filter 1 kHz")).toBeNull();
  });

  test("an unrecognizable circuit yields no search", () => {
    expect(parseSearchIntent("cheapest flux capacitor")).toBeNull();
  });
});

describe("parametricSearch — constrained objective", () => {
  test("objective=error ranks feasible candidates by ascending error", async () => {
    const targets = { fc: 1000 };
    const r = await parametricSearch({
      type: "rc_lowpass", targets, components: nominal("rc_lowpass", targets),
      objective: "error", errorConstraint: 0.05, simulate: rcSim(targets),
    });
    expect(r.feasibleCount).toBeGreaterThan(0);
    expect(r.best.errorPct).toBeLessThanOrEqual(0.05);
    for (let i = 1; i < r.ranked.length; i++) expect(r.ranked[i].errorPct).toBeGreaterThanOrEqual(r.ranked[i - 1].errorPct);
  });

  test("objective=cost keeps only in-spec parts, ranked cheapest-first", async () => {
    const targets = { fc: 1000 };
    const r = await parametricSearch({
      type: "rc_lowpass", targets, components: nominal("rc_lowpass", targets),
      objective: "cost", errorConstraint: 0.05, simulate: rcSim(targets),
    });
    expect(r.feasibleCount).toBeGreaterThan(0);
    expect(r.best.errorPct).toBeLessThanOrEqual(0.05);          // hard constraint honored
    expect(r.ranked[0].cost).toBeLessThanOrEqual(r.ranked[r.ranked.length - 1].cost); // cheapest first
  });

  test("objective=power works for a type with a DC operating point (divider)", async () => {
    const targets = { Vin: 12, Vout: 5 };
    const r = await parametricSearch({
      type: "voltage_divider", targets, components: nominal("voltage_divider", targets),
      objective: "power", errorConstraint: 0.05, simulate: divSim(targets),
    });
    expect(r.feasibleCount).toBeGreaterThan(0);
    expect(Number.isFinite(r.best.power)).toBe(true);
    for (let i = 1; i < r.ranked.length; i++) expect(r.ranked[i].power).toBeGreaterThanOrEqual(r.ranked[i - 1].power);
  });

  test("objective=power on an AC filter is reported not-applicable (no fake number)", async () => {
    const targets = { fc: 1000 };
    const r = await parametricSearch({
      type: "rc_lowpass", targets, components: nominal("rc_lowpass", targets),
      objective: "power", errorConstraint: 0.05, simulate: rcSim(targets),
    });
    expect(r.feasibleCount).toBe(0);
    expect(r.best).toBeNull();
    expect(r.reason).toMatch(/not defined/i);
  });

  test("an impossible constraint returns an honest best-effort + reason", async () => {
    const targets = { fc: 1000 };
    const r = await parametricSearch({
      type: "rc_lowpass", targets, components: nominal("rc_lowpass", targets),
      objective: "cost", errorConstraint: 1e-6, simulate: rcSim(targets),
    });
    expect(r.feasibleCount).toBe(0);
    expect(r.bestEffort).toBeTruthy();
    expect(r.reason).toMatch(/loosen|closest/i);
  });

  test("objective=yield ranks feasible candidates by descending yield (injected yieldFn)", async () => {
    const targets = { Vin: 12, Vout: 5 };
    // yield peaks when R1 is nearest its nominal (deterministic, monotone in |log|)
    const yieldFn = async (vm) => 1 / (1 + Math.abs(Math.log(vm.R1 / nominal("voltage_divider", targets).find((c) => c.ref === "R1").rawValue)));
    const r = await parametricSearch({
      type: "voltage_divider", targets, components: nominal("voltage_divider", targets),
      objective: "yield", errorConstraint: 0.1, simulate: divSim(targets), yieldFn,
    });
    expect(r.feasibleCount).toBeGreaterThan(0);
    for (let i = 1; i < r.ranked.length; i++) expect(r.ranked[i].yield).toBeLessThanOrEqual(r.ranked[i - 1].yield);
    expect(r.best.yield).toBe(Math.max(...r.ranked.map((g) => g.yield)));
  });
});

describe("searchFromIntent (end-to-end, injected designer + grader)", () => {
  test("parses, designs, and returns the cheapest in-spec design", async () => {
    const out = await searchFromIntent("cheapest low pass under 5% at 1kHz", {
      designer: async ({ type, targets }) => nominal(type, targets),
      simulate: rcSim({ fc: 1000 }),
    });
    expect(out.intent.objective).toBe("cost");
    expect(out.search.feasibleCount).toBeGreaterThan(0);
    expect(out.search.best.errorPct).toBeLessThanOrEqual(0.05);
  });

  test("no objective → not a search", async () => {
    const out = await searchFromIntent("low pass 1kHz", { designer: async () => [] });
    expect(out.intent).toBeNull();
  });
});
