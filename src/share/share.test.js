import { encodeDesign, decodeDesign, buildShareUrl, readDesignFromHash } from "./designLink";
import { listDesigns, saveDesign, deleteDesign, clearDesigns } from "./designStore";

const design = () => ({
  type: "rc_lowpass",
  targets: { fc: 1000 },
  constraints: { eSeries: "E96", tolerance: 0.02, maxCost: null },
  components: [
    { ref: "R1", rawValue: 1000, unit: "Ω", display: "1 kΩ" },
    { ref: "C1", rawValue: 1.6e-7, unit: "F", display: "160 nF" },
  ],
});

describe("designLink — encode/decode round-trip", () => {
  test("encode → decode preserves type, targets, constraints, components", () => {
    const d = decodeDesign(encodeDesign(design()));
    expect(d.type).toBe("rc_lowpass");
    expect(d.targets.fc).toBe(1000);
    expect(d.constraints.eSeries).toBe("E96");
    expect(d.constraints.tolerance).toBeCloseTo(0.02, 6);
    expect(d.components).toHaveLength(2);
    expect(d.components[0]).toEqual({ ref: "R1", rawValue: 1000, unit: "Ω" });
  });

  test("blob is URI-safe (no chars needing escaping)", () => {
    const blob = encodeDesign(design());
    expect(blob).toBe(encodeURIComponent(blob));
  });

  test("corrupt / empty / unknown-type blobs decode to null, never throw", () => {
    expect(decodeDesign("")).toBeNull();
    expect(decodeDesign("%%%not-valid%%%")).toBeNull();
    expect(decodeDesign(null)).toBeNull();
    const badType = encodeDesign({ ...design(), type: "quantum_flux_capacitor" });
    expect(decodeDesign(badType)).toBeNull();
  });
});

describe("designLink — URL hash", () => {
  const loc = { origin: "https://autocda.app", pathname: "/" };

  test("buildShareUrl produces an #d= link that reads back to the design", () => {
    const url = buildShareUrl(design(), loc);
    expect(url.startsWith("https://autocda.app/#d=")).toBe(true);
    const hash = url.slice(url.indexOf("#"));
    const d = readDesignFromHash(hash);
    expect(d.type).toBe("rc_lowpass");
    expect(d.targets.fc).toBe(1000);
  });

  test("readDesignFromHash tolerates extra params and missing key", () => {
    const blob = encodeDesign(design());
    expect(readDesignFromHash(`#x=1&d=${blob}`).type).toBe("rc_lowpass");
    expect(readDesignFromHash("#nope=1")).toBeNull();
    expect(readDesignFromHash("")).toBeNull();
  });
});

describe("designStore — localStorage CRUD", () => {
  beforeEach(() => clearDesigns());

  test("save then list returns the record, newest first", () => {
    const a = saveDesign(design(), { name: "First" });
    const b = saveDesign({ ...design(), targets: { fc: 2000 } }, { name: "Second" });
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    const list = listDesigns();
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe("Second"); // newest first
    expect(list[1].design.targets.fc).toBe(1000);
  });

  test("delete removes one by id", () => {
    const a = saveDesign(design(), { name: "Keep" });
    const b = saveDesign(design(), { name: "Drop" });
    const after = deleteDesign(b.id);
    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(a.id);
  });

  test("a saved design can be re-shared via its stored payload", () => {
    const rec = saveDesign(design(), { name: "Shareable" });
    const url = buildShareUrl(rec.design, { origin: "https://x", pathname: "/" });
    expect(readDesignFromHash(url.slice(url.indexOf("#"))).type).toBe("rc_lowpass");
  });
});
