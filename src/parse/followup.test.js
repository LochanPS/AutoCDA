import { applyFollowup } from "./followup";
import { makeSpec } from "../spec/circuitSpec";

const lowpass = () => makeSpec({ type: "rc_lowpass", targets: { fc: 1000 }, constraints: { eSeries: "E24", tolerance: 0.05 } });
const amp = () => makeSpec({ type: "common_emitter", targets: { Av: 20 }, constraints: { eSeries: "E24", tolerance: 0.05 } });
const sallen = () => makeSpec({ type: "sallen_key_lowpass", targets: { fc: 2000 }, constraints: { eSeries: "E24", tolerance: 0.05 } });
const bandpass = () => makeSpec({ type: "band_pass", targets: { fL: 300, fH: 3000 }, constraints: { eSeries: "E24", tolerance: 0.05 } });

describe("applyFollowup — target set (absolute)", () => {
  test("'lower the gain to 8' sets Av=8", () => {
    const r = applyFollowup(amp(), "lower the gain to 8");
    expect(r.ok).toBe(true);
    expect(r.spec.targets.Av).toBe(8);
    expect(r.change.kind).toBe("target_set");
    expect(r.change.label).toMatch(/gain to 8/);
  });

  test("'cutoff to 5 kHz' sets fc=5000 with SI prefix", () => {
    const r = applyFollowup(lowpass(), "set the cutoff to 5 kHz");
    expect(r.ok).toBe(true);
    expect(r.spec.targets.fc).toBe(5000);
  });
});

describe("applyFollowup — target scale (relative)", () => {
  test("'raise the cutoff by 50%' scales fc ×1.5", () => {
    const r = applyFollowup(lowpass(), "raise the cutoff by 50%");
    expect(r.ok).toBe(true);
    expect(r.spec.targets.fc).toBeCloseTo(1500, 6);
    expect(r.change.kind).toBe("target_scale");
  });

  test("'double the gain' scales Av ×2", () => {
    const r = applyFollowup(amp(), "double the gain");
    expect(r.ok).toBe(true);
    expect(r.spec.targets.Av).toBe(40);
  });

  test("band-pass 'widen by 20%' scales both edges", () => {
    const r = applyFollowup(bandpass(), "raise the frequency by 20%");
    expect(r.ok).toBe(true);
    expect(r.spec.targets.fL).toBeCloseTo(360, 4);
    expect(r.spec.targets.fH).toBeCloseTo(3600, 4);
  });
});

describe("applyFollowup — constraints", () => {
  test("'use E96' changes the E-series", () => {
    const r = applyFollowup(lowpass(), "use E96");
    expect(r.ok).toBe(true);
    expect(r.spec.constraints.eSeries).toBe("E96");
    expect(r.change.kind).toBe("eseries");
  });

  test("'tighter tolerance' halves tolerance", () => {
    const r = applyFollowup(lowpass(), "tighter tolerance");
    expect(r.ok).toBe(true);
    expect(r.spec.constraints.tolerance).toBeCloseTo(0.025, 6);
    expect(r.change.label).toMatch(/Tightened/);
  });

  test("'2% tolerance' sets tolerance explicitly", () => {
    const r = applyFollowup(lowpass(), "2% tolerance");
    expect(r.ok).toBe(true);
    expect(r.spec.constraints.tolerance).toBeCloseTo(0.02, 6);
  });
});

describe("applyFollowup — topology (sharpen / cut cost)", () => {
  test("'sharpen the rolloff' steps RC → Sallen-Key, keeping fc", () => {
    const r = applyFollowup(lowpass(), "sharpen the rolloff");
    expect(r.ok).toBe(true);
    expect(r.spec.type).toBe("sallen_key_lowpass");
    expect(r.spec.targets.fc).toBe(1000);
    expect(r.change.kind).toBe("order_up");
  });

  test("'cut cost 20%' steps Sallen-Key → RC, keeping fc", () => {
    const r = applyFollowup(sallen(), "cut cost 20%");
    expect(r.ok).toBe(true);
    expect(r.spec.type).toBe("rc_lowpass");
    expect(r.spec.targets.fc).toBe(2000);
    expect(r.change.kind).toBe("cost_down");
  });

  test("cut cost on an already-minimal RC fails calmly", () => {
    const r = applyFollowup(lowpass(), "make it cheaper");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/cheapest topology/);
  });
});

describe("applyFollowup — guardrails", () => {
  test("unrecognized edit → calm message with suggestions", () => {
    const r = applyFollowup(lowpass(), "make it blue and shiny");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/couldn.t read that as an edit/i);
  });

  test("referencing a parameter the circuit lacks → specific message", () => {
    const r = applyFollowup(lowpass(), "lower the gain to 8");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/doesn.t have that parameter/i);
  });

  test("new spec validates (no NaN targets)", () => {
    const r = applyFollowup(lowpass(), "use E96");
    expect(r.ok).toBe(true);
    for (const v of Object.values(r.spec.targets)) expect(Number.isFinite(v)).toBe(true);
  });
});
