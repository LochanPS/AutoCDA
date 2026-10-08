/**
 * substitutes.test.js — C4: buyable equivalents, re-verified in (analytic) SPICE.
 */
import { substituteValues, reVerifyWithSubstitute, proposeVerifiedSubstitutes } from "./substitutes";

// Analytic grader for an rc_lowpass: fc = 1/(2*pi*R1*C1), target 1 kHz.
const C1 = 1 / (2 * Math.PI * 1000 * 1000); // ~159 nF so nominal fc ~ 1 kHz with R1=1k
const components = [
  { ref: "R1", rawValue: 1000, unit: "Ω" },
  { ref: "C1", rawValue: C1, unit: "F" },
];
const simulate = (targets) => async ({ valueMap: v }) => ({
  measured: 1 / (2 * Math.PI * v.R1 * v.C1), target: targets.fc, targetName: "fc",
});

describe("substituteValues", () => {
  test("nearby E96 values within tolerance, closest first, excludes the value", () => {
    const subs = substituteValues(10000, { within: 0.025, series: "E96" });
    expect(subs.length).toBeGreaterThanOrEqual(1);
    expect(subs.every((s) => Math.abs(s.deltaPct) <= 2.5)).toBe(true);
    expect(subs.every((s) => s.value !== 10000)).toBe(true);
    // closest first
    for (let i = 1; i < subs.length; i++) expect(Math.abs(subs[i].deltaPct)).toBeGreaterThanOrEqual(Math.abs(subs[i - 1].deltaPct));
  });

  test("tight tolerance yields few or none", () => {
    expect(substituteValues(10000, { within: 0.001, series: "E96" }).length).toBe(0);
  });
});

describe("reVerifyWithSubstitute", () => {
  test("a close substitute still passes", async () => {
    const r = await reVerifyWithSubstitute({
      type: "rc_lowpass", targets: { fc: 1000 }, components, ref: "R1", newValue: 1020,
      tolerance: 0.05, simulate: simulate({ fc: 1000 }),
    });
    expect(r.ok).toBe(true);
    expect(r.errorPct).toBeLessThan(0.05);
  });

  test("a far substitute fails verification", async () => {
    const r = await reVerifyWithSubstitute({
      type: "rc_lowpass", targets: { fc: 1000 }, components, ref: "R1", newValue: 2000,
      tolerance: 0.05, simulate: simulate({ fc: 1000 }),
    });
    expect(r.ok).toBe(false);
    expect(r.errorPct).toBeGreaterThan(0.4);
  });
});

describe("proposeVerifiedSubstitutes", () => {
  test("returns verified alternatives, verified-first", async () => {
    const subs = await proposeVerifiedSubstitutes({
      type: "rc_lowpass", targets: { fc: 1000 }, components, ref: "R1",
      within: 0.03, series: "E96", tolerance: 0.05, simulate: simulate({ fc: 1000 }),
    });
    expect(subs.length).toBeGreaterThanOrEqual(1);
    expect(subs[0].ok).toBe(true);
    // all returned are within the design tolerance (close R swaps on a 1st-order RC)
    expect(subs.every((s) => s.ok)).toBe(true);
  });
});
