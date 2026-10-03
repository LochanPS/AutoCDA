/**
 * pricingProxy.js — zero-dependency backend proxy for a multi-distributor BOM
 * price marketplace.
 *
 * For a given manufacturer part number it queries every distributor it has
 * credentials for (Mouser, Digi-Key), normalizes each to {source, unitPrice,
 * currency, stock}, and returns ALL offers plus the cheapest (best). The client
 * BOM then sources each part at its lowest price and shows the comparison.
 *
 * WHERE THE KEYS GO: this process reads credentials from its environment (or a
 * gitignored .env). They NEVER ship to the browser and are NEVER committed.
 * Browsers cannot call these APIs directly (CORS + secret), which is why this
 * proxy exists. Any distributor with no credentials is simply skipped.
 *
 *   MOUSER_API_KEY=...            (mouser.com/api-hub — single Search API key)
 *   DIGIKEY_CLIENT_ID=...         (developer.digikey.com — OAuth2 client creds)
 *   DIGIKEY_CLIENT_SECRET=...
 *
 * Run:  node server/pricingProxy.js   (Node 18+, uses global fetch)
 * API:  GET /api/pricing?mpn=...  ->  { mpn, offers:[...], best:{...}, count }
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

// Minimal .env loader (no dotenv dependency).
(function loadEnv() {
  try {
    const envPath = path.join(__dirname, "..", ".env");
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* ignore */ }
})();

const PORT = process.env.PRICING_PROXY_PORT || 3001;

// ── affiliate link tagging (SERVER-SIDE ONLY — IDs never reach the browser) ─────
// Per distributor, configure ONE of:
//   AFFILIATE_<SRC>           query string appended to the product URL,
//                             e.g. AFFILIATE_MOUSER="utm_source=aff&aff_id=12345"
//   AFFILIATE_<SRC>_TEMPLATE  deep-link wrapper with a {url} placeholder (affiliate
//                             networks), e.g. "https://click.net/deep?u={url}"
// <SRC> is the uppercased source tag: MOUSER, DIGIKEY, LCSC, ...
// With neither set for a source, its links pass through untouched.
function applyAffiliate(source, link) {
  if (!link || typeof link !== "string") return link;
  const key = String(source || "").toUpperCase();
  const template = process.env[`AFFILIATE_${key}_TEMPLATE`];
  if (template && template.includes("{url}")) {
    return template.replace("{url}", encodeURIComponent(link));
  }
  const params = process.env[`AFFILIATE_${key}`];
  if (params) {
    const sep = link.includes("?") ? "&" : "?";
    return link + sep + params.replace(/^[?&]/, "");
  }
  return link;
}

// ── parsing helpers ───────────────────────────────────────────────────────────
function parsePrice(s) {
  if (typeof s === "number") return s;
  if (typeof s !== "string") return null;
  const m = s.replace(/\s/g, "").match(/([0-9]+(?:[.,][0-9]+)?)/);
  return m ? parseFloat(m[1].replace(",", ".")) : null;
}
function parseStock(s) {
  if (typeof s === "number") return s;
  if (typeof s !== "string") return null;
  const m = s.replace(/[,\s]/g, "").match(/([0-9]+)/);
  return m ? parseInt(m[1], 10) : null;
}
const lowestBreak = (breaks) =>
  (breaks || [])
    .map((b) => ({ qty: b.qty ?? b.Quantity ?? b.BreakQuantity, price: parsePrice(b.price ?? b.Price ?? b.UnitPrice), currency: b.currency || b.Currency || "USD" }))
    .filter((b) => b.price != null)
    .sort((a, b) => (a.qty || 0) - (b.qty || 0))[0] || null;

