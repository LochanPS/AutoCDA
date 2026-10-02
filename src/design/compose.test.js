import { composeCircuit } from "./compose";

describe("composeCircuit", () => {
  test("chains two non-inverting stages: predicted gain = product, unique parts", () => {
    const c = composeCircuit([
      { type: "opamp_noninverting", targets: { Av: 5 } },
      { type: "opamp_noninverting", targets: { Av: 4 } },
    ]);
    expect(c.predicted.totalGain).toBeCloseTo(20, 6);
    expect(c.measureKind).toBe("gain");
    // stage-tagged, unique refs
    const refs = c.components.map((x) => x.ref);
    expect(new Set(refs).size).toBe(refs.length);
    expect(refs.every((r) => /_S[12]$/.test(r))).toBe(true);
  });

  test("produces a valid single-source chained netlist", () => {
    const c = composeCircuit([
      { type: "rc_lowpass", targets: { fc: 1000 } },
      { type: "rc_lowpass", targets: { fc: 1000 } },
    ]);
    const lines = c.netlist.split("\n");
    // exactly one stimulus source
    expect(lines.filter((l) => /^V1 in 0 AC 1$/.test(l))).toHaveLength(1);
    expect(c.netlist.trim().endsWith(".end")).toBe(true);
    // the chain uses an intermediate node n1 and ends at out
    expect(c.netlist).toMatch(/\bn1\b/);
    expect(c.netlist).toMatch(/\bout\b/);
    // every element line keeps a valid leading type letter (no accidental switches)
    const elementLines = lines.filter((l) => l && !l.startsWith("*") && !l.startsWith(".") && !/^V1 /.test(l));
    expect(elementLines.every((l) => /^[RCLDEQMVIG]\w*_S\d/.test(l))).toBe(true);
    expect(c.measureKind).toBe("cutoff");
  });

  test("dedupes shared .model lines across stages (common-emitter x2)", () => {
    const c = composeCircuit([
      { type: "common_emitter", targets: { Av: 10 } },
      { type: "common_emitter", targets: { Av: 10 } },
    ]);
    const models = c.netlist.split("\n").filter((l) => /^\.model\b/i.test(l));
    const names = models.map((l) => l.trim().split(/\s+/)[1]);
    expect(new Set(names).size).toBe(names.length); // no duplicate model names
  });

  test("rejects an unknown type and an empty chain", () => {
    expect(() => composeCircuit([{ type: "nope", targets: {} }])).toThrow();
    expect(() => composeCircuit([])).toThrow();
  });
});
