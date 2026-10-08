/**
 * availability.js — C3: stock / MOQ / lead-time aware "best buy".
 *
 * Cheapest-by-unit-price is naive: a part that's out of stock isn't cheap, and a
 * minimum-order-quantity can make a "cheap" part the expensive one. This ranks a
 * part's offers by what actually matters to get the board built:
 *   1. in stock for the quantity needed (or unknown stock treated as a soft maybe),
 *   2. then effective landed line cost (unit price x max(qty, MOQ)),
 *   3. then shortest lead time.
 *
 * An offer is { source, unitPrice, currency?, stock?, moq?, leadDays?, link? }.
 * stock/leadDays null = unknown (ranked between in-stock and out-of-stock). Pure.
 */

const num = (x, d = null) => (typeof x === "number" && isFinite(x) ? x : d);

/** In-stock state for a quantity: 1 = yes, 0 = unknown, -1 = no. */
function stockState(offer, qty) {
  const s = num(offer.stock);
  if (s == null) return 0;
  return s >= qty ? 1 : -1;
}

/** Effective line cost for an offer, respecting MOQ. */
export function effectiveLineCost(offer, qty) {
  const unit = num(offer.unitPrice);
  if (unit == null) return Infinity;
  const moq = Math.max(1, num(offer.moq, 1));
  return unit * Math.max(qty, moq);
}

/**
 * Rank a part's offers for a required quantity. Returns a new array, best first,
 * each annotated with { inStock: 1|0|-1, lineCost, overMoq }.
 */
export function rankOffers(offers, qty = 1) {
  const annotated = (offers || [])
    .filter((o) => o && num(o.unitPrice) != null)
    .map((o) => ({
      ...o,
      inStock: stockState(o, qty),
      lineCost: effectiveLineCost(o, qty),
      overMoq: Math.max(1, num(o.moq, 1)) > qty, // MOQ forces buying more than needed
    }));
  annotated.sort((a, b) => {
    if (b.inStock !== a.inStock) return b.inStock - a.inStock; // in-stock first
    if (a.lineCost !== b.lineCost) return a.lineCost - b.lineCost; // then cheaper
    return num(a.leadDays, 1e9) - num(b.leadDays, 1e9); // then faster
  });
  return annotated;
}

/** The single best offer for a quantity, or null. */
export function bestOffer(offers, qty = 1) {
  return rankOffers(offers, qty)[0] || null;
}

/**
 * Availability report for a (priced) BOM whose rows may carry `offers`. For each
 * row picks the availability-aware best offer; rolls up the order: when it can ship
 * (the slowest in-stock part's lead time), which refs are out of stock or MOQ-
 * inflated, and the availability-aware total.
 * @param {{rows:Array}} bom
 * @returns {{rows, orderLeadDays:number|null, allInStock:boolean,
 *   outOfStock:string[], moqInflated:string[], availableTotal:number}}
 */
export function annotateAvailability(bom) {
  const rows = (bom.rows || []).map((r) => {
    const qty = num(r.qty, 1);
    const offers = Array.isArray(r.offers) && r.offers.length
      ? r.offers
      : num(r.unitPrice) != null
      ? [{ source: r.priceSource || "catalog", unitPrice: r.unitPrice, stock: num(r.stock), moq: num(r.moq, 1), leadDays: num(r.leadDays) }]
      : [];
    const best = bestOffer(offers, qty);
    return { ...r, best, inStock: best ? best.inStock : 0, leadDays: best ? num(best.leadDays) : null, needsSubstitute: !!best && best.inStock === -1 };
  });

  const outOfStock = rows.filter((r) => r.inStock === -1).map((r) => r.ref);
  const moqInflated = rows.filter((r) => r.best && r.best.overMoq).map((r) => r.ref);
  const leads = rows.map((r) => num(r.leadDays)).filter((d) => d != null);
  const orderLeadDays = leads.length ? Math.max(...leads) : null;
  const availableTotal = +rows.reduce((s, r) => s + (r.best ? r.best.lineCost : num(r.lineTotal, 0)), 0).toFixed(4);

  return {
    rows,
    orderLeadDays,
    allInStock: rows.every((r) => r.inStock === 1),
    outOfStock,
    moqInflated,
    availableTotal,
  };
}
