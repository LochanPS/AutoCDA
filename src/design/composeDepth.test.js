/**
 * composeDepth.test.js — A2: composition depth.
 *   composeGraph         branching (fan-out) compositions, multiple outputs
 *   checkImpedanceMatch  inter-stage loading check (buffer-or-not)
 *   perStageErrors       attribute a composed miss to the stage that drifted
 */

import {
  composeGraph,
  verifyGraph,
  checkImpedanceMatch,
  perStageErrors,
  stageImpedance,
} from "./compose";

describe("composeGraph — branching", () => {
  test("linear default: one terminal, single stimulus, ends at a measure net", () => {
    const g = composeGraph({
      stages: [
        { type: "opamp_noninverting", targets: { Av: 5 } },
        { type: "rc_lowpass", targets: { fc: 1000 } },
      ],
    });
    expect(g.measurePoints).toHaveLength(1);
    expect(g.measurePoints[0]).toMatchObject({ stageIndex: 1, kind: "cutoff", node: "y2" });
    expect(g.netlist.split("\n").filter((l) => /^V1 in 0 AC 1$/.test(l))).toHaveLength(1);
    expect(g.predicted.totalGain).toBeUndefined(); // a filter has no gain → no product
  });

  test("fan-out: one source drives two parallel filters → two measured outputs", () => {
    const g = composeGraph({
      stages: [
        { type: "opamp_noninverting", targets: { Av: 2 } }, // 0: source
        { type: "rc_lowpass", targets: { fc: 1000 } },        // 1: branch A
        { type: "rc_highpass", targets: { fc: 5000 } },       // 2: branch B
      ],
      edges: [[0, 1], [0, 2]],
    });
    // two terminals, each its own measure node
    expect(g.measurePoints.map((m) => m.stageIndex).sort()).toEqual([1, 2]);
    expect(g.measurePoints.map((m) => m.node).sort()).toEqual(["y2", "y3"]);
    // both branches read the source's output net y1
    expect(g.netlist).toMatch(/^R1_S2 y1 /m);
    expect(g.netlist).toMatch(/^C1_S3 y1 /m); // rc_highpass series cap reads y1
  });

  test("rejects a stage with two inputs (no signal mixing)", () => {
    expect(() =>
      composeGraph({
        stages: [
          { type: "rc_lowpass", targets: { fc: 1000 } },
          { type: "rc_lowpass", targets: { fc: 2000 } },
          { type: "opamp_noninverting", targets: { Av: 2 } },
        ],
        edges: [[0, 2], [1, 2]],
      })
    ).toThrow(/multiple inputs/);
  });

  test("rejects an out-of-range edge and an empty graph", () => {
    expect(() => composeGraph({ stages: [{ type: "rc_lowpass", targets: { fc: 1000 } }], edges: [[0, 9]] })).toThrow(/out of range/);
    expect(() => composeGraph({ stages: [] })).toThrow();
  });

  test("verifyGraph measures every terminal via the injected runSpice", async () => {
    const g = composeGraph({
      stages: [
        { type: "opamp_noninverting", targets: { Av: 2 } },
        { type: "rc_lowpass", targets: { fc: 1000 } },
        { type: "rc_lowpass", targets: { fc: 4000 } },
      ],
      edges: [[0, 1], [0, 2]],
    });
    // fake AC result: a flat-ish magnitude so measureCutoff/measureGain return a number
    const fakeRun = async () => ({
      sweep: [10, 100, 1000, 10000],
      nodes: { y2: [1, 1, 0.7, 0.1], y3: [1, 1, 0.7, 0.1], in: [1, 1, 1, 1] },
      errors: [],
    });
    const out = await verifyGraph(g, { runSpice: fakeRun });
    expect(out.outputs).toHaveLength(2);
    expect(out.errors).toEqual([]);
  });
});

describe("checkImpedanceMatch", () => {
  test("op-amp → op-amp is well matched (low Zout into high Zin)", () => {
    const r = checkImpedanceMatch([
      { type: "opamp_noninverting", targets: { Av: 2 } },
      { type: "opamp_noninverting", targets: { Av: 2 } },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].ok).toBe(true);
    expect(r[0].loadingErrorPct).toBeLessThan(0.001);
  });

  test("RC → RC loads badly (Zout ≈ Zin) and is flagged for a buffer", () => {
    const r = checkImpedanceMatch([
      { type: "rc_lowpass", targets: { fc: 1000 } },
      { type: "rc_lowpass", targets: { fc: 1000 } },
    ]);
    expect(r[0].ok).toBe(false);
    expect(r[0].loadingErrorPct).toBeGreaterThan(0.1);
    expect(r[0].note).toMatch(/buffer/i);
  });

  test("respects a custom threshold and per-edge wiring", () => {
    const r = checkImpedanceMatch(
      [
        { type: "opamp_noninverting", targets: { Av: 2 } },
        { type: "rc_lowpass", targets: { fc: 1000 } }, // Zin ≈ 1k, source Zout 75 → ~7%
      ],
      { threshold: 0.1 }
    );
    expect(r[0].ok).toBe(true); // 7% loading passes a 10% threshold
  });

  test("stageImpedance returns null ports for a non-signal type", () => {
    const z = stageImpedance("led_limiter", { R1: 160 });
    expect(z).toEqual({ zin: null, zout: null });
  });
});

describe("perStageErrors", () => {
  // Injected grader: stage 2 is deliberately 20% off; stage 1 is spot on.
  const simulate = ({ type, targets }) => {
    if (type === "opamp_noninverting") return Promise.resolve({ verifiable: true, measured: targets.Av, target: targets.Av, targetName: "Av" });
    if (type === "rc_lowpass") return Promise.resolve({ verifiable: true, measured: targets.fc * 1.2, target: targets.fc, targetName: "fc" });
    return Promise.resolve({ verifiable: false, measured: null, target: null });
  };

  test("attributes the drift to the stage that missed", async () => {
    const rows = await perStageErrors(
      [
        { type: "opamp_noninverting", targets: { Av: 5 } },
        { type: "rc_lowpass", targets: { fc: 1000 } },
      ],
      { simulate }
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].errorPct).toBeCloseTo(0, 6);
    expect(rows[1].errorPct).toBeCloseTo(0.2, 6);
    expect(rows[1].targetName).toBe("fc");
  });
});
