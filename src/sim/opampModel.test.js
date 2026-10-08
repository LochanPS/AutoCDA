/**
 * opampModel.test.js — non-ideal op-amp metric helpers (pure parts).
 * The full collectOpampMetrics path is exercised against real ngspice in a smoke
 * script; here we test the math that turns AC data into gain/phase + margins.
 */
import { betaOf, acGainPhase, bandwidthDeck, openLoopDeck } from "./opampModel";

describe("betaOf", () => {
  test("feedback factor R1/(R1+Rf)", () => {
    expect(betaOf({ R1: 10000, Rf: 40000 })).toBeCloseTo(0.2, 6); // noise gain 5
    expect(betaOf({ R1: 10000, Rf: 0 })).toBeCloseTo(1, 6); // unity
  });
  test("null on bad values", () => {
    expect(betaOf({ R1: 0, Rf: 1000 })).toBeNull();
  });
});

describe("acGainPhase", () => {
  test("gain in dB and unwrapped phase from complex AC data", () => {
    const result = {
      sweep: [10, 100, 1000],
      nodesComplex: { out: [{ real: 100, img: 0 }, { real: 0, img: -10 }, { real: 0, img: -1 }] },
    };
    const gp = acGainPhase(result, "out");
    expect(gp.gainDb[0]).toBeCloseTo(40, 3);   // |100| → 40 dB
    expect(gp.gainDb[1]).toBeCloseTo(20, 3);    // |10|  → 20 dB
    expect(gp.phaseDeg[0]).toBeCloseTo(0, 3);
    expect(gp.phaseDeg[1]).toBeCloseTo(-90, 3); // -j → -90°
    expect(gp.phaseDeg[2]).toBeCloseTo(-90, 3); // stays continuous
  });
  test("null when no complex data", () => {
    expect(acGainPhase({ sweep: [1, 2], nodes: {} }, "out")).toBeNull();
  });
});

describe("decks", () => {
  test("bandwidth deck embeds the non-ideal subckt and the feedback network", () => {
    const d = bandwidthDeck("opamp_noninverting", { R1: 10000, Rf: 40000 });
    expect(d).toMatch(/\.subckt NIOP/);
    expect(d).toMatch(/X1 in inv out NIOP/);
    expect(d).toMatch(/Rf inv out 40000/);
    expect(d).toMatch(/\.ac /);
  });
  test("open-loop deck drives the bare macromodel", () => {
    expect(openLoopDeck()).toMatch(/X1 in 0 out NIOP/);
  });
});
