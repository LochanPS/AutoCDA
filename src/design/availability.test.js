/**
 * availability.test.js — C3: stock / MOQ / lead-time aware best-buy.
 */
import { rankOffers, bestOffer, effectiveLineCost, annotateAvailability } from "./availability";

describe("rankOffers", () => {
  test("in-stock beats a cheaper out-of-stock offer", () => {
    const offers = [
      { source: "cheapOOS", unitPrice: 0.01, stock: 0 },
      { source: "inStock", unitPrice: 0.02, stock: 1000 },
    ];
    expect(bestOffer(offers, 5).source).toBe("inStock");
  });

  test("among in-stock, cheapest effective line cost wins (MOQ counted)", () => {
    const offers = [
      { source: "lowUnitHighMoq", unitPrice: 0.01, stock: 1000, moq: 100 }, // 100*0.01 = $1.00
      { source: "fairUnitNoMoq", unitPrice: 0.03, stock: 1000, moq: 1 },     // 5*0.03  = $0.15
    ];
    const best = bestOffer(offers, 5);
    expect(best.source).toBe("fairUnitNoMoq");
    expect(best.overMoq).toBe(false);
  });

  test("lead time breaks ties", () => {
    const offers = [
      { source: "slow", unitPrice: 0.02, stock: 100, leadDays: 20 },
      { source: "fast", unitPrice: 0.02, stock: 100, leadDays: 2 },
    ];
    expect(bestOffer(offers, 1).source).toBe("fast");
  });

  test("unknown stock ranks between in-stock and out-of-stock", () => {
    const offers = [
      { source: "oos", unitPrice: 0.01, stock: 0 },
      { source: "unknown", unitPrice: 0.05, stock: null },
    ];
    expect(bestOffer(offers, 1).source).toBe("unknown");
  });
});

describe("effectiveLineCost", () => {
  test("respects MOQ", () => {
    expect(effectiveLineCost({ unitPrice: 0.01, moq: 100 }, 5)).toBeCloseTo(1.0, 6);
    expect(effectiveLineCost({ unitPrice: 0.01, moq: 1 }, 5)).toBeCloseTo(0.05, 6);
  });
});

describe("annotateAvailability", () => {
  test("rolls up order lead time, out-of-stock, and availability total", () => {
    const bom = {
      rows: [
        { ref: "R1", qty: 2, unitPrice: 0.01, lineTotal: 0.02, offers: [{ source: "a", unitPrice: 0.01, stock: 500, leadDays: 3 }] },
        { ref: "C1", qty: 1, unitPrice: 0.02, lineTotal: 0.02, offers: [{ source: "b", unitPrice: 0.02, stock: 0, leadDays: 30 }, { source: "c", unitPrice: 0.05, stock: 10, leadDays: 14 }] },
      ],
    };
    const a = annotateAvailability(bom);
    expect(a.allInStock).toBe(true); // C1 picks the in-stock offer (c), not the OOS one
    expect(a.orderLeadDays).toBe(14); // slowest chosen part
    expect(a.outOfStock).toEqual([]);
    expect(a.availableTotal).toBeCloseTo(0.02 + 0.05, 4);
  });

  test("flags a row with no in-stock offer as needing a substitute", () => {
    const bom = { rows: [{ ref: "R1", qty: 1, unitPrice: 0.01, offers: [{ source: "a", unitPrice: 0.01, stock: 0 }] }] };
    const a = annotateAvailability(bom);
    expect(a.allInStock).toBe(false);
    expect(a.outOfStock).toEqual(["R1"]);
    expect(a.rows[0].needsSubstitute).toBe(true);
  });

  test("falls back to the row's own price when there are no offers", () => {
    const bom = { rows: [{ ref: "R1", qty: 3, unitPrice: 0.01, lineTotal: 0.03 }] };
    const a = annotateAvailability(bom);
    expect(a.rows[0].best).toBeTruthy();
    expect(a.availableTotal).toBeCloseTo(0.03, 4);
  });
});
