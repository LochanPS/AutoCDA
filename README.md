# AutoCDA — Automatic Circuit Design Assistant

Turn a plain-English request into a **buyable, SPICE-verified analog circuit**.
Type *"low-pass filter at 1 kHz"* (or *"two-stage amplifier gain 100 on E96, 2%
tolerance"*) and AutoCDA parses the intent, designs it from first principles,
picks real E-series parts, **verifies it in a real SPICE simulator running in your
browser**, and reports the honest measured-vs-target error — with a schematic,
frequency/transient response, bill of materials, and exports.

Every number shown is either derived from a stated design equation or measured by
the simulator. The two are labelled distinctly; nothing is faked.

---

## Use it from an AI agent (MCP) — one line

AutoCDA is also an **MCP server**: let Claude Desktop, Claude Code, Cursor, or any
MCP client verify a circuit mid-reasoning instead of guessing component values.

```bash
npx autocda-verify-mcp
```

Add it to an MCP client, e.g. Claude Desktop (`claude_desktop_config.json`):

```json
{ "mcpServers": { "autocda": { "command": "npx", "args": ["-y", "autocda-verify-mcp"] } } }
```

Then ask: *"design a 2 kHz low-pass within 2% and verify it."* The agent calls
`verify_circuit` and gets the real ngspice-measured result — value, honest error,
buyable BOM, and a reproducibility stamp. Tools: `verify_circuit`, `parse_prompt`,
`compose_circuit`, `list_circuit_types`.

Prefer HTTP? Run the same engine as a REST API (`npm run verify-api`) — see
[docs/API.md](docs/API.md), with a live playground at `/` and OpenAPI at
`/api/openapi.json`.

---

## Quick start

```bash
npm install
npm start
```

Opens at `http://localhost:3000`. Click an example, or describe a circuit in the
box. After a run, open the **Details** tab for the reasoning-loop trace, bill of
materials, and Monte-Carlo yield.

### Optional: live distributor pricing (Mouser)

The BOM uses a bundled catalog by default. For **live Mouser prices + stock**, run
the proxy with your Mouser Search API key (the key stays server-side, never in the
browser bundle):

PowerShell:
```powershell
$env:MOUSER_API_KEY="your_key"; npm run pricing-proxy
```
then, in the app terminal:
```powershell
$env:REACT_APP_PRICING_PROXY="http://localhost:3001/api/pricing"; npm start
```
bash:
```bash
MOUSER_API_KEY=your_key npm run pricing-proxy
REACT_APP_PRICING_PROXY=http://localhost:3001/api/pricing npm start
```
The BOM panel then shows a **Mouser live** badge with real unit prices and stock.

### Optional: AI-assisted parsing / AI-in-the-loop

With an Anthropic key set as `REACT_APP_ANTHROPIC_KEY`, hard-to-parse prompts fall
back to an LLM, and the confirm card exposes an **"AI in the loop"** toggle that
lets Claude choose each next component value from the live SPICE measurement.
Everything works fully **without** a key (a deterministic solver runs the same
loop).

---

## What it can design (19 circuit types, all SPICE-verified)

| Category | Types |
|---|---|
| **Passive filters** | RC low-pass, RC high-pass, band-pass |
| **Active filters** | Sallen-Key low-pass, Sallen-Key high-pass, 4th-order Butterworth low-pass |
| **Op-amp amps** | inverting, non-inverting, two-stage, summing, difference |
| **Op-amp math** | integrator, differentiator |
| **Discrete / power** | common-emitter, voltage divider, LED current limiter, zener regulator, constant current source |
| **Oscillator** | RC (Wien-bridge) |

You can state the circuit in natural language and set **tolerance** and
**E-series** in words too — e.g. *"high-pass filter 6kHz, 2% tolerance on E96"*.
Numbers accept SI prefixes, commas, and scientific notation (`1.5kHz`, `1,500 Hz`,
`1e3 Hz`, `20mA`, `9V to 3.3V`, `gain 50`).

---

## How it works

```
plain English
   │  parse        regex fast path, or optional LLM when unsure
   ▼
spec { type, targets, constraints }  →  confirm (editable card)
   ▼
design         closed-form equations → ideal component values
   ▼
snap           nearest buyable E-series part (E12 / E24 / E96)
   ▼
verify + refine  ngspice (WebAssembly) measures; a closed reasoning loop
                 proposes → grades in SPICE → re-proposes until within tolerance
   ▼
schematic · response plot · BOM · KiCad / EasyEDA / Falstad exports
```

The refinement is a real closed loop (propose → SPICE-grade → observe →
re-propose), with a precision ladder: coarse E-series → **E96 resistor trim** →
**joint two-component search** → **series/parallel resistor synthesis** for
sub-1% targets. The proposer is a deterministic log-domain secant solver by
default, or a real LLM when enabled. Full move-by-move trace is shown in Details.

---

## Verification API ("the SPICE-verified truth layer")

Any tool or LLM can POST a circuit intent and get back a verified, buyable design —
real values, the ngspice-measured result, honest error, netlist, and BOM. ngspice
runs server-side, so there's no per-call AI cost.

```bash
npm run verify-api        # starts http://localhost:3002
```

```
GET  /api/health                      -> { ok, types }
GET  /api/types                       -> [{ id, name, fields }]
POST /api/parse    { prompt }         -> { type, targets, constraints, confidence }
POST /api/verify   { prompt }  |  { type, targets, constraints?, strategy? }
                                      -> verified design + measured error + netlist + BOM
POST /api/compose  { stages: [{ type, targets }, ...] }
                                      -> cascaded multi-stage circuit, measured end to end
```

Example:
```bash
curl -s -X POST http://localhost:3002/api/verify \
  -H 'content-type: application/json' \
  -d '{"prompt":"low pass filter 2kHz on E96, 1% tolerance"}'
```

The **composition engine** chains the verified block library into larger circuits
(e.g. cascaded filter + amplifier), building one netlist that ngspice measures end
to end — the path from a fixed menu toward "any circuit".

## Exports

- **KiCad** simulation-ready schematic (`.kicad_sch`)
- **EasyEDA** JSON (→ Altium / KiCad / Gerber)
- **Falstad CircuitJS** live simulator (link + embedded)
- **Bill of materials** CSV (with live prices when the Mouser proxy is configured)

---

## Tests

```bash
npm test                              # 316 tests (Vitest) — no key, no wasm needed
```

In-browser dev hooks run the real-ngspice benchmarks (open the console):
`window.__designBench()`, `window.__reasoningLoop()`, `window.__yieldBench()`,
`window.__llmVsRegex()`.

---

## Project docs

- `FEATURES.md` — full capability reference
- `AUTOCDA_TECHNICAL_DOSSIER.txt` — system, dataset, evaluation, patentability, paper plan
- `RESEARCH.txt` — the evaluation study (parsing, yield, end-to-end, reasoning loop)
- `PAPER_DRAFT.txt` — workshop-paper draft
- `DESIGN.md` / `PRODUCT.md` — design system and product positioning

## Status & limits

Research-grade prototype / strong demonstrator. 19 fixed topologies (no arbitrary
schematic capture); BOM catalog is static unless the Mouser proxy is wired;
SPICE runs client-side in the browser. The `current_source` uses ngspice's basic
MOSFET model (verification, not device-accurate). Sub-0.5% tolerance uses
series/parallel synthesis and is not guaranteed for every target.

---

## Maintainer — publish & operate (runbook)

All commands run from the repo root. Copy-paste, no LLM needed.

### A. Publish the MCP package to npm

The published artifact is a single bundled file (`dist/mcp.mjs`, built
automatically by the `prepack` script via esbuild). First, get the tooling and
confirm the tarball is clean (should list **5 files**, ~44 kB):

```bash
npm install
npm pack --dry-run
```

npm now **requires 2FA (or a bypass token) to publish** — that was the `E403` you
hit. Pick ONE:

**Option 1 — 2FA + one-time code (simplest):**
1. On npmjs.com: avatar → **Account** → **Two-Factor Authentication** → enable
   **"Authorization and Publishing"** with an authenticator app (Google
   Authenticator, 1Password, etc.).
2. Publish, passing the 6-digit code from the app:
   ```bash
   npm publish --access public --otp=123456
   ```

**Option 2 — Granular access token (no code each time, good for CI):**
1. npmjs.com → avatar → **Access Tokens** → **Generate New Token** → **Granular
   Access Token**. Set **Packages and scopes = Read and write**, and enable
   **"Bypass 2FA"**. Copy the token (starts with `npm_`).
2. Publish with it:
   ```bash
   NPM_TOKEN=npm_xxx npm publish --access public \
     --//registry.npmjs.org/:_authToken=npm_xxx
   ```
   (Or `npm config set //registry.npmjs.org/:_authToken npm_xxx` once, then
   `npm publish --access public`.)

Verify it's live, then anyone installs it in one line:

```bash
npx -y autocda-verify-mcp
```

To ship an update later: bump the version and republish:

```bash
npm version patch   # 1.0.0 -> 1.0.1
npm publish --access public --otp=123456
```

### B. Render — turn on self-serve keys + keep-warm (one-time)

`render.yaml` already declares the new settings, but Render does **not** auto-apply
Blueprint env changes to an existing service — do this once in the dashboard:

1. Render dashboard → the **autocda-verify-api** service → **Environment**.
2. Click **"Sync"** if it offers to apply the Blueprint, **or** add these vars by
   hand:
   - `KEY_SIGNING_SECRET` → click **Generate** (any long random value) — enables
     `POST /api/keys`.
   - `KEEP_WARM_MS` → `600000`
   - `KEEP_WARM_URL` → `https://autocda-verify-api.onrender.com/api/health`
3. **Save** → the service redeploys. Confirm:
   ```bash
   curl -s -X POST https://autocda-verify-api.onrender.com/api/keys
   # → { "ok": true, "key": "ak_…", "tier": "keyed", ... }
   ```

Code changes (D3/D4, playground, benchmark) deploy automatically on every push to
`main` (`autoDeploy: true`).

### C. GitHub Actions — keep-warm backup (automatic)

`.github/workflows/keepwarm.yml` pings the API every ~10 min as a cold backup. It
runs automatically once on `main`. If Actions are disabled for the repo: GitHub →
repo **Settings** → **Actions** → **General** → allow actions. (GitHub pauses
scheduled workflows after 60 days of no repo activity — a push resumes them.)

### That's it

Nothing else is required. Optional, after publishing: list the package in public
MCP directories and post the `npx` one-liner. The Vercel web app needs no action —
it redeploys from `main` on its own.
