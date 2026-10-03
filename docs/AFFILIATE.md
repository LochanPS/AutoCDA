# BOM distributor links & (optional) affiliate revenue

> **Reality check (verified Oct 2026):** Mouser, DigiKey and LCSC do **not** run
> open, self-serve affiliate programs for publishers — they offer marketplaces,
> developer APIs and corporate/educational referral programs instead. Real affiliate
> programs that fit electronic parts: **element14/Newark**, Amazon Associates,
> AliExpress. So affiliate is a **thin, partial, de-prioritised** stream here, not a
> revenue pillar. The real money is **Pro + API + education** (see GO_TO_MARKET.md).
> Pursue a direct **element14 partnership** by phone if you want distributor revenue.

AutoCDA's core value is a **neutral, multi-seller price comparison**, so the BOM
**never favours one distributor**: each part shows every seller's offer (cheapest
first) and you can buy from any of them. We only tag a link with a seller's *own*
referral where that seller has a program — which keeps the comparison unbiased.

## How it works

- Each BOM row has a **Buy ↗** link; a **Buy full BOM ↗** action downloads the
  CSV and opens the distributor's BOM importer.
- For **live-priced** rows, the link is the real product URL, **tagged with your
  affiliate ID server-side** in `server/pricingProxy.js` (`applyAffiliate`).
- For **catalog-fallback** rows (no live pricing), the link is a plain MPN
  **search** URL — still useful, just not tagged. The catalog fallback always works.
- Clicking any tagged link sets the distributor's **referral cookie**, so the
  whole cart (including a full-BOM upload) is attributed to you.

## Where the IDs go — server-side only, never in the bundle

Affiliate IDs are set as **environment variables** read by the pricing proxy.
They are never shipped to the browser and never committed. Per distributor, set
**one** of:

| Variable | Meaning | Example |
|---|---|---|
| `AFFILIATE_<SRC>` | query string appended to the product URL | `AFFILIATE_MOUSER="utm_source=aff&aff_id=12345"` |
| `AFFILIATE_<SRC>_TEMPLATE` | deep-link wrapper (`{url}` = the product URL) | `AFFILIATE_LCSC_TEMPLATE="https://click.linksynergy.com/deeplink?id=XXX&murl={url}"` |

`<SRC>` is the uppercased source tag: `MOUSER`, `DIGIKEY`, `LCSC`. Set these in
your host's dashboard (Render → Environment, or the pricing proxy's `.env`
locally). Leave blank → links pass through untagged.

## Registering for the programs

Affiliate mechanics differ per distributor — some give you a URL query param,
others run through a network (Impact, Rakuten/LinkSynergy, Partnerize) that gives
you a deep-link wrapper. Use the matching variable above.

- **Mouser** — Affiliate program via **Impact** (impact.com). Apply:
  mouser.com → footer → *Affiliate Program*. You receive tracking params /
  a deep-link; put them in `AFFILIATE_MOUSER` or `AFFILIATE_MOUSER_TEMPLATE`.
- **Digi-Key** — Affiliate/partner program (runs through an affiliate network).
  Apply: digikey.com → *Marketing/Affiliate Program*. Put the param or wrapper
  in `AFFILIATE_DIGIKEY` / `AFFILIATE_DIGIKEY_TEMPLATE`.
- **LCSC** — Affiliate/reseller program: lcsc.com → *Affiliate* / contact their
  partnerships team. Put the param or wrapper in `AFFILIATE_LCSC` /
  `AFFILIATE_LCSC_TEMPLATE`. (The LCSC *pricing* adapter itself is added in
  roadmap step 3.2; affiliate tagging is already wired for the `lcsc` source.)

> Check each program's current terms for how the link must be formed and any
> disclosure requirements. Buy links are marked `rel="sponsored nofollow"`.

## Verifying

Set a test value and confirm the proxy tags links:

```bash
AFFILIATE_MOUSER="utm_source=aff&aff_id=TEST" MOUSER_API_KEY=... node server/pricingProxy.js
curl "http://localhost:3001/api/pricing?mpn=<a-real-mpn>"
# → each offer.link ends with ...?...utm_source=aff&aff_id=TEST
```

Startup logs print which distributors have affiliate tagging configured.
