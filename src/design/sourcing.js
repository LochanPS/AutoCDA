/**
 * sourcing.js — whole-BOM sourcing intelligence on top of per-part live pricing.
 *
 * The per-row layer (distributorPricing.js) already picks each part's cheapest
 * offer across sellers. This module answers the BOM-wide questions:
 *   - What does the mix-and-match cheapest basket cost, and how much does it save
 *     versus buying everything from one seller?
 *   - What does that basket cost delivered to India (customs duty + GST + shipping
 *     + forex) — the landed cost no global distributor shows?
 *
 * Pure, side-effect-free, injectable rates. No network here.
 */

// ── India landed-cost ──────────────────────────────────────────────────────────
// Illustrative defaults — tune to reality (HS code, courier, forex of the day).
// Override per call, or app-wide via REACT_APP_* (see envLandedOpts below).
export const INR_LANDED_DEFAULTS = {
  usdToInr: 83.5,       // forex rate
  forexMarkupPct: 0.02, // card / payment forex markup
  dutyPct: 0.10,        // basic customs duty on electronic components (varies by HS code)
  gstPct: 0.18,         // IGST charged on the landed (post-duty) value of imports
  shippingInr: 600,     // flat import shipping + handling per order
};

/** Read landed-cost overrides from REACT_APP_* env (all optional). */
export function envLandedOpts(env = (typeof process !== "undefined" ? process.env : {})) {
  const num = (v) => (v != null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : undefined);
  const o = {
    usdToInr: num(env.REACT_APP_USD_INR),
    forexMarkupPct: num(env.REACT_APP_FOREX_MARKUP),
    dutyPct: num(env.REACT_APP_IMPORT_DUTY),
    gstPct: num(env.REACT_APP_IMPORT_GST),
    shippingInr: num(env.REACT_APP_IMPORT_SHIPPING_INR),
  };
  // drop undefined so they fall back to defaults
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
}

/**
 * Landed cost in INR for a USD subtotal.
 * @returns {{parts:number,duty:number,gst:number,shipping:number,total:number,rate:object}|null}
 */
export function landedCostINR(usdSubtotal, opts = {}) {
  if (!(usdSubtotal >= 0)) return null;
  const r = { ...INR_LANDED_DEFAULTS, ...opts };
  const parts = usdSubtotal * r.usdToInr * (1 + r.forexMarkupPct);
  const duty = parts * r.dutyPct;
  const gst = (parts + duty) * r.gstPct; // GST applies to landed value incl. duty
  const partsLanded = +(parts + duty + gst).toFixed(2);
  const total = +(partsLanded + r.shippingInr).toFixed(2);
  return {
    parts: +parts.toFixed(2),
    duty: +duty.toFixed(2),
    gst: +gst.toFixed(2),
    shipping: r.shippingInr,
    total,
    rate: r,
  };
}

/** Format a number as INR (₹1,23,456.78). Falls back to a plain string off-Intl. */
export function formatINR(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(n);
  } catch {
    return `₹${Number(n).toFixed(2)}`;
  }
}

// ── whole-BOM sourcing summary ──────────────────────────────────────────────────
/**
 * Summarise sourcing for a priced BOM (rows carry `offers:[{source,unitPrice}]`
 * and `qty`/`lineTotal` already reflect each row's cheapest offer).
 * @returns {{
 *   mixedTotal:number,                 // basket at each part's cheapest seller
 *   perSeller:Record<string,{total:number,covered:number,of:number,full:boolean}>,
 *   sellers:string[],
 *   bestSingle:{source:string,total:number}|null,  // cheapest seller that stocks EVERY part
 *   savings:number                     // bestSingle.total - mixedTotal (0 if none)
 * }}
 */
export function summarizeSourcing(bom) {
  const rows = (bom && bom.rows) || [];
  const mixedTotal = +rows.reduce((s, r) => s + (r.lineTotal || 0), 0).toFixed(4);

  const sellers = new Set();
  rows.forEach((r) => (r.offers || []).forEach((o) => o && o.source && sellers.add(o.source)));

  const perSeller = {};
  for (const s of sellers) {
    let total = 0, covered = 0;
    for (const r of rows) {
      const o = (r.offers || []).find((x) => x.source === s && typeof x.unitPrice === "number");
      if (o) { total += o.unitPrice * (r.qty || 1); covered++; }
    }
    perSeller[s] = { total: +total.toFixed(4), covered, of: rows.length, full: rows.length > 0 && covered === rows.length };
  }

  const fulls = Object.entries(perSeller).filter(([, v]) => v.full).sort((a, b) => a[1].total - b[1].total);
  const bestSingle = fulls[0] ? { source: fulls[0][0], total: fulls[0][1].total } : null;
  const savings = bestSingle ? +(bestSingle.total - mixedTotal).toFixed(4) : 0;

  return { mixedTotal, perSeller, sellers: [...sellers], bestSingle, savings };
}
