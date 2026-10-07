import {
  measureSettlingTime,
  measureSlewRate,
  measureOvershoot,
  measureRiseTime,
  measureStability,
  measureOutputImpedance,
  measurePSRR,
} from "./metrics";

// Uniform time grid helper.
const grid = (n, dt = 1e-6) => Array.from({ length: n }, (_, i) => i * dt);

describe("transient step-response metrics", () => {
  test("settling time: within band after a damped approach", () => {
    // Value jumps to within 2% of 1.0 at index 50 and stays there.
    const n = 200;
    const dt = 1e-6;
    const sweep = grid(n, dt);
    const y = sweep.map((_, i) => (i < 50 ? 0.5 : 1.0));
    const ts = measureSettlingTime({ sweep, nodes: { out: y } }, "out", { band: 0.02 });
    // Last sample outside the ±2% band is index 49 → t = 49·dt.
    expect(ts).toBeCloseTo(49 * dt, 9);
  });

  test("slew rate: steepest edge in V/s", () => {
    const dt = 1e-6;
    const sweep = grid(4, dt);
    // steps: +0.1, +2.0, +0.1  → max slope = 2.0/dt
    const y = [0, 0.1, 2.1, 2.2];
    expect(measureSlewRate({ sweep, nodes: { out: y } }, "out")).toBeCloseTo(2.0 / dt, 3);
  });

  test("overshoot: peak above final relative to step", () => {
    // step 0→1, peaks at 1.2 → 20% overshoot
    const sweep = grid(200);
    const y = sweep.map((_, i) => (i < 20 ? 0 : i < 30 ? 1.2 : 1.0));
    const os = measureOvershoot({ sweep, nodes: { out: y } }, "out");
    expect(os).toBeCloseTo(20, 1);
  });

  test("no overshoot → 0", () => {
    const sweep = grid(100);
    const y = sweep.map((_, i) => (i < 10 ? 0 : 1.0));
    expect(measureOvershoot({ sweep, nodes: { out: y } }, "out")).toBe(0);
  });

  test("rise time: 10–90% of a linear ramp", () => {
    const dt = 1e-6;
    const n = 101;
    const sweep = grid(n, dt);
    // ramp 0→1 over indices 0..80, then hold at 1.0 (a real plateau to settle on)
    const y = sweep.map((_, i) => Math.min(1, i / 80));
    const tr = measureRiseTime({ sweep, nodes: { out: y } }, "out", { lo: 0.1, hi: 0.9 });
    expect(tr).toBeCloseTo(0.8 * 80 * dt, 6); // 10%→90% spans 64 of the 80 ramp steps
  });
});

describe("measureStability — phase & gain margin from a Bode response", () => {
  // Single-pole-like roll-off: gain crosses 0 dB at 1 kHz, phase ~ -90° there.
  const freq = [10, 100, 1000, 10000, 100000];
  const gainDb = [40, 20, 0, -20, -40];
  const phaseDeg = [-5, -45, -90, -135, -170];

  test("phase margin at unity-gain crossover", () => {
    const s = measureStability(freq, gainDb, phaseDeg);
    expect(s.crossoverHz).toBeCloseTo(1000, 0);
    expect(s.phaseMargin).toBeCloseTo(90, 0); // 180 + (-90)
  });

  test("gain margin null when phase never reaches -180 in range", () => {
    const s = measureStability(freq, gainDb, phaseDeg);
    expect(s.gainMargin).toBeNull();
  });

  test("gain margin read where phase crosses -180", () => {
    const g = [20, 10, 0, -10, -20];
    const p = [-90, -135, -170, -200, -260];
    const s = measureStability(freq, g, p);
    expect(s.phaseCrossHz).toBeGreaterThan(1000);
    expect(s.phaseCrossHz).toBeLessThan(100000);
    expect(s.gainMargin).toBeGreaterThan(0); // positive dB of margin (gain below 0 dB there)
  });
});

describe("two-point small-signal metrics", () => {
  test("output impedance from no-load vs loaded output", () => {
    // Vopen 5.00, loaded 4.90 into 100 Ω → Iload 49 mA → Zout = 0.1/0.049 ≈ 2.04 Ω
    const z = measureOutputImpedance(5.0, 4.9, 100);
    expect(z).toBeCloseTo(0.1 / (4.9 / 100), 6);
  });

  test("output impedance guards bad inputs", () => {
    expect(measureOutputImpedance(5, 5, 0)).toBeNull();
    expect(measureOutputImpedance(NaN, 1, 100)).toBeNull();
  });

  test("PSRR in dB", () => {
    // 1 V supply ripple → 1 mV output ripple = 60 dB rejection
    expect(measurePSRR(1, 0.001)).toBeCloseTo(60, 6);
  });

  test("PSRR guards non-positive ripple", () => {
    expect(measurePSRR(1, 0)).toBeNull();
  });
});
