import { E12, E24, E96, snap, neighbors } from "./eseries";

describe("E-series tables", () => {
  test("correct lengths", () => {
    expect(E12).toHaveLength(12);
    expect(E24).toHaveLength(24);
    expect(E96).toHaveLength(96);
  });
});

describe("snap()", () => {
  test("snaps 1234 to 1200 (E24)", () => {
    expect(snap(1234, "E24")).toBe(1200);
  });

  test("exact standard values are unchanged", () => {
    expect(snap(1000, "E24")).toBe(1000);
    expect(snap(47000, "E12")).toBe(47000);
    expect(snap(3.3, "E24")).toBeCloseTo(3.3, 10);
  });

  test("rounds up across a decade boundary", () => {
    expect(snap(9500, "E12")).toBe(10000);
  });

  test("works below 1 (capacitor range)", () => {
    // 159 nF → nearest E24 mantissa is 1.6 → 160 nF
    expect(snap(159e-9, "E24")).toBeCloseTo(1.6e-7, 15);
  });

  test("E96 is finer than E24", () => {
    // 1.05k exists exactly in E96; E24 has no 1.05 so it snaps to the
    // log-nearest neighbour (1.1k is closer than 1.0k in ratio terms).
    expect(snap(1050, "E96")).toBe(1050);
    expect(snap(1050, "E24")).toBe(1100);
  });

  test("unknown series throws", () => {
    expect(() => snap(1000, "E99")).toThrow();
  });
});

describe("neighbors()", () => {
  test("returns k below and k above (E24, k=2)", () => {
    expect(neighbors(1000, "E24", 2)).toEqual([820, 910, 1100, 1200]);
  });

  test("k=1 gives one each side", () => {
    expect(neighbors(1000, "E24", 1)).toEqual([910, 1100]);
  });

  test("excludes the snapped value itself", () => {
    expect(neighbors(1000, "E24", 2)).not.toContain(1000);
  });
});
