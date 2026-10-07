import { toDesignFile, parseDesignFile, designFileName, DESIGN_FILE_EXT } from "./designFile";

const design = () => ({
  type: "rc_lowpass",
  targets: { fc: 1000 },
  constraints: { eSeries: "E96", tolerance: 0.02, maxCost: null },
  components: [
    { ref: "R1", rawValue: 1000, unit: "Ω", display: "1 kΩ" },
    { ref: "C1", rawValue: 1.6e-7, unit: "F", display: "160 nF" },
  ],
});

describe("designFile — write/read round-trip", () => {
  test("toDesignFile → parseDesignFile preserves type, targets, constraints, components", () => {
    const res = parseDesignFile(toDesignFile(design(), { name: "My filter" }));
    expect(res.ok).toBe(true);
    expect(res.name).toBe("My filter");
    expect(res.design.type).toBe("rc_lowpass");
    expect(res.design.targets.fc).toBe(1000);
    expect(res.design.constraints.eSeries).toBe("E96");
    expect(res.design.constraints.tolerance).toBeCloseTo(0.02, 6);
    expect(res.design.components).toHaveLength(2);
    // Only the reload-relevant fields are kept (display dropped).
    expect(res.design.components[0]).toEqual({ ref: "R1", rawValue: 1000, unit: "Ω" });
  });

  test("file is pretty-printed JSON with magic + version metadata", () => {
    const text = toDesignFile(design());
    expect(text).toContain("\n");
    const obj = JSON.parse(text);
    expect(obj.magic).toBe("autocda.design");
    expect(obj.v).toBe(1);
    expect(typeof obj.savedAt).toBe("string");
    expect(obj.design.type).toBe("rc_lowpass");
  });

  test("components without a rawValue are dropped on write", () => {
    const d = design();
    d.components.push({ ref: "Q1", unit: "" }); // transistor — no numeric value
    const res = parseDesignFile(toDesignFile(d));
    expect(res.design.components.map((c) => c.ref)).toEqual(["R1", "C1"]);
  });
});

describe("designFile — accepts a bare design object", () => {
  test("an unwrapped {type,...} object parses", () => {
    const res = parseDesignFile(JSON.stringify(design()));
    expect(res.ok).toBe(true);
    expect(res.design.type).toBe("rc_lowpass");
    expect(res.name).toBe("rc_lowpass"); // falls back to type when no name
  });
});

describe("designFile — rejects bad input with a readable message, never throws", () => {
  test.each([
    ["empty string", ""],
    ["not JSON", "{not json"],
    ["wrong magic", JSON.stringify({ magic: "something.else", design: design() })],
    ["unknown type", JSON.stringify({ type: "warp_core", targets: {} })],
    ["no type", JSON.stringify({ targets: { fc: 1000 } })],
  ])("%s → { ok:false, error }", (_label, input) => {
    const res = parseDesignFile(input);
    expect(res.ok).toBe(false);
    expect(typeof res.error).toBe("string");
    expect(res.error.length).toBeGreaterThan(0);
  });

  test("defaults fill in when constraints are missing", () => {
    const res = parseDesignFile(JSON.stringify({ type: "rc_lowpass", targets: {} }));
    expect(res.ok).toBe(true);
    expect(res.design.constraints).toEqual({ eSeries: "E24", tolerance: 0.05, maxCost: null });
    expect(res.design.components).toEqual([]);
  });
});

describe("designFileName", () => {
  test("sanitizes to a safe filename with the .autocda.json extension", () => {
    expect(designFileName("RC Low-Pass · 1.00 kHz")).toBe(`RC_Low-Pass_1.00_kHz${DESIGN_FILE_EXT}`);
  });
  test("empty / junk names fall back to 'design'", () => {
    expect(designFileName("")).toBe(`design${DESIGN_FILE_EXT}`);
    expect(designFileName("***")).toBe(`design${DESIGN_FILE_EXT}`);
  });
});
