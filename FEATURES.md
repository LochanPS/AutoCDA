# AutoCDA — Product & Feature Reference

**AutoCDA turns a plain-English description of an analog circuit into a buyable,
simulator-verified design.** Type *"low-pass filter at 1 kHz"* and get real
E-series parts, an ngspice-measured error against your target, a schematic, the
frequency/transient response, a bill of materials, and one-click export to KiCad,
EasyEDA, and a live Falstad simulator.

The core promise is **trust by construction**: every number shown is either
derived from a stated design equation or measured by a real simulator, and the
interface never claims a verification it did not run.

This document is the complete capability map. For the evaluation/research behind
the numbers, see `RESEARCH.txt`. For the visual system, see `DESIGN.md`.

---

## 1. Supported circuits (22 types; representative set below)

| Type | Name | Design target(s) | SPICE-verified |
|---|---|---|---|
| `rc_lowpass` | RC Low-Pass Filter | `fc` (Hz) | yes |
| `rc_highpass` | RC High-Pass Filter | `fc` (Hz) | yes |
| `voltage_divider` | Voltage Divider | `Vin`, `Vout` (V) | yes |
| `led_limiter` | LED Current Limiter | `Vsupply` (V), `I` (A) | yes |
| `common_emitter` | Common-Emitter Amplifier | `Av` (gain) | yes |
| `band_pass` | Band-Pass Filter | `fL`, `fH` (Hz) | yes |
| `opamp_inverting` | Inverting Op-Amp | `Av` | yes |
| `opamp_noninverting` | Non-Inverting Op-Amp | `Av` | yes |
| `mfb_lowpass` | Multiple-Feedback Low-Pass (2nd order) | `fc` (Hz) | yes |
| `instrumentation_amp` | Instrumentation Amplifier (3 op-amp) | `Av` | yes |
| `current_mirror` | BJT Current Mirror | `I` (A) | yes |
| `zener_regulator` | Zener Voltage Regulator | `Vin`, `Vz` (V) | yes (transient) |
| `rc_oscillator` | RC Oscillator | `f` (Hz) | yes (transient + FFT) |

Every supported type is now SPICE-verified against a genuine measurement. The
last two — the oscillator and the shunt regulator — are verified in the **time
domain** (`src/sim/transient.js`): the Wien-bridge oscillator really starts and
sustains, and its frequency is read from the transient by **FFT** (parabolic-
interpolated) with a **zero-crossing** cross-check; the zener/shunt regulator
settles under load and its output (plus line/load regulation) is measured off the
same waveform. No type returns an un-measured analytical result any more.

---

## 2. The pipeline (what happens on each request)

```
plain English
   │  (1) UNDERSTAND     regex fast path, or optional LLM tool-call fallback
   ▼
CircuitSpec  { type, targets, constraints, confidence, assumed[] }
   │  (2) CONFIRM        spec card: what was understood + any assumptions
   ▼
   │  (3) DESIGN         closed-form equations → ideal component values
   ▼
   │  (4) SNAP           ideal → nearest buyable E-series part (E12/E24/E96)
   ▼
   │  (5) VERIFY+REFINE  ngspice-wasm measures; search improves the fit
   ▼
result: components + measured error + schematic + response + BOM + exports
```

Each stage is an isolated, testable module under `src/agents`, `src/design`,
`src/sim`. 66 automated tests cover them (no API key or wasm needed to run).

---

## 3. Feature detail

### 3.1 Natural-language understanding
- **Regex fast path** (`src/utils/circuitParser.js`): instant, offline, free.
  Handles canonical and many colloquial phrasings.
- **Optional LLM fallback** (`src/parse/llmParser.js`): when regex is unsure, a
  single Claude tool-call extracts `{type, targets, confidence}` against a
  constrained JSON schema (can only return a supported type, never an invented
  one). **Key-gated** — with no `REACT_APP_ANTHROPIC_KEY` the product runs fully
  on the regex path.
