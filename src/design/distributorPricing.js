/**
 * distributorPricing.js — pluggable live pricing for the BOM.
 *
 * A PriceSource is any function  async (mpn) => PriceQuote | null  where
 *   PriceQuote = { unitPrice:number, currency:string, stock:number|null, source:string }
 * On a miss (unknown part, out of stock, error) it returns null and the caller
 * keeps the bundled static price — so pricing is best-effort and never breaks the
 * BOM. This mirrors the LLM paths: the capability is wired and unit-tested with a
 * mock transport; going live only needs credentials.
 *
 * SECURITY / CORS: distributor APIs require secret keys and do not allow
 * browser-direct calls. A production build must proxy these through a backend
 * (pass { baseUrl: "/api/pricing" }); the key never ships in the client bundle.
 * The adapters below are written against that proxy shape and are inert without
 * credentials, so nothing secret is embedded here.
 */

/** Wrap a PriceSource with an in-memory cache (per session). */
export function cached(source) {
  const map = new Map();
  return async (mpn) => {
    if (map.has(mpn)) return map.get(mpn);
    let q = null;
    try {
      q = await source(mpn);
    } catch {
      q = null;
    }
    map.set(mpn, q);
    return q;
  };
}

/** A fixed lookup table source (handy for tests and offline demos). */
export function tablePriceSource(table, sourceName = "table") {
  return async (mpn) => {
    const p = table[mpn];
    return typeof p === "number" ? { unitPrice: p, currency: "USD", stock: null, source: sourceName } : null;
  };
}

/**
 * Digikey-style adapter (through a backend proxy). Expects the proxy to accept
 * GET {baseUrl}?mpn=... and return { unitPrice, currency, stock } or 404.
 * Inert (returns null) when baseUrl is not configured.
 */
export function makeDigikeyPriceSource({ baseUrl, fetchImpl } = {}) {
  const doFetch = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
  return async (mpn) => {
    if (!baseUrl || !doFetch) return null;
    const res = await doFetch(`${baseUrl}?mpn=${encodeURIComponent(mpn)}`, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const d = await res.json();
    return typeof d.unitPrice === "number"
      ? { unitPrice: d.unitPrice, currency: d.currency || "USD", stock: d.stock ?? null, source: "digikey" }
      : null;
  };
}

/** Mouser-style adapter (same proxy contract, different source tag). */
export function makeMouserPriceSource({ baseUrl, fetchImpl } = {}) {
  const base = makeDigikeyPriceSource({ baseUrl, fetchImpl });
  return async (mpn) => {
    const q = await base(mpn);
    return q ? { ...q, source: "mouser" } : null;
  };
}

/**
 * Marketplace source: reads the multi-distributor proxy, which returns ALL
 * offers for a part plus the cheapest. The returned quote is the BEST offer, with
 * every distributor's offer attached as `offers` so the BOM can show the spread.
 * The proxy contract: GET {baseUrl}?mpn=... -> { best:{source,unitPrice,stock,
 * currency,link}, offers:[...], count }.
 */
export function makeMarketplaceSource({ baseUrl, fetchImpl } = {}) {
  const doFetch = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
  return async (mpn) => {
    if (!baseUrl || !doFetch) return null;
    const res = await doFetch(`${baseUrl}?mpn=${encodeURIComponent(mpn)}`, { headers: { accept: "application/json" } });
    if (!res.ok) return null;
    const d = await res.json();
    if (!d || !d.best || typeof d.best.unitPrice !== "number") return null;
    return {
      unitPrice: d.best.unitPrice,
      currency: d.best.currency || "USD",
      stock: d.best.stock ?? null,
      source: d.best.source,
      link: d.best.link || null,
      offers: Array.isArray(d.offers) ? d.offers : [],
    };
  };
}

/**
 * Enrich a static BOM (from buildBOM) with live prices. For each row, look up its
 * MPN; if a quote is found, replace the unit price and line total, else keep the
 * static values. Returns a NEW bom object with an added `priced` flag per row,
 * a `pricedAt` timestamp, and the recomputed total.
 * @param {{rows:Array, total:number}} bom
 * @param {(mpn:string)=>Promise<Object|null>} source
 */
export async function enrichBOMWithPricing(bom, source) {
  if (!bom || !source) return bom;
  const rows = await Promise.all(
    (bom.rows || []).map(async (r) => {
      const q = await source(r.mpn).catch(() => null);
      if (!q || typeof q.unitPrice !== "number") return { ...r, priced: false };
      return {
        ...r,
        unitPrice: q.unitPrice,
        lineTotal: +(q.unitPrice * r.qty).toFixed(4),
        stock: q.stock ?? null,
        priceSource: q.source,
        offers: Array.isArray(q.offers) ? q.offers : undefined,
        link: q.link || undefined,
        priced: true,
      };
    })
  );
  const total = +rows.reduce((s, r) => s + (r.lineTotal || 0), 0).toFixed(4);
  return { ...bom, rows, total, pricedAt: new Date().toISOString(), livePriced: rows.some((r) => r.priced) };
}
