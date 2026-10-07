import {
  nextPow2,
  fft,
  resampleUniform,
  spectrum,
  measureOscillation,
  measureFrequency,
  measureTHD,
  measureSettled,
  measureLineRegulation,
  measureLoadRegulation,
  zeroCrossFrequency,
} from "./transient";

// ── synthetic transient builders ──────────────────────────────────────────────
// Build a { sweep, nodes } result just like spice.js parseResult emits for a
// `.tran` run, so the analyzers are exercised exactly as in the app. Time steps
// are deliberately *non-uniform* (jittered) to exercise the internal resampling,
// the way real ngspice adaptive stepping produces them.

function tranResult(node, fn, { f, cycles = 40, ptsPerCycle = 40, jitter = 0.15 } = {}) {
  const T = 1 / f;
  const tEnd = cycles * T;
  const n = Math.round(cycles * ptsPerCycle);
  const dt = tEnd / (n - 1);
  const sweep = [];
  const values = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    sweep.push(t);
    values.push(fn(t));
    // jitter the step so time is monotonic but non-uniform
    const j = 1 + jitter * Math.sin(i * 1.7);
    t += dt * j;
  }
  // normalize so the last sample lands exactly on tEnd (monotonic preserved)
  const scale = tEnd / sweep[sweep.length - 1];
  for (let i = 0; i < sweep.length; i++) sweep[i] *= scale;
  return { sweep, nodes: { [node]: values }, sweepType: "time", dataType: "real" };
}

const sine = (A, f, dc = 0, phase = 0) => (t) => dc + A * Math.sin(2 * Math.PI * f * t + phase);

describe("FFT primitive", () => {
  test("nextPow2", () => {
    expect(nextPow2(1)).toBe(1);
    expect(nextPow2(3)).toBe(4);
    expect(nextPow2(1000)).toBe(1024);
    expect(nextPow2(1024)).toBe(1024);
  });

  test("transforms a single-bin cosine to one spectral line", () => {
    const N = 64;
    const k0 = 4; // 4 cycles across the window
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = Math.cos((2 * Math.PI * k0 * i) / N);
    fft(re, im);
    const mag = Array.from(re, (r, i) => Math.hypot(r, im[i]));
    let peak = 1;
    for (let i = 1; i < N / 2; i++) if (mag[i] > mag[peak]) peak = i;
    expect(peak).toBe(k0);
    // Energy concentrated in that bin: it dwarfs its neighbours.
    expect(mag[k0]).toBeGreaterThan(20 * (mag[k0 - 1] + mag[k0 + 1] + 1e-9));
  });

  test("Parseval: time energy ≈ spectral energy / N", () => {
    const N = 32;
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = Math.sin(i) + 0.3 * Math.cos(2 * i);
    const timeE = re.reduce((a, v) => a + v * v, 0);
    fft(re, im);
    let specE = 0;
    for (let i = 0; i < N; i++) specE += re[i] * re[i] + im[i] * im[i];
    expect(specE / N).toBeCloseTo(timeE, 6);
  });
});

describe("resampleUniform", () => {
  test("recovers a linear ramp exactly on a uniform grid", () => {
    const t = [0, 0.3, 0.31, 0.8, 1.0];
    const y = t.map((x) => 2 * x + 1);
    const { y: out, dt } = resampleUniform(t, y, 5);
    expect(dt).toBeCloseTo(0.25, 10);
    out.forEach((v, i) => expect(v).toBeCloseTo(2 * (i * 0.25) + 1, 6));
  });
});

describe("measureFrequency — oscillation frequency from the FFT", () => {
  for (const f of [500, 1000, 2000, 3300, 7777]) {
    test(`pure ${f} Hz sine measured within 1%`, () => {
      const r = tranResult("out", sine(2, f, 0.5), { f });
      const meas = measureFrequency(r, "out");
      expect(Math.abs(meas - f) / f).toBeLessThan(0.01);
    });
  }

  test("accurate across sample rates (20 vs 80 pts/cycle)", () => {
    for (const ptsPerCycle of [20, 80]) {
      const r = tranResult("out", sine(1, 1234, 0), { f: 1234, ptsPerCycle });
      expect(Math.abs(measureFrequency(r, "out") - 1234) / 1234).toBeLessThan(0.01);
    }
  });

  test("defaults to the last node when none is named", () => {
    const r = tranResult("vout", sine(1, 900, 0), { f: 900 });
    expect(Math.abs(measureFrequency(r) - 900) / 900).toBeLessThan(0.01);
  });
});