- **Deployed router**: trust regex when confidence ≥ 0.9, else call the LLM.
  Measured accuracy (n=106): regex 64.2% type accuracy, LLM 98.1%, router 99.1%
  (see `RESEARCH.txt`, Angle 1).
- **Assumptions surfaced**: anything inferred (e.g. a default rail voltage) is
  recorded in `spec.assumed` and shown on the confirmation card, never hidden.

### 3.2 Design engine (closed-form)
- Per-type governing equations (`src/utils/circuitFormulas.js`) compute ideal
  component values from the targets.
- Bias-aware where it matters — e.g. the common-emitter stage is designed around
  a mid-rail operating point instead of a naive `Av = RC/RE`, which previously
  drove it into saturation (fixed; ~98% → ~4% error).

### 3.3 Manufacturability — E-series snapping
- Real parts exist only at IEC 60063 preferred values. Every passive is snapped
  to the nearest **E12 / E24 / E96** value in log space (`src/design/eseries.js`).
- Snapping introduces genuine, honest error — which the SPICE stage then measures.

### 3.4 Real simulation & honest error
- **In-browser ngspice** via `eecircuit-engine` (WebAssembly) — no backend, fully
  client-side (`src/sim/spice.js`).
- Measures the actual scalar (−3 dB cutoff, mid-band gain, DC current/voltage,
  band-pass center) and reports **measured-vs-target error**.
- Results are labeled: **analytical** vs **SPICE-verified**. The tool never shows
  a verification badge for a measurement it did not run.

### 3.5 Refinement — two strategies
- **Grid search** (default, `RefineAgent`): sweeps a fixed E-series neighbourhood
  of the snapped value, keeps the lowest measured error. Deterministic, bounded.
- **Closed-loop reasoning agent** (`ReasoningAgent`, opt-in): a real
  *propose → SPICE-grade → observe → re-propose* loop. The next candidate is
  **decided from simulator feedback**, not enumerated.
  - Deterministic `secantProposer` (log-log Newton/secant step; no key), or
  - `llmReasoningProposer` — a real Claude tool-call in the loop (key-gated).
  - **Two-phase precision**: coarse dominant on E24, then an **E96 resistor trim**
    when a tighter tolerance is requested (resistors are the honest place to buy
    1% precision; capacitors are not made that finely, so RC/band-pass trim R1).
  - Every proposal snapped to a buyable part; the full move-by-move rationale is
    traced and auditable.
  - **Robustness** (swept over all 8 verifiable types, `reasoningStress.test.js`):
    100% convergence at the product's 5% tolerance from any seed (even 64× off);
    100% at 2% via the E96 trim; ~89% at 1% with every miss still under 2% (the
    single-standard-part granularity floor).
  - Wired via `orchestrate(spec, { strategy: "reasoning" })`; **off by default**
    because the closed-form seed already makes grid near-optimal for these types.

### 3.6 Yield & tolerance analysis
- **Monte-Carlo tolerance sweep** (`src/design/montecarlo.js`): runs the design
  through real ngspice with randomized part tolerances to estimate true yield.
- **Yield-aware selection** (`src/design/yieldAware.js`): picks parts for yield,
  not just nominal-nearest — graded by an *independent* Monte-Carlo run so the
  grader is not the thing being optimized (see `RESEARCH.txt`, Angle 2).

### 3.7 Bill of materials & cost
- `buildBOM(components)` maps each part to an orderable line with a placeholder
  MPN and small-quantity unit price; totals the design (`src/design/bom.js`).
- CSV export (`buildBomCsv`). The static catalog is swappable for a live
  Digikey/Mouser lookup without changing callers.

### 3.8 Exports & interop
- **KiCad** simulation-ready schematic (`.kicad_sch`) with net labels, ground
  symbols, and ngspice sim directives (`src/utils/kicadExport.js`).
