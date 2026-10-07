import { summarizeSourcing, landedCostINR, formatINR, envLandedOpts, INR_LANDED_DEFAULTS } from "./sourcing";

describe("summarizeSourcing", () => {
  // Two parts; each row's lineTotal already reflects its cheapest offer.
  const bom = {
    rows: [
      { ref: "R1", qty: 2, unitPrice: 0.01, lineTotal: 0.02, offers: [
        { source: "lcsc", unitPrice: 0.01 }, { source: "mouser", unitPrice: 0.03 },
      ] },
      { ref: "C1", qty: 1, unitPrice: 0.05, lineTotal: 0.05, offers: [
        { source: "mouser", unitPrice: 0.05 }, { source: "lcsc", unitPrice: 0.06 },
      ] },
    ],
  };

  test("mixedTotal sums each row's cheapest line", () => {
    const s = summarizeSourcing(bom);
    expect(s.mixedTotal).toBeCloseTo(0.07, 6); // 2*0.01 + 0.05
  });

  test("per-seller totals and full-coverage flags", () => {
    const s = summarizeSourcing(bom);
    // mouser: R1 0.03*2=0.06 + C1 0.05 = 0.11, covers both
    expect(s.perSeller.mouser).toMatchObject({ covered: 2, of: 2, full: true });
    expect(s.perSeller.mouser.total).toBeCloseTo(0.11, 6);
    // lcsc: R1 0.01*2=0.02 + C1 0.06 = 0.08, covers both
    expect(s.perSeller.lcsc.total).toBeCloseTo(0.08, 6);
    expect(s.perSeller.lcsc.full).toBe(true);
  });

  test("bestSingle is the cheapest full-coverage seller, savings vs mix", () => {
    const s = summarizeSourcing(bom);
    expect(s.bestSingle).toEqual({ source: "lcsc", total: 0.08 });
    expect(s.savings).toBeCloseTo(0.01, 6); // 0.08 - 0.07
  });

  test("a seller missing a part is not a full-coverage single seller", () => {
    const partial = { rows: [
      { ref: "R1", qty: 1, lineTotal: 0.01, offers: [{ source: "lcsc", unitPrice: 0.01 }] },
      { ref: "U1", qty: 1, lineTotal: 0.30, offers: [{ source: "mouser", unitPrice: 0.30 }] },
    ] };
    const s = summarizeSourcing(partial);
    expect(s.perSeller.lcsc.full).toBe(false);
    expect(s.perSeller.mouser.full).toBe(false);
    expect(s.bestSingle).toBeNull();
    expect(s.savings).toBe(0);
    expect(s.mixedTotal).toBeCloseTo(0.31, 6);
  });

  test("empty bom is safe", () => {
    expect(summarizeSourcing({ rows: [] })).toMatchObject({ mixedTotal: 0, bestSingle: null, savings: 0 });
    expect(summarizeSourcing(null).mixedTotal).toBe(0);
  });
});

describe("landedCostINR", () => {
  test("applies forex, duty, GST, and shipping with defaults", () => {
    const d = INR_LANDED_DEFAULTS;
    const usd = 10;
    const l = landedCostINR(usd);
    const parts = usd * d.usdToInr * (1 + d.forexMarkupPct);
    const duty = parts * d.dutyPct;
    const gst = (parts + duty) * d.gstPct;
    expect(l.parts).toBeCloseTo(+parts.toFixed(2), 2);
    expect(l.duty).toBeCloseTo(+duty.toFixed(2), 2);
    expect(l.gst).toBeCloseTo(+gst.toFixed(2), 2);
    expect(l.total).toBeCloseTo(+(parts + duty + gst + d.shippingInr).toFixed(2), 2);
  });

  test("overrides win over defaults", () => {
    const l = landedCostINR(1, { usdToInr: 100, forexMarkupPct: 0, dutyPct: 0, gstPct: 0, shippingInr: 0 });
    expect(l.total).toBeCloseTo(100, 6);
  });

  test("rejects bad input", () => {
    expect(landedCostINR(-1)).toBeNull();
    expect(landedCostINR(NaN)).toBeNull();
  });
});

describe("envLandedOpts", () => {
  test("reads only the set REACT_APP_* numbers", () => {
    const o = envLandedOpts({ REACT_APP_USD_INR: "90", REACT_APP_IMPORT_GST: "0.18", REACT_APP_IMPORT_DUTY: "" });
    expect(o).toEqual({ usdToInr: 90, gstPct: 0.18 });
  });
});

describe("formatINR", () => {
  test("formats numbers and guards junk", () => {
    expect(formatINR(1234.5)).toContain("₹");
    expect(formatINR(null)).toBe("—");
    expect(formatINR(NaN)).toBe("—");
  });
});