describe("measureOscillation — amplitude metrics", () => {
  test("Vpp, amplitude, RMS and DC offset of an offset sine", () => {
    const A = 3;
    const dc = 1.2;
    const r = tranResult("out", sine(A, 1000, dc), { f: 1000, jitter: 0 });
    const m = measureOscillation(r, "out");
    expect(m.vpp).toBeCloseTo(2 * A, 1);
    expect(m.amplitude).toBeCloseTo(A, 1);
    expect(m.rms).toBeCloseTo(A / Math.SQRT2, 1);
    expect(m.dcOffset).toBeCloseTo(dc, 1);
    expect(m.method).toBe("fft");
  });

  test("returns null on too-short input", () => {
    expect(measureOscillation({ sweep: [0, 1], nodes: { out: [0, 1] } }, "out")).toBeNull();
  });
});

describe("zeroCrossFrequency — independent cross-check", () => {
  test("noisy, DC-offset sine still within 1%", () => {
    const f = 1500;
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff - 0.5;
    };
    const r = tranResult("out", (t) => 0.8 + 2 * Math.sin(2 * Math.PI * f * t) + 0.05 * rand(), {
      f,
      ptsPerCycle: 60,
    });
    const fz = zeroCrossFrequency(r.sweep, r.nodes.out);
    expect(Math.abs(fz - f) / f).toBeLessThan(0.01);
  });
});

describe("measureTHD", () => {
  test("pure sine has near-zero THD", () => {
    const r = tranResult("out", sine(2, 1000, 0), { f: 1000, jitter: 0 });
    expect(measureTHD(r, "out")).toBeLessThan(0.02);
  });

  test("sine + 10% third harmonic reads ≈ 10% THD", () => {
    const f = 1000;
    const fn = (t) => 1 * Math.sin(2 * Math.PI * f * t) + 0.1 * Math.sin(2 * Math.PI * 3 * f * t);
    const r = tranResult("out", fn, { f, ptsPerCycle: 64, jitter: 0 });
    const thd = measureTHD(r, "out");
    expect(thd).toBeGreaterThan(0.08);
    expect(thd).toBeLessThan(0.12);
  });
});

describe("measureSettled", () => {
  test("mean of the settled tail", () => {
    // ramp that settles to 5 over the last 10%
    const n = 100;
    const sweep = Array.from({ length: n }, (_, i) => i);
    const out = Array.from({ length: n }, (_, i) => (i < 90 ? i / 18 : 5));
    expect(measureSettled({ sweep, nodes: { out } }, "out", { tail: 0.1 })).toBeCloseTo(5, 6);
  });
});

describe("regulation analyzers", () => {
  test("line regulation = ΔVout/ΔVin on a ramped supply", () => {
    // Vin ramps 10→14; Vout tracks weakly at 0.02 V/V around 5 V.
    const n = 200;
    const sweep = Array.from({ length: n }, (_, i) => i);
    const vin = Array.from({ length: n }, (_, i) => 10 + (4 * i) / (n - 1));
    const vout = vin.map((v) => 5 + 0.02 * (v - 10));
    const reg = measureLineRegulation({ sweep, nodes: { in: vin, out: vout } }, { outNode: "out", inNode: "in", loFrac: 0 });
    expect(reg.perVolt).toBeCloseTo(0.02, 3);
    expect(reg.percent).toBeCloseTo(2, 2);
    expect(reg.dVin).toBeCloseTo(4, 2);
  });

  test("load regulation = Vout before vs after a load step", () => {
    const n = 200;
    const sweep = Array.from({ length: n }, (_, i) => i);
    // settled at 5.00 until the midpoint, droops to 4.90 after the load steps in
    const vout = Array.from({ length: n }, (_, i) => (i < n / 2 ? 5.0 : 4.9));
    const reg = measureLoadRegulation({ sweep, nodes: { out: vout } }, { outNode: "out", stepFrac: 0.5 });
    expect(reg.before).toBeCloseTo(5.0, 6);
    expect(reg.after).toBeCloseTo(4.9, 6);
    expect(reg.dVout).toBeCloseTo(-0.1, 6);
  });
});

describe("corner robustness — frequency still within 1%", () => {
  const f = 1111;
  test("non-power-of-2 sample count", () => {
    const r = tranResult("out", sine(1, f, 0), { f, cycles: 37, ptsPerCycle: 41 });
    expect(Math.abs(measureFrequency(r, "out") - f) / f).toBeLessThan(0.01);
  });

  test("few cycles (12) still resolves", () => {
    const r = tranResult("out", sine(1, f, 0), { f, cycles: 12, ptsPerCycle: 64 });
    expect(Math.abs(measureFrequency(r, "out") - f) / f).toBeLessThan(0.01);
  });

  test("large DC offset does not pull the fundamental", () => {
    const r = tranResult("out", sine(1, f, 50), { f });
    expect(Math.abs(measureFrequency(r, "out") - f) / f).toBeLessThan(0.01);
  });
});
