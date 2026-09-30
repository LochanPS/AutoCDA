import { parsePrompt } from "./circuitParser";

// Regression guards for number/format/type bugs found in the edge-case audit.
// Each of these previously produced a SILENTLY WRONG spec at high confidence.
describe("circuitParser — number & format robustness", () => {
  test("thousands commas are respected (was: '1,500 Hz' -> 500)", () => {
    const r = parsePrompt("low pass 1,500 Hz");
    expect(r.type).toBe("rc_lowpass");
    expect(r.targets.fc).toBe(1500);
  });

  test("scientific notation is respected (was: '1e3 Hz' -> 3)", () => {
    const r = parsePrompt("lowpass 1e3 Hz");
    expect(r.type).toBe("rc_lowpass");
    expect(r.targets.fc).toBe(1000);
  });

  test("collapses whitespace and casing (was: 'LOW   PASS   1KHZ' -> no match)", () => {
    const r = parsePrompt("   LOW   PASS   1KHZ   ");
    expect(r.type).toBe("rc_lowpass");
    expect(r.targets.fc).toBe(1000);
  });

  test("SI prefixes still work", () => {
    expect(parsePrompt("low pass 1 MHz").targets.fc).toBe(1e6);
    expect(parsePrompt("low pass filter at 0.5 kHz").targets.fc).toBe(500);
    expect(parsePrompt("high pass 2kHz").targets.fc).toBe(2000);
  });

  test("bare op-amp routes to an op-amp, not a BJT (was: common_emitter)", () => {
    const r = parsePrompt("op-amp gain 5");
    expect(r.type).toMatch(/^opamp_/);
    expect(r.targets.Av).toBe(5);
  });

  test("a legitimate 0 V is kept, not replaced by a default", () => {
    const r = parsePrompt("voltage divider 0V to 3V");
    expect(r.type).toBe("voltage_divider");
    expect(r.targets.Vin).toBe(0);
    expect(r.targets.Vout).toBe(3);
  });

  test("unknown/empty requests stay confidence 0 (no false positive)", () => {
    for (const p of ["filter", "make me a circuit", "555 timer 1kHz", "buck converter 5V"]) {
      expect(parsePrompt(p).confidence).toBe(0);
    }
  });

  test("explicit inverting / non-inverting still disambiguate", () => {
    expect(parsePrompt("inverting amplifier gain 10").type).toBe("opamp_inverting");
    expect(parsePrompt("non-inverting amplifier gain 11").type).toBe("opamp_noninverting");
  });
});
