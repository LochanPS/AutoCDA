/**
 * pricingProxy.js — tiny zero-dependency backend proxy for live BOM pricing.
 *
 * WHERE THE KEY GOES: this process reads MOUSER_API_KEY from its environment (or a
 * gitignored .env at the repo root). The key NEVER ships to the browser and is
 * NEVER committed. The client (src/design/distributorPricing.js) calls this proxy
 * at GET /api/pricing?mpn=... and gets back normalized { unitPrice, currency,
 * stock, mpn }. Browsers cannot call Mouser directly (CORS + secret), which is the
 * whole reason this proxy exists.
 *
 * Run:   MOUSER_API_KEY=xxxx node server/pricingProxy.js
 *   or put MOUSER_API_KEY=xxxx in .env and run `npm run pricing-proxy`.
 * Then point the client at it:  REACT_APP_PRICING_PROXY=http://localhost:3001/api/pricing
 *
 * Node 18+ only (uses the global fetch). No npm dependencies.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

// Minimal .env loader (no dotenv dependency): only sets vars not already present.
(function loadEnv() {
  try {
    const envPath = path.join(__dirname, "..", ".env");
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch { /* ignore */ }
})();

const PORT = process.env.PRICING_PROXY_PORT || 3001;
const MOUSER_KEY = process.env.MOUSER_API_KEY;
const MOUSER_URL = "https://api.mouser.com/api/v1/search/partnumber";

// Parse Mouser's "$0.10" / "0,10 €" style price strings into a float.
function parsePrice(s) {
  if (typeof s !== "string") return null;
  const m = s.replace(/\s/g, "").match(/([0-9]+(?:[.,][0-9]+)?)/);
  if (!m) return null;
  return parseFloat(m[1].replace(",", "."));
}
function parseStock(s) {
  if (typeof s !== "string") return null;
  const m = s.replace(/[,\s]/g, "").match(/([0-9]+)/);
  return m ? parseInt(m[1], 10) : null;
}

async function lookupMouser(mpn) {
  if (!MOUSER_KEY) throw new Error("MOUSER_API_KEY not set");
  const res = await fetch(`${MOUSER_URL}?apiKey=${encodeURIComponent(MOUSER_KEY)}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ SearchByPartRequest: { mouserPartNumber: mpn, partSearchOptions: "Exact" } }),
  });
  if (!res.ok) throw new Error(`Mouser HTTP ${res.status}`);
  const data = await res.json();
  const part = data?.SearchResults?.Parts?.[0];
  if (!part) return null;
  const breaks = (part.PriceBreaks || []).map((b) => ({ qty: b.Quantity, price: parsePrice(b.Price), currency: b.Currency || "USD" }))
    .filter((b) => b.price != null).sort((a, b) => a.qty - b.qty);
  if (!breaks.length) return null;
  return { unitPrice: breaks[0].price, currency: breaks[0].currency, stock: parseStock(part.Availability), mpn: part.ManufacturerPartNumber || mpn, source: "mouser" };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  // CORS: allow the local dev client to call this proxy.
  res.setHeader("Access-Control-Allow-Origin", process.env.PRICING_CORS_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (url.pathname !== "/api/pricing") { res.writeHead(404); res.end(JSON.stringify({ error: "not found" })); return; }
  const mpn = url.searchParams.get("mpn");
  if (!mpn) { res.writeHead(400); res.end(JSON.stringify({ error: "missing mpn" })); return; }

  try {
    const quote = await lookupMouser(mpn);
    if (!quote) { res.writeHead(404, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "no quote" })); return; }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(quote));
  } catch (e) {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: String(e.message || e) }));
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[pricingProxy] listening on http://localhost:${PORT}/api/pricing  (key ${MOUSER_KEY ? "loaded" : "MISSING — set MOUSER_API_KEY"})`);
});
