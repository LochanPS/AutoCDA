# AutoCDA Verification API

**The SPICE-verified truth layer for analog circuit design.** POST a plain-English
intent (or an explicit `{type, targets}`) and get back a **real-ngspice-verified,
buyable design**: the measured value, the honest measured-vs-target error, the
netlist, a priced BOM, richer measured metrics, the India landed cost, and a
reproducibility stamp — in one call. The engine is deterministic and runs
server-side, so there is **no per-call AI cost**.

- **Playground + live docs:** open the service root `/` in a browser.
- **Machine-readable spec:** `GET /api/openapi.json` (OpenAPI 3.0 — point Swagger,
  Postman, or an agent at it).
- **MCP (for AI agents):** `server/mcpServer.mjs` exposes the same verify/parse/
  compose as MCP tools — see [MCP](#mcp-for-ai-agents).

Run locally:

```bash
npm run verify-api          # http://localhost:3002
```

---

## Auth & rate limits

Send your key as `x-api-key: <key>` **or** `Authorization: Bearer <key>`.
No key = a free **anonymous** tier (low per-minute limit). An unknown key = `401`.

Every response past `/api/health` carries `x-ratelimit-limit`,
`x-ratelimit-remaining`, `x-ratelimit-reset`. Over the limit → `429` with
`retry-after`.

| Tier | How | Default limit |
|---|---|---|
| anonymous | no key | 10 / min |
| keyed | `x-api-key` | 120 / min (per key, configurable) |

**Get a key, self-serve** (when the instance has `KEY_SIGNING_SECRET` set):

```bash
curl -s -X POST http://localhost:3002/api/keys
# → { "key": "ak_…", "tier": "keyed", "limit": 120 }
```

Keys are **stateless HMAC-signed tokens** — the server validates them by
recomputing the signature, so there's no database and no sign-up form. Keep the
key; a lost key can't be recovered, just mint another. Then send it:
`-H "x-api-key: ak_…"`.

Server config is all environment variables (see the header of
`server/apiServer.mjs`): `API_KEYS`, `KEYED_RATE_LIMIT`, `ANON_RATE_LIMIT`,
`RATE_WINDOW_MS`, `CORS_ORIGIN`, `USAGE_FILE`, `KEEP_WARM_MS`.

---

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/` , `/playground` | Interactive playground (HTML) |
| GET | `/api` | Discovery: links + endpoint list |
| GET | `/api/openapi.json` | OpenAPI 3.0 spec |
| GET | `/api/health` | Liveness + type count (no auth, no limit) |
| GET | `/api/types` | Supported types + their target fields |
| GET | `/api/usage` | Your tier, limit, usage |
| POST | `/api/keys` | Mint a free keyed-tier key (if enabled) |
| POST | `/api/parse` | Intent → CircuitSpec (no simulation) |
| POST | `/api/verify` | Design + SPICE-verify (the main call) |
| POST | `/api/compose` | Cascade stages, measured end-to-end |

### `POST /api/verify`

Body — either a prompt **or** an explicit spec:

```jsonc
{ "prompt": "low pass filter at 2 kHz within 2%" }
// or
{ "type": "voltage_divider", "targets": { "Vin": 12, "Vout": 5 },
  "constraints": { "tolerance": 0.02, "eSeries": "E96" },
  "strategy": "reasoning",   // or "grid"
  "corners": false }          // true → also run temp/supply/process corners
```

Response (abridged):

```jsonc
{
  "ok": true,
  "type": "rc_lowpass",
  "name": "RC Low-Pass Filter",
  "targets": { "fc": 2000 },
  "verified": true,
  "targetName": "fc",
  "target": 2000,
  "measured": 1998.4,          // real ngspice measurement
  "errorPct": 0.0008,          // honest measured-vs-target
  "converged": true,           // within tolerance
  "iterations": 3,
  "eSeries": "E24",
  "tolerance": 0.02,
  "assumed": [],
  "components": [ { "ref": "R1", "value": "1 kΩ", "rawValue": 1000, "unit": "Ω" }, … ],
  "bom": { "rows": [ … ], "total": 0.042 },

  // ── D3: richer verification + sourcing in the same call ──
  "metrics": null,             // THD/amplitude (oscillators), line/load reg (regulators) when applicable
  "sourcing": {
    "bomUsd": 0.042,
    "indiaLandedINR": {        // parts + customs duty + GST + shipping + forex
      "parts": 3.57, "duty": 0.36, "gst": 0.71, "shipping": 600, "total": 604.64,
      "rate": { "usdToInr": 83.5, "dutyPct": 0.10, "gstPct": 0.18, … }
    }
  },
  "repro": {                   // auditable, re-runnable
    "engine": "ngspice (eecircuit-engine wasm)",
    "engineVersion": "1.8.0",
    "hashAlgo": "fnv1a32",
    "netlistHash": "a1b2c3d4"
  },
  "netlist": "* RC Low-Pass …",
  "trace": [ … ]               // the propose→grade→re-propose reasoning steps
}
```

`422` when the prompt can't be parsed or the spec is invalid (the body says why).

**Server-side LLM fallback.** When the regex parser is unsure *and* a key is set in
the server environment (`OPENROUTER_API_KEY`, or `REACT_APP_ANTHROPIC_KEY`),
`/api/verify` asks the LLM to resolve the intent — the key never leaves the server.
Opt out per request with `{ "llm": false }`. With no key, the endpoint is regex-only
(unchanged). The response's `via` field reports `"llm"` or `"regex"`.

### `POST /api/compose`

```jsonc
{ "stages": [
    { "type": "opamp_noninverting", "targets": { "Av": 5 } },
    { "type": "rc_lowpass", "targets": { "fc": 1000 } }
] }
```

Returns the cascaded netlist, the **end-to-end** measured value, a combined priced
BOM, `sourcing`, and a `repro` stamp.

### `POST /api/parse`

```jsonc
{ "prompt": "step 12V down to 5V" }
→ { "type": "voltage_divider", "targets": { "Vin": 12, "Vout": 5 },
    "confidence": 1, "assumed": [] }
```

---

## SDK snippets

**curl**

```bash
curl -s http://localhost:3002/api/verify \
  -H 'content-type: application/json' \
  -d '{"prompt":"low pass filter at 2 kHz within 2%"}'
```

**JavaScript** (`examples/verify.mjs`)

```js
const res = await fetch("http://localhost:3002/api/verify", {
  method: "POST",
  headers: { "content-type": "application/json" /*, "x-api-key": KEY */ },
  body: JSON.stringify({ prompt: "low pass filter at 2 kHz within 2%" }),
});
const d = await res.json();
console.log(d.converged ? "✓" : "≈", d.measured, `(${(d.errorPct * 100).toFixed(2)}%)`);
```

**Python** (`examples/verify.py`)

```python
import requests
d = requests.post("http://localhost:3002/api/verify",
                  json={"prompt": "low pass filter at 2 kHz within 2%"}).json()
print("✓" if d["converged"] else "≈", d["measured"], f'({d["errorPct"]*100:.2f}%)')
```

---

## MCP (for AI agents)

`server/mcpServer.mjs` exposes the same engine as MCP tools (`verify`, `parse`,
`compose`) so an agent can verify a circuit mid-reasoning instead of guessing
component values. Point your MCP client's command at:

```bash
node --import ./server/loader.mjs server/mcpServer.mjs
```

The verify tool returns the same verified payload documented above — the agent
proposes an intent, the simulator returns the measured truth.

---

## Why this exists

A raw LLM guesses component values and is confidently wrong. AutoCDA **proves**
them in ngspice and reports the honest error; every value snaps to a real E-series
part so the design is **buyable by construction**; same intent → same stamped
result. The API is the leverage: be the SPICE-verified endpoint any tool or agent
calls to stop hallucinating analog designs.