- **EasyEDA** JSON (import → Altium/KiCad/Gerber) (`src/utils/easyedaschema.js`).
- **Falstad CircuitJS** URL + embeddable live simulator, LZString-encoded exactly
  as Falstad expects (`src/utils/circuitjs.js`).

### 3.9 Interface
- **Conversation** (`ChatPanel`) — describe, confirm, read a calm result.
- **Spec card** (`SpecCard`) — the understood spec + assumptions, to confirm.
- **Processing log** (`ProcessingLog`) — the live design/verify/refine trace.
- **Schematic** (`SchematicPanel`) — inline SVG, one 1.5px line-icon set.
- **Response graph** (`GraphPanel`) — frequency or transient plot (Recharts).
- **Component table** (`ComponentTable`) — values, refs, measured error.
- **Explanation** (`ExplanationPanel`) — the equations + export buttons.
- **Live simulator** (`CircuitJSPanel`) — editable Falstad embed.
- **Design system** (`DESIGN.md`) — Inter + JetBrains Mono for machine values,
  restrained indigo accent, WCAG-AA contrast, reduced-motion aware.

---

## 4. Where AI actually sits (honest scope)

AutoCDA is at its core a **deterministic circuit synthesizer** — the correct
choice for hardware (reproducible, bounded, every number derived or measured).
AI is **optional and confined to two points**, both key-gated; the whole product
runs without a key:

1. **Language front-end** — the LLM parser turns messy English into a spec.
2. **AI-in-the-loop refinement** — the `llmReasoningProposer` can drive the
   closed loop's next-value decision (off by default).

Stages 3–5 (design, snapping, SPICE verify/refine, yield, BOM) are pure
deterministic engineering with no AI. Accurate one-liner: *a formula + SPICE
circuit synthesizer with an LLM natural-language front-end and an optional
AI-in-the-loop refinement mode* — not "an AI that designs circuits."

---

## 5. Trust guarantees

- Every displayed number is **derived from a stated equation** or **measured by
  ngspice** — nothing is estimated and shown as fact.
- **Analytical vs SPICE-verified** results are labeled distinctly.
- The **refine trace and netlist are shown**, not hidden — the work is a feature.
- Inferred values are **flagged as assumptions**.
- The product is **fully functional offline** (no API key).

---

## 6. Known limits & roadmap

- **Sub-1% tolerance** is reached via **series/parallel part synthesis** — the loop
  realizes a trim resistor on E96 (and, for capacitor-dominant blocks, the cap on
  E24) as two standard parts whose equivalent value beats the single-part floor
  (`synthesizeResistor` / `synthesizeCapacitor` in `src/design/eseries.js`); the BOM
  lists both parts and the honest measured error.
- **Richer measured metrics** (`src/sim/metrics.js`, `src/sim/transient.js`):
  oscillator amplitude (Vpp/RMS) + THD and regulator line/load regulation are
  measured and surfaced today; settling time, slew rate, overshoot, rise time,
  phase/gain margin, output impedance and PSRR analyzers ship ready to wire when
  non-ideal device models land.
- **Corner & environment analysis** (`src/design/corners.js`): every verified
  design is re-measured at temperature, supply, and process corners — "verified
  across conditions," not just nominal — complementing the random Monte-Carlo sweep.
- **Reproducibility stamp** (`src/sim/repro.js`): each result carries the engine
  version + a hash of the exact verified netlist, so a result is auditable and
  re-runnable.
- **BOM pricing** uses a bundled static catalog; a live distributor API is the
  drop-in upgrade.
- **SPICE aggregates** (yield, end-to-end design benchmark) run via in-browser dev
  hooks (`window.__yieldBench()`, `window.__designBench()`,
  `window.__reasoningLoop()`) because the wasm engine loads in the browser only;
  the pure logic is covered in CI.
- The reasoning agent tunes at most two components (dominant + one trim);
  multi-component joint proposal is the path to circuits with no closed-form seed.
