# AutoCDA pricing & tiers

A single key powers both Pro (in the app) and higher API limits — no accounts or
database. Pricing below is a **starting hypothesis**; adjust once real users react.

## Tiers

| | Free | Pro | API |
|---|---|---|---|
| **Price** | ₹0 | **₹299–999 / mo** (validate the exact point) | usage tiers (free anon + paid keys) |
| Describe → design → **SPICE-verify** | ✅ | ✅ | ✅ (`/api/verify`) |
| Schematic + reasoning trace | ✅ | ✅ | ✅ |
| BOM + **neutral multi-seller price compare** + Buy links | ✅ | ✅ | ✅ (in verify response) |
| Save designs (local history) | ✅ | ✅ | — |
| **Netlist import** | 🔒 | ✅ | — |
| **Build-a-chain** (multi-stage compositions) | 🔒 | ✅ | ✅ (`/api/compose`) |
| **Exports** (BOM CSV) | 🔒 | ✅ | — |
| **Tolerance / Monte-Carlo + optimization** | 🔒 | ✅ | — |
| API rate limit | anon (low) | — | keyed (higher, per-key) |

Core value — describe, design, **verify**, and compare parts — stays **free**, so the
product is genuinely useful (and shareable) without paying. Pro gates the power tools.

## How Pro works (MVP, no login/DB)

1. User pays via a hosted **Razorpay/Stripe Payment Link** (`REACT_APP_PRO_CHECKOUT_URL`).
2. You issue them a **key** — add it to the verify API's `API_KEYS` env (e.g.
   `API_KEYS=key_pro_abc=600`). (Manual at first; automate with a payment webhook later.)
3. They paste the key into **Get Pro → Unlock**. The app validates it against
   `{REACT_APP_VERIFY_API}/api/usage`; a `keyed`-tier response unlocks Pro features.
4. The **same key** raises their API limits — server-side enforcement is already in the
   verify API (anon vs keyed, per-key rate limits), so Pro API access needs no extra code.

## API usage tiers (already enforced server-side)

- **Anonymous (free):** low rate limit per IP (`ANON_RATE_LIMIT`, default 10/min).
- **Keyed:** higher per-key limit (`API_KEYS=key=limit`, default `KEYED_RATE_LIMIT`).
- Over-limit → `429` with `Retry-After`. Usage readable at `/api/usage`.

Suggested API packaging later: Free (anon) → Starter → Pro/Business keys with higher
limits, sold the same way (issue a key after payment).

## Pricing guidance

- Don't anchor on a number yet — **ask your first 10–20 interested users** what they'd
  pay. Start at the low end (₹299) to reduce friction; raise once value is proven.
- Education: a **per-department annual site license** is usually a better deal than
  per-seat for colleges.
- API: price on volume once you have a developer actually using it.