// ── Mouser ────────────────────────────────────────────────────────────────────
async function lookupMouser(mpn) {
  const key = process.env.MOUSER_API_KEY;
  if (!key) return null;
  const res = await fetch(`https://api.mouser.com/api/v1/search/partnumber?apiKey=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ SearchByPartRequest: { mouserPartNumber: mpn, partSearchOptions: "Exact" } }),
  });
  if (!res.ok) throw new Error(`Mouser HTTP ${res.status}`);
  const data = await res.json();
  const part = data?.SearchResults?.Parts?.[0];
  if (!part) return null;
  const b = lowestBreak(part.PriceBreaks);
  if (!b) return null;
  return { source: "mouser", unitPrice: b.price, currency: b.currency, stock: parseStock(part.Availability), link: part.ProductDetailUrl || null };
}

// ── Digi-Key (OAuth2 client credentials + Product Information v4) ──────────────
let _dkToken = { value: null, exp: 0 };
async function digikeyToken() {
  const id = process.env.DIGIKEY_CLIENT_ID;
  const secret = process.env.DIGIKEY_CLIENT_SECRET;
  if (!id || !secret) return null;
  if (_dkToken.value && Date.now() < _dkToken.exp) return _dkToken.value;
  const res = await fetch("https://api.digikey.com/v1/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: `grant_type=client_credentials&client_id=${encodeURIComponent(id)}&client_secret=${encodeURIComponent(secret)}`,
  });
  if (!res.ok) throw new Error(`Digi-Key token HTTP ${res.status}`);
  const d = await res.json();
  _dkToken = { value: d.access_token, exp: Date.now() + (d.expires_in - 60) * 1000 };
  return _dkToken.value;
}
async function lookupDigikey(mpn) {
  const token = await digikeyToken();
  if (!token) return null;
  const res = await fetch(`https://api.digikey.com/products/v4/search/${encodeURIComponent(mpn)}/productdetails`, {
    headers: { Authorization: `Bearer ${token}`, "X-DIGIKEY-Client-Id": process.env.DIGIKEY_CLIENT_ID, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Digi-Key HTTP ${res.status}`);
  const d = await res.json();
  const p = d?.Product;
  if (!p) return null;
  const breaks = (p.ProductVariations?.[0]?.StandardPricing) || p.StandardPricing;
  const b = lowestBreak(breaks);
  if (!b) return null;
  return { source: "digikey", unitPrice: b.price, currency: b.currency || "USD", stock: parseStock(p.QuantityAvailable), link: p.ProductUrl || null };
}

// ── aggregate ─────────────────────────────────────────────────────────────────
async function lookupAll(mpn) {
  const results = await Promise.allSettled([lookupMouser(mpn), lookupDigikey(mpn)]);
  const offers = results
    .filter((r) => r.status === "fulfilled" && r.value)
    .map((r) => ({ ...r.value, link: applyAffiliate(r.value.source, r.value.link) }));
  offers.sort((a, b) => a.unitPrice - b.unitPrice);
  return { mpn, offers, best: offers[0] || null, count: offers.length };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  res.setHeader("Access-Control-Allow-Origin", process.env.PRICING_CORS_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  if (url.pathname !== "/api/pricing") { res.writeHead(404); res.end(JSON.stringify({ error: "not found" })); return; }
  const mpn = url.searchParams.get("mpn");
  if (!mpn) { res.writeHead(400); res.end(JSON.stringify({ error: "missing mpn" })); return; }
  try {
    const out = await lookupAll(mpn);
    res.writeHead(out.best ? 200 : 404, { "content-type": "application/json" });
    res.end(JSON.stringify(out.best ? out : { ...out, error: "no offers" }));
  } catch (e) {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
});

server.listen(PORT, () => {
  const dists = [process.env.MOUSER_API_KEY && "Mouser", (process.env.DIGIKEY_CLIENT_ID && process.env.DIGIKEY_CLIENT_SECRET) && "Digi-Key"].filter(Boolean);
  const aff = ["MOUSER", "DIGIKEY", "LCSC"].filter((k) => process.env[`AFFILIATE_${k}`] || process.env[`AFFILIATE_${k}_TEMPLATE`]);
  // eslint-disable-next-line no-console
  console.log(`[pricingProxy] http://localhost:${PORT}/api/pricing — distributors: ${dists.length ? dists.join(", ") : "NONE (set MOUSER_API_KEY / DIGIKEY_CLIENT_ID+SECRET)"}`);
  // eslint-disable-next-line no-console
  console.log(`[pricingProxy] affiliate tagging: ${aff.length ? aff.join(", ") : "none configured (set AFFILIATE_MOUSER / AFFILIATE_DIGIKEY / ...)"}`);
});
