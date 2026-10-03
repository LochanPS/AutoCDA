import { optimizeMulti, estimatePower } from "./optimize";

// Analytic voltage-divider grader: Vout = Vin·R2/(R1+R2). No SPICE needed, so the
// optimizer logic is tested deterministically.
const Vin = 9, Vtarget = 3.3;
const grade = ({ valueMap }) =>
  Promise.resolve({ measured: (Vin * valueMap.R2) / (valueMap.R1 + valueMap.R2), target: Vtarget });

const components = [
  { ref: "R1", rawValue: 10000, unit: "Ω", display: "10 kΩ", description: "Resistor" },
  { ref: "R2", rawValue: 5600, unit: "Ω", display: "5.6 kΩ", description: "Resistor" },
];
const base = { type: "voltage_divider", targets: { Vin, Vout: Vtarget }, components, simulate: grade, perSide: 5 };

describe("optimizeMulti", () => {
  test("grades every candidate with the injected simulator (error computed for all)", async () => {
    const r = await optimizeMulti({ ...base, weights: { error: 1 } });
    expect(r.candidates.length).toBeGreaterThan(1);
    expect(r.candidates.every((c) => typeof c.errorPct === "number")).toBe(true);
  });

  test("pure error weight picks the lowest-error candidate", async () => {
    const r = await optimizeMulti({ ...base, weights: { error: 1 } });
    const minErr = Math.min(...r.candidates.map((c) => c.errorPct));
    expect(r.chosen.errorPct).toBeCloseTo(minErr, 12);
  });

  test("pure power weight picks the lowest-power (highest total resistance) candidate", async () => {
    const r = await optimizeMulti({ ...base, weights: { power: 1 } });
    expect(r.objectives).toContain("power");
    const minPow = Math.min(...r.candidates.map((c) => c.power));
    expect(r.chosen.power).toBeCloseTo(minPow, 12);
    // lowest power ⇔ largest R1+R2
    const totR = (c) => c.valueMap.R1 + c.valueMap.R2;
    expect(totR(r.chosen)).toBe(Math.max(...r.candidates.map(totR)));
  });

  test("power estimate matches the closed form for a DC type and is null for AC filters", () => {
    expect(estimatePower("voltage_divider", { Vin: 9 }, { R1: 10000, R2: 5000 })).toBeCloseTo(81 / 15000, 12);
    expect(estimatePower("rc_lowpass", { fc: 1000 }, { R1: 1000, C1: 1.6e-7 })).toBeNull();
  });

  test("objectives that don't apply are dropped (power weight on an AC filter falls back to error)", async () => {
    const r = await optimizeMulti({
      type: "rc_lowpass",
      targets: { fc: 1000 },
      components: [
        { ref: "R1", rawValue: 1000, unit: "Ω", display: "1 kΩ", description: "Resistor" },
        { ref: "C1", rawValue: 1.6e-7, unit: "F", display: "160 nF", description: "Capacitor" },
      ],
      simulate: ({ valueMap }) => Promise.resolve({ measured: 1 / (2 * Math.PI * valueMap.R1 * valueMap.C1), target: 1000 }),
      weights: { power: 1 },
      perSide: 4,
    });
    expect(r.objectives).not.toContain("power"); // no DC power for this type
    expect(r.objectives).toContain("error");
    expect(r.chosen).toBeTruthy();
  });

  test("yield weight uses the injected yield fn and prefers the higher-yield design", async () => {
    // Yield favours larger R2 (arbitrary monotone stub).
    const yieldFn = (vm) => Promise.resolve(Math.min(1, vm.R2 / 20000));
    const r = await optimizeMulti({ ...base, weights: { yield: 1 }, yieldFn, yieldTopK: 25 });
    expect(r.objectives).toContain("yield");
    const withYield = r.candidates.filter((c) => typeof c.yield === "number");
    const maxYield = Math.max(...withYield.map((c) => c.yield));
    expect(r.chosen.yield).toBeCloseTo(maxYield, 12);
  });

  test("the Pareto set is non-dominated on the active objectives", async () => {
    const r = await optimizeMulti({ ...base, weights: { error: 1, power: 1 } });
    const FIELD = { error: "errorPct", cost: "cost", power: "power", yield: "yield" };
    const objs = r.objectives;
    const val = (g, o) => (o === "yield" ? -(g.yield ?? -1) : g[FIELD[o]] ?? Infinity); // all lower-better
    const dominated = (x, y) =>
      objs.every((o) => val(y, o) <= val(x, o)) && objs.some((o) => val(y, o) < val(x, o));
    for (const x of r.pareto) {
      expect(r.candidates.some((y) => y !== x && dominated(x, y))).toBe(false);
    }
  });
});
