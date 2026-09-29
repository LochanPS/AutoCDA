import {
  normalCdf, yieldForMean, predictMetric, manufacturingSigma,
  scoreCandidate, enumerateCandidates,
} from "./yieldAware";

describe("statistics", () => {
  test("normalCdf is centered and monotonic", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
  });

  test("yieldForMean peaks when the mean is centered in the band", () => {
    const lo = 95, hi = 105, sigma = 3;
    const centered = yieldForMean(100, sigma, lo, hi);
    const offset = yieldForMean(103, sigma, lo, hi);
    expect(centered).toBeGreaterThan(offset);
    expect(centered).toBeGreaterThan(0.9);
  });

  test("zero-sigma yield is a hard in/out of band", () => {
    expect(yieldForMean(100, 0, 95, 105)).toBe(1);
    expect(yieldForMean(110, 0, 95, 105)).toBe(0);
  });
});

describe("linearised model", () => {
  const base = { R1: 1800, C1: 1.6e-7 };
  const sens = { R1: -1000, C1: -1000 }; // dM/d(fractional) for an RC cutoff
  const M0 = 994.7;

  test("predictMetric shifts with fractional component change", () => {
    // +10% on R1 (fractional +0.1) → M0 + (-1000)(0.1) = M0 - 100
    const cand = { ...base, R1: 1800 * 1.1 };
    expect(predictMetric(M0, sens, base, cand)).toBeCloseTo(M0 - 100, 6);
  });

  test("manufacturingSigma grows with sensitivity and tolerance", () => {
    const s5 = manufacturingSigma(sens, 0.05);
    const s10 = manufacturingSigma(sens, 0.10);
    expect(s10).toBeCloseTo(2 * s5, 6);
    // Σ S² = 2e6, tol=0.05 → sqrt(2e6 * 0.0025/3)
    expect(s5).toBeCloseTo(Math.sqrt(2e6 * 0.0025 / 3), 6);
  });
});

describe("enumerateCandidates", () => {
  test("cartesian product over E-series neighbourhoods", () => {
    const combos = enumerateCandidates({ R1: 1000, C1: 1.6e-7 }, ["R1", "C1"], "E24", { k: 2 });
    // 5 values per passive (snapped + 2 below + 2 above) → 25 combos
    expect(combos.length).toBe(25);
    expect(combos.every((c) => "R1" in c && "C1" in c)).toBe(true);
  });

  test("shrinks k to respect maxCombos", () => {
    const combos = enumerateCandidates(
      { R1: 1000, R2: 1000, C1: 1e-7, C2: 1e-7 },
      ["R1", "R2", "C1", "C2"], "E24", { k: 2, maxCombos: 100 }
    );
    expect(combos.length).toBeLessThanOrEqual(100); // 5^4=625 would exceed → k drops to 1 (3^4=81)
    expect(combos.length).toBe(81);
  });
});

describe("yield-aware beats nominal-nearest on centering", () => {
  // Voltage divider Vout = 9 * R2/(R1+R2), target 3.3 V, ±5% band.
  // Nominal-nearest base (R1=1.8k, R2=1k) → 3.214 V (2.6% low, off-centre).
  const target = 3.3, tol = 0.05;
  const base = { R1: 1800, R2: 1000 };
  const divider = (r1, r2) => 9 * r2 / (r1 + r2);
  const M0 = divider(base.R1, base.R2);
  // Finite-difference sensitivities (fractional) around base.
  const sens = {
    R1: (divider(base.R1 * 1.05, base.R2) - divider(base.R1 * 0.95, base.R2)) / (2 * tol),
    R2: (divider(base.R1, base.R2 * 1.05) - divider(base.R1, base.R2 * 0.95)) / (2 * tol),
  };
  const ctx = { M0, sens, base, target, tol };

  test("selects a more-centered, higher-yield candidate than the baseline", () => {
    const combos = enumerateCandidates(base, ["R1", "R2"], "E24", { k: 2 });
    let best = null;
    for (const c of combos) {
      const s = scoreCandidate(c, ctx);
      if (!best || s.predYield > best.predYield) best = s;
    }
    const baseScore = scoreCandidate(base, ctx);
    expect(best.predYield).toBeGreaterThanOrEqual(baseScore.predYield);
    expect(best.nominalError).toBeLessThanOrEqual(baseScore.nominalError + 1e-9);
    // The winner is not simply the nominal-nearest base combo.
    expect(best.nominalError).toBeLessThan(baseScore.nominalError);
  });
});
