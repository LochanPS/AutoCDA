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
CI=true npx react-scripts test        # 91 tests, 11 suites — no key, no wasm needed
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
