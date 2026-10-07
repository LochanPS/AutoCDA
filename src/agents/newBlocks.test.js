/**
 * newBlocks.test.js — A1: the added verified building blocks.
 *   mfb_lowpass          Multiple-Feedback 2nd-order low-pass
 *   instrumentation_amp  3-op-amp instrumentation amplifier
 *   current_mirror       BJT current mirror
 *
 * Covers the full path each block must satisfy to be a real, verifiable type:
 *   1. the parser maps its intent to the right id (regex fast path),
 *   2. the spec registry lists it with the right target fields,
 *   3. designerAgent produces a design and snaps the passives to E-series,
 *   4. the closed reasoning loop converges to the target under an analytic model
 *      (deterministic — no wasm), from a good seed and from a bad one.
 */

import { parsePrompt } from "../utils/circuitParser";
import { SUPPORTED_TYPES } from "../spec/circuitSpec";
import { designerAgent } from "./designerAgent";
import { reasoningAgent } from "./reasoningAgent";
import { dominantRef, circuitTargetInfo } from "./simulatorAgent";
import { snap, applyValue } from "../design/eseries";

// Analytic response models matching each block's governing equation.
const analyticSim = (type, targets) => async ({ valueMap: v }) => {
  let measured, target, targetName;
  switch (type) {
    case "mfb_lowpass":
      measured = 1 / (2 * Math.PI * Math.sqrt(v.R2 * v.R3 * v.C1 * v.C2));
      target = targets.fc; targetName = "fc"; break;
    case "instrumentation_amp":
      measured = 1 + (2 * v.R) / v.Rg; target = targets.Av; targetName = "Av"; break;
    case "current_mirror":
      measured = (12 - 0.7) / v.Rref; target = targets.I; targetName = "I"; break;
    default: throw new Error("no model " + type);
  }
  return { verifiable: true, measured, target, targetName, errors: [] };
};

async function converge(type, targets, seedFactor, tol = 0.05) {
  const d = designerAgent({ type, targets, eSeries: "E24" });
  expect(d.ok).toBe(true);
  const dref = dominantRef(type);
  const idealDom = d.idealComponents.find((c) => c.ref === dref).rawValue;
  const snapped = d.snapped.map((c) =>
    c.ref === dref ? applyValue(c, snap(idealDom * seedFactor, "E24")) : c
  );
  return reasoningAgent({
    type, targets, snapped, idealComponents: d.idealComponents,
    tolerance: tol, eSeries: "E24", maxIterations: 8,
    simulate: analyticSim(type, targets),
  });
}

describe("A1 parser mapping", () => {
  test.each([
    ["multiple feedback low pass 3 kHz", "mfb_lowpass", "fc", 3000],
    ["mfb filter at 1kHz", "mfb_lowpass", "fc", 1000],
    ["instrumentation amplifier gain 50", "instrumentation_amp", "Av", 50],
    ["in-amp gain of 100", "instrumentation_amp", "Av", 100],
    ["current mirror 5 mA", "current_mirror", "I", 0.005],
    ["design a bjt current mirror mirroring 2mA", "current_mirror", "I", 0.002],
  ])("%s → %s", (prompt, id, field, value) => {
    const spec = parsePrompt(prompt);
    expect(spec.type).toBe(id);
    expect(spec.targets[field]).toBeCloseTo(value, 9);
  });

  test("instrumentation amplifier is NOT swallowed by the generic amp fallback", () => {
    expect(parsePrompt("instrumentation amplifier").type).toBe("instrumentation_amp");
  });

  test("mfb low-pass is NOT swallowed by rc_lowpass", () => {
    expect(parsePrompt("mfb low-pass 2kHz").type).toBe("mfb_lowpass");
  });
});

describe("A1 spec registry", () => {
  test.each([
    ["mfb_lowpass", ["fc"]],
    ["instrumentation_amp", ["Av"]],
    ["current_mirror", ["I"]],
  ])("%s is registered with fields %p", (id, fields) => {
    const def = SUPPORTED_TYPES.find((t) => t.id === id);
    expect(def).toBeTruthy();
    expect(def.fields).toEqual(fields);
  });
});

describe("A1 designerAgent", () => {
  test("mfb_lowpass designs 5 passives, all snapped", () => {
    const d = designerAgent({ type: "mfb_lowpass", targets: { fc: 1000 }, eSeries: "E24" });
    expect(d.ok).toBe(true);
    expect(d.snapped.map((c) => c.ref).sort()).toEqual(["C1", "C2", "R1", "R2", "R3"]);
  });

  test("current_mirror snaps Rref but leaves the transistors alone", () => {
    const d = designerAgent({ type: "current_mirror", targets: { I: 0.01 }, eSeries: "E24" });
    const rref = d.snapped.find((c) => c.ref === "Rref");
    expect(rref.unit).toBe("Ω");
    expect(d.snapped.find((c) => c.ref === "Q1").rawValue).toBeNull();
  });

  test("every new type has a dominant ref and a scalar target", () => {
    for (const id of ["mfb_lowpass", "instrumentation_amp", "current_mirror"]) {
      expect(dominantRef(id)).toBeTruthy();
      const info = circuitTargetInfo(id, { fc: 1000, Av: 10, I: 0.01 });
      expect(info && info.name).toBeTruthy();
    }
  });
});

describe("A1 reasoning-loop convergence (analytic models)", () => {
  const cases = {
    mfb_lowpass: [{ fc: 500 }, { fc: 1000 }, { fc: 5000 }],
    instrumentation_amp: [{ Av: 5 }, { Av: 10 }, { Av: 100 }],
    current_mirror: [{ I: 0.005 }, { I: 0.01 }, { I: 0.02 }],
  };

  for (const [type, targetList] of Object.entries(cases)) {
    for (const targets of targetList) {
      test(`${type} ${JSON.stringify(targets)} converges within 5% (good seed)`, async () => {
        const r = await converge(type, targets, 1, 0.05);
        expect(r.converged).toBe(true);
        expect(r.best.errorPct).toBeLessThanOrEqual(0.05);
      }, 20000);

      test(`${type} ${JSON.stringify(targets)} converges from an 8x-off seed`, async () => {
        const r = await converge(type, targets, 8, 0.05);
        expect(r.converged).toBe(true);
      }, 20000);
    }
  }
});
