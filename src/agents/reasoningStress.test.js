/**
 * reasoningStress.test.js — robustness sweep for the closed-loop ReasoningAgent.
 *
 * Exercises all 8 SPICE-verifiable circuit types over wide target ranges, poor
 * starting seeds (up to 64x off the ideal), and tightening tolerances, using
 * analytic response models so the loop LOGIC is tested deterministically without
 * the wasm engine. Guards the two guarantees the product relies on:
 *   - at the product tolerance (5%) it always converges, even from a bad seed;
 *   - at 2% it always converges via the E96 resistor trim (even from a bad seed);
 * and documents the physical floor below ~1% (single standard part granularity).
 */

import { designerAgent } from "./designerAgent";
import { reasoningAgent } from "./reasoningAgent";
import { snap, applyValue } from "../design/eseries";

const dom = {
  rc_lowpass: "C1", rc_highpass: "C1", voltage_divider: "R1", led_limiter: "R1",
  opamp_inverting: "Rf", opamp_noninverting: "Rf", common_emitter: "RE", band_pass: "C1",
};

function analyticSim(type, targets, extra = {}) {
  return async ({ valueMap: v }) => {
    let measured, target, targetName;
    switch (type) {
      case "rc_lowpass": case "rc_highpass":
        measured = 1 / (2 * Math.PI * v.R1 * v.C1); target = targets.fc; targetName = "fc"; break;
      case "voltage_divider":
        measured = (targets.Vin * v.R2) / (v.R1 + v.R2); target = targets.Vout; targetName = "Vout"; break;
      case "led_limiter":
        measured = Math.max(0, (targets.Vsupply - 1.9) / v.R1); target = targets.I; targetName = "I"; break;
      case "opamp_inverting":
        measured = v.Rf / v.R1; target = targets.Av; targetName = "Av"; break;
      case "opamp_noninverting":
        measured = 1 + v.Rf / v.R1; target = targets.Av; targetName = "Av"; break;
      case "common_emitter":
        measured = (v.RC ?? extra.RC ?? 4700) / (v.RE + 5); target = targets.Av; targetName = "Av"; break;
      case "band_pass":
        measured = 1 / (2 * Math.PI * Math.sqrt(v.R1 * v.C1 * v.R2 * v.C2)); target = Math.sqrt(targets.fL * targets.fH); targetName = "fc"; break;
      default: throw new Error("no model " + type);
    }
    return { verifiable: true, measured, target, targetName, errors: [] };
  };
}

async function runOne(type, targets, seedFactor, tol, maxIterations) {
  const d = designerAgent({ type, targets, eSeries: "E24" });
  const dref = dom[type];
  const idealDom = d.idealComponents.find((c) => c.ref === dref).rawValue;
  const extra = {};
  if (type === "common_emitter") extra.RC = d.snapped.find((c) => c.ref === "RC").rawValue;
  const snapped = d.snapped.map((c) => (c.ref === dref ? applyValue(c, snap(idealDom * seedFactor, "E24")) : c));
  return reasoningAgent({
    type, targets, snapped, idealComponents: d.idealComponents,
    tolerance: tol, eSeries: "E24", maxIterations,
    simulate: analyticSim(type, targets, extra),
  });
}

const TARGETS = {
  rc_lowpass: [100, 500, 1000, 3300, 12000, 20000].map((fc) => ({ fc })),
  rc_highpass: [20, 500, 1000, 4700, 10000].map((fc) => ({ fc })),
  voltage_divider: [[9, 3.3], [12, 5], [24, 12], [48, 3.3], [5, 0.5]].map(([Vin, Vout]) => ({ Vin, Vout })),
  led_limiter: [[5, 0.02], [12, 0.01], [3.3, 0.005], [24, 0.01]].map(([Vsupply, I]) => ({ Vsupply, I })),
  opamp_inverting: [2, 5, 10, 25, 100].map((Av) => ({ Av })),
  opamp_noninverting: [2, 5, 11, 40].map((Av) => ({ Av })),
  common_emitter: [10, 20, 40, 60].map((Av) => ({ Av })),
  band_pass: [[200, 2000], [1000, 10000], [100, 8000]].map(([fL, fH]) => ({ fL, fH })),
};

async function sweep(seedFactor, tol, maxIterations) {
  let n = 0, conv = 0, worst = 0;
  const fails = [];
  for (const type of Object.keys(TARGETS)) {
    for (const targets of TARGETS[type]) {
      const r = await runOne(type, targets, seedFactor, tol, maxIterations);
      n++;
      if (r.converged) conv++;
      else fails.push(`${type} ${JSON.stringify(targets)} bestErr=${(r.best.errorPct * 100).toFixed(1)}%`);
      if (r.best) worst = Math.max(worst, r.best.errorPct);
    }
  }
  return { n, conv, worst, fails };
}

describe("ReasoningAgent robustness sweep (analytic models, all 8 types)", () => {
  test("tol 5% (product default): 100% convergence from a GOOD seed", async () => {
    const s = await sweep(1, 0.05, 6);
    expect(s.conv).toBe(s.n);
  }, 30000);

  test("tol 5%: 100% even from an 8x-too-high seed", async () => {
    const s = await sweep(8, 0.05, 6);
    expect(s.conv).toBe(s.n);
  }, 30000);

  test("tol 5%: 100% even from a /8-too-low seed", async () => {
    const s = await sweep(1 / 8, 0.05, 6);
    expect(s.conv).toBe(s.n);
  }, 30000);

  test("tol 5%: 100% even from a 64x-off seed with a larger budget", async () => {
    const s = await sweep(64, 0.05, 10);
    expect(s.conv).toBe(s.n);
  }, 30000);

  test("tol 2%: 100% via the E96 resistor trim, from a good seed", async () => {
    const s = await sweep(1, 0.02, 6);
    expect(s.conv).toBe(s.n);
  }, 30000);

  test("tol 2%: 100% via the E96 trim even from an 8x-off seed", async () => {
    const s = await sweep(8, 0.02, 6);
    expect(s.conv).toBe(s.n);
  }, 30000);

  test("tol 1%: 100% via the joint two-component trim (reliable sub-1%)", async () => {
    // A single standard part is only ~1% granular (E96 half-step ~1.15%). The
    // joint phase searches the dominant AND its partner together; their combined
    // value set is dense enough to land every supported case under 1%.
    const s = await sweep(1, 0.01, 8);
    expect(s.conv).toBe(s.n);
    expect(s.worst).toBeLessThan(0.01);
  }, 60000);

  test("tol 0.5%: joint trim helps but sub-0.5% is not guaranteed (series/parallel is next)", async () => {
    // Below ~0.5% the discrete joint grid runs out; true arbitrary precision
    // needs series/parallel resistor synthesis. Documented, not over-claimed.
    const s = await sweep(1, 0.005, 8);
    expect(s.conv / s.n).toBeGreaterThanOrEqual(0.6);
    expect(s.worst).toBeLessThan(0.012);
  }, 60000);
});
