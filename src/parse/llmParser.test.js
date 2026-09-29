import { mapToSpec, parseWithLLM } from "./llmParser";

describe("mapToSpec", () => {
  test("maps a voltage divider (\"step 9 volts down to about 3v3\")", () => {
    const spec = mapToSpec({ type: "voltage_divider", targets: { Vin: 9, Vout: 3.3 }, confidence: 0.9 });
    expect(spec.type).toBe("voltage_divider");
    expect(spec.targets).toEqual({ Vin: 9, Vout: 3.3 });
    expect(spec.confidence).toBe(0.9);
    expect(spec.assumed).toHaveLength(0);
    expect(spec.constraints.eSeries).toBe("E24"); // defaults applied via makeSpec
  });

  test("maps a gain request (\"roughly 40x voltage boost\") to an amplifier", () => {
    const spec = mapToSpec({ type: "opamp_noninverting", targets: { Av: 40 }, confidence: 0.7 });
    expect(spec.type).toBe("opamp_noninverting");
    expect(spec.targets.Av).toBe(40);
  });

  test("missing required target lands in assumed[], not silently defaulted", () => {
    const spec = mapToSpec({ type: "rc_lowpass", targets: {}, confidence: 0.6 });
    expect(spec.targets.fc).toBeUndefined();
    expect(spec.assumed.some((a) => a.startsWith("fc"))).toBe(true);
  });

  test("coerces string numbers", () => {
    const spec = mapToSpec({ type: "rc_lowpass", targets: { fc: "2000" }, confidence: 0.8 });
    expect(spec.targets.fc).toBe(2000);
  });

  test("rejects an unsupported type (enum constraint)", () => {
    expect(() => mapToSpec({ type: "flux_capacitor", targets: {}, confidence: 1 })).toThrow(/unsupported type/);
  });

  test("defaults confidence when the model omits it", () => {
    const spec = mapToSpec({ type: "led_limiter", targets: { Vsupply: 5, I: 0.02 } });
    expect(spec.confidence).toBe(0.7);
  });
});

describe("parseWithLLM", () => {
  const KEY = "REACT_APP_ANTHROPIC_KEY";
  afterEach(() => { delete process.env[KEY]; });

  test("throws a clear error when no key is set", async () => {
    delete process.env[KEY];
    await expect(parseWithLLM("low pass filter 1k")).rejects.toThrow(/no key/);
  });

  test("parses a tool_use response into a CircuitSpec", async () => {
    process.env[KEY] = "sk-test";
    const fakeFetch = async () => ({
      ok: true,
      json: async () => ({
        content: [
          { type: "text", text: "ok" },
          { type: "tool_use", name: "emit_circuit_spec", input: { type: "voltage_divider", targets: { Vin: 9, Vout: 3.3 }, confidence: 0.92 } },
        ],
      }),
    });
    const spec = await parseWithLLM("step 9 volts down to about 3v3", { fetchImpl: fakeFetch });
    expect(spec.type).toBe("voltage_divider");
    expect(spec.targets).toEqual({ Vin: 9, Vout: 3.3 });
    expect(spec.confidence).toBe(0.92);
  });

  test("throws when the response has no tool_use block", async () => {
    process.env[KEY] = "sk-test";
    const fakeFetch = async () => ({ ok: true, json: async () => ({ content: [{ type: "text", text: "hmm" }] }) });
    await expect(parseWithLLM("build me something", { fetchImpl: fakeFetch })).rejects.toThrow(/no structured output/);
  });

  test("surfaces an HTTP error", async () => {
    process.env[KEY] = "sk-test";
    const fakeFetch = async () => ({ ok: false, status: 401, text: async () => "unauthorized" });
    await expect(parseWithLLM("x", { fetchImpl: fakeFetch })).rejects.toThrow(/401/);
  });
});
