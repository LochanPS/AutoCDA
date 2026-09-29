import { designerAgent } from "./designerAgent";
import { isVerifiable, circuitTargetInfo, dominantRef, buildNetlist, simDescriptor } from "./simulatorAgent";

describe("designerAgent", () => {
  test("designs an RC low-pass and snaps the capacitor to E-series", () => {
    const out = designerAgent({ type: "rc_lowpass", targets: { fc: 1000 }, eSeries: "E24" });
    expect(out.ok).toBe(true);
    expect(out.name).toBe("RC Low-Pass Filter");
    const c1 = out.snapped.find((c) => c.ref === "C1");
    expect(c1.rawValue).toBeCloseTo(1.6e-7, 12); // 159 nF ideal -> 160 nF E24
    const idealC1 = out.idealComponents.find((c) => c.ref === "C1");
    expect(idealC1.rawValue).not.toBe(c1.rawValue); // ideal differs from snapped
  });

  test("resistors are snapped too, non-passives left alone", () => {
    const out = designerAgent({ type: "voltage_divider", targets: { Vin: 9, Vout: 3.3 }, eSeries: "E24" });
    const r1 = out.snapped.find((c) => c.ref === "R1");
    expect(r1.unit).toBe("Ω");
    expect([1500, 1600, 1800, 2000]).toContain(r1.rawValue); // near ideal 1.727k
  });

  test("unknown type fails cleanly", () => {
    expect(designerAgent({ type: "nope", targets: {} }).ok).toBe(false);
  });
});

describe("simulatorAgent primitives (pure)", () => {
  test("isVerifiable reflects the descriptor table", () => {
    expect(isVerifiable("rc_lowpass")).toBe(true);
    expect(isVerifiable("rc_oscillator")).toBe(false);
    expect(isVerifiable("zener_regulator")).toBe(false);
    expect(isVerifiable("banana")).toBe(false);
  });

  test("circuitTargetInfo returns the scalar target", () => {
    expect(circuitTargetInfo("rc_lowpass", { fc: 2000 })).toEqual({ name: "fc", value: 2000 });
    const bp = circuitTargetInfo("band_pass", { fL: 200, fH: 2000 });
    expect(bp.name).toBe("fc");
    expect(bp.value).toBeCloseTo(Math.sqrt(200 * 2000), 6);
    expect(circuitTargetInfo("rc_oscillator", {})).toBeNull();
  });

  test("dominantRef names the refined component", () => {
    expect(dominantRef("rc_lowpass")).toBe("C1");
    expect(dominantRef("voltage_divider")).toBe("R1");
    expect(dominantRef("opamp_inverting")).toBe("Rf");
  });

  test("buildNetlist emits ngspice-valid values (no unicode units)", () => {
    const nl = buildNetlist("voltage_divider", { R1: 1800, R2: 1000 }, { Vin: 9 });
    expect(nl).toContain("R1 in out 1800");
    expect(nl).toContain("R2 out 0 1000");
    expect(nl).toContain(".dc V1 9 9 1");
    expect(nl).not.toMatch(/[Ωμ]/);
  });

  test("descriptor exists for each of the 10 supported types", () => {
    const ids = ["rc_lowpass","rc_highpass","voltage_divider","led_limiter","common_emitter","band_pass","opamp_inverting","opamp_noninverting","zener_regulator","rc_oscillator"];
    for (const id of ids) expect(simDescriptor(id)).toBeDefined();
  });
});
