# AutoCDA — Build Roadmap & Agent Prompts

Goal: turn the template-picker demo into a predictable, real-simulation, self-correcting
analog design tool — the agentic verification loop that can become a company.

**Core architecture principle (read once, applies everywhere):**
- One typed `CircuitSpec` is the spine — parser output = user-confirmed input = design input = verification target.
- **LLM lives only at the edges** (parse intent in, explain result out). The numeric design→simulate→verify loop is 100% deterministic. Never put an LLM in the numeric loop.
- Real SPICE (ngspice-wasm) replaces the current self-referential "verification" that always reports 0.0%.

Each step below has a **paste-ready prompt** for a coding agent. Prompts are self-contained
(assume the agent starts cold). Do the phases in order — later steps depend on earlier ones.

---

## Phase overview

| Phase | Outcome | Depends on |
|-------|---------|-----------|
| 0. Foundation | Typed `CircuitSpec` + confirm-before-run card. Predictability without any ML. | — |
| 1. Correctness | Fix 5 wrong schematics, the CircuitJS bad connection, remove fake verify. | 0 |
| 2. Real loop | ngspice-wasm + E-series snapping + deterministic refine loop. The novelty. | 0, 1 |
| 3. LLM parser | Structured-output LLM fallback behind the regex fast-path. Kills brittleness. | 0 |
| 4. Product | Real parts/BOM + pricing, Monte-Carlo tolerance sweep, agent framing. | 2 |
| 5. Scale | Server ngspice, PCB layout + quantum-inspired annealing. Company-scale. | 4 |

Ship 0→1→2 first. That alone = "predictable tool that proves its answer with a real simulator" — a seed-stage demo.

---

## Phase 0 — Foundation: typed spec + confirm-before-run

### Step 0.1 — Define `CircuitSpec` type + factory

**Prompt:**
```
In the AutoCDA React app (src/), create a new module src/spec/circuitSpec.js that defines
the canonical CircuitSpec object — the single data structure every other part of the app
will use. It must have this shape:

  {
    type: string,          // one of the supported circuit ids: rc_lowpass, rc_highpass,
                           //   voltage_divider, led_limiter, common_emitter, band_pass,
                           //   opamp_inverting, opamp_noninverting, zener_regulator, rc_oscillator
    targets: {},           // the design goals, e.g. { fc: 2000 } or { vin: 12, vout: 5 }
    constraints: {         // defaults: tolerance 0.05, eSeries "E24"
      tolerance: 0.05,
      eSeries: "E24",
      maxCost: null
    },
    confidence: 0..1,      // how sure the parser is
    assumed: []            // human-readable strings for any value that was defaulted, e.g.
                           //   "Vin defaulted to 12 V (not found in prompt)"
  }

Export:
- SUPPORTED_TYPES: array of the 10 ids above, each with a display name and the list of
  target field keys it needs (e.g. rc_lowpass -> ["fc"], voltage_divider -> ["vin","vout"]).
  Source the required fields from the existing extract() logic in src/utils/circuitParser.js.
- makeSpec(partial): returns a full CircuitSpec, filling constraints defaults and validating
  that type is in SUPPORTED_TYPES.
- validateSpec(spec): returns { ok: boolean, errors: string[] }. Error if type unknown or a
  required target field is missing/NaN.

Pure module, no React, no side effects. Add a short JSDoc block at top. Do not change any
other file in this step.
```

### Step 0.2 — Refactor parser to emit `CircuitSpec` (no more silent defaults)

**Prompt:**
```
Refactor src/utils/circuitParser.js so parsePrompt(text) returns a CircuitSpec object
(from src/spec/circuitSpec.js, makeSpec/SUPPORTED_TYPES), not the current
{ circuitId, params, matched } shape.

Requirements:
- Keep the existing regex extractors (extractFrequency/Voltage/Current/Gain) and the
  CIRCUIT_PATTERNS keyword tables — they are the fast path.
- CRITICAL FIX — no silent defaults: when a required target value is NOT found in the text
  and a default is used, push an explicit human-readable string into spec.assumed, e.g.
  "fc defaulted to 1 kHz (not found in prompt)". The current code silently merges
  pattern.defaults; make every such fallback visible in assumed[].
- confidence: 1.0 when a keyword matched AND all required targets were extracted from text;
  0.6 when keyword matched but one or more targets were defaulted; 0.0 when no keyword matched
  (return a spec with type:null, confidence:0).
- Keep first-keyword-match ordering but move the broad/greedy patterns (bare 'amp ',
  generic 'amplifier', 'divider') to the END of CIRCUIT_PATTERNS so specific circuits
  (common_emitter, opamp_*) win over generic ones. Add a comment explaining the ordering matters.
- Update every caller (grep for parsePrompt across src/, esp. src/App.jsx) to the new return
  shape. In App.jsx, map spec.type -> circuitId and spec.targets -> the params object that
  calculateCircuit() currently expects, so the existing formula engine keeps working unchanged.

Run `npm start`, confirm all 5 documented circuits still generate. Report any caller you changed.
```

### Step 0.3 — Confirm-before-run editable spec card

**Prompt:**
```
Add a "confirm before run" step to the AutoCDA flow. Today src/App.jsx (runCircuit / the
submit handler) parses the prompt and immediately runs the circuit. Change it so:

1. On submit, parsePrompt(text) produces a CircuitSpec (see src/spec/circuitSpec.js).
2. If spec.confidence === 0 (no match): show an inline message "Couldn't identify a circuit.
   Try: 'low pass filter 2kHz'." plus buttons for the 10 supported types. Do NOT run anything.
3. Otherwise render a new component src/components/SpecCard.jsx that shows the parsed spec as
   an EDITABLE form BEFORE running:
      - Circuit type (dropdown, SUPPORTED_TYPES)
      - One numeric input per required target field, pre-filled from spec.targets
      - tolerance and eSeries (E12/E24/E96) selectors
      - If spec.assumed is non-empty, show each assumption as a small amber note
        ("⚠ Vin defaulted to 12 V") so the user sees every guess.
      - Buttons: [Run ▶]  [Cancel]
4. Only when the user clicks Run does the existing design/simulate path fire, using the
   (possibly edited) spec. Editing a field updates the spec via makeSpec/validateSpec;
   disable Run while validateSpec(spec).ok is false and show the errors.

Keep styling consistent with the existing dark theme in src/App.css (reuse the panel/box
classes already there). This step must not change the formula engine. Verify: typing
"voltage divider" with no numbers now shows the card with an amber "defaulted to 12→5V" note
instead of silently running.
```

---

## Phase 1 — Correctness fixes

### Step 1.1 — Fix the 5 wrong schematics

**Prompt:**
```
Bug: in src/utils/circuitFormulas.js, five circuits reuse the RC low-pass schematic image.
Confirm by grepping for "/schematics/rc_lowpass.svg" — band_pass, opamp_inverting,
opamp_noninverting, zener_regulator, and rc_oscillator all point at it, so e.g. a Zener
regulator renders an RC filter. Fix so each circuit shows its own correct schematic.

For each of the five, generate an accurate inline SVG schematic (the app already has an inline-SVG
fallback path — see src/components/SchematicPanel.jsx and generate_schematics.py for the drawing
style/conventions used). Match the existing visual style (stroke widths, component glyphs, labels).
Each schematic must show the real topology:
- band_pass: RC high-pass stage followed by RC low-pass stage
- opamp_inverting: op-amp with Rin to inverting input, Rf feedback, + input to ground
- opamp_noninverting: op-amp, signal to + input, Rf/Rg divider on - input
- zener_regulator: series R from Vin, zener diode to ground at output node, load
- rc_oscillator: Wien-bridge op-amp oscillator (RC series + RC parallel + gain network)

Wire each into the same schematic mechanism the working 5 circuits use. Verify each renders
its own correct diagram, not the RC low-pass. If the app uses static SVG files under
public/schematics/, add the 5 new files there and update the schematic path in circuitFormulas.js.
```

### Step 1.2 — Fix CircuitJS "1 bad connection" on common-emitter

**Prompt:**
```
The CircuitJS live simulator reports "1 bad connection" for the common_emitter circuit
(visible bottom-left of the CircuitJS panel when running "common emitter amplifier gain 20").
The generated CircuitJS netlist has a floating/unterminated node.

Look at src/utils/circuitjs.js — find the common_emitter netlist generation. CircuitJS uses a
text netlist format where each line is a component with two node coordinates. Trace the nodes:
every node must connect to >=2 components (or be ground). Find the dangling node (likely a
missing wire between the collector/emitter/bias network and the rest, or a missing ground on
the emitter resistor/bypass cap). Add the missing wire/connection.

Verify by running the circuit and confirming the "1 bad connection" text is gone and the scope
shows a stable amplified waveform. Check the other 4 circuits still show 0 bad connections.
```

### Step 1.3 — Stop the fake self-referential "verification"

**Prompt:**
```
Honesty fix. Right now the app always reports "Simulation Passed — Error: 0.0%" because the
formula engine computes the answer and then "verifies" the answer equals itself — there is no
independent simulation. Find where this 0.0% / "Verification passed" text and the
processingSteps are generated (search src/utils/circuitFormulas.js and the ProcessingLog usage
in src/App.jsx).

Until real SPICE lands (Phase 2), change the wording so it does NOT claim a simulation was run:
replace "Simulation Passed — Error 0.0%" and "Ngspice simulation running..." with honest labels
like "Computed from design equations (analytical)" and a badge "Analytical — not yet SPICE-verified".
Keep the processing-log animation. Add a TODO comment pointing to Phase 2 (ngspice-wasm) where the
real measured-vs-target error will replace this. Do not fabricate an error percentage.
```

---

## Phase 2 — The real loop (ngspice-wasm) — the novelty

### Step 2.1 — Integrate ngspice-wasm and run a netlist

**Prompt:**
```
Add real SPICE simulation to the AutoCDA React app using an in-browser ngspice WebAssembly
engine (evaluate the npm package "eecircuit-engine", which wraps ngspice as wasm; if it doesn't
fit, find an equivalent ngspice-wasm/Spice3 wasm build). No backend server — must run fully
client-side.

Create src/sim/spice.js exposing an async API:
  - initSpice(): loads the wasm engine once, cached.
  - runSpice(netlist: string): runs the netlist, returns parsed results as
    { nodes: {name: number[]}, sweep: number[], raw: string } for AC/DC/tran as appropriate.
  - Helper analyzers:
      measureCutoff(result): -3dB frequency from an AC sweep
      measureGain(result, inNode, outNode): mid-band gain
      measureDC(result, node): DC node voltage

The app already generates SPICE netlists (the netlist field in each circuit object in
src/utils/circuitFormulas.js — see e.g. the opamp netlists). Feed those real netlists to runSpice.
Handle wasm load latency with a loading state. Add a dev-only test: run the rc_lowpass netlist for
fc=1kHz and console.log the measured -3dB point; confirm it lands near 1 kHz. Report the measured value.
```

### Step 2.2 — E-series component snapping

**Prompt:**
```
Create src/design/eseries.js. Real resistors/capacitors only come in standard values
(E12/E24/E96 series). This module snaps ideal computed values to buyable ones — the step that
introduces genuine (honest) error the simulator will then measure.

Export:
  - E12, E24, E96: the standard mantissa arrays.
  - snap(value, series="E24"): nearest standard value (correct decade).
  - neighbors(value, series, k=2): the k nearest standard values above and below (for the
    refine search in Step 2.3).
  - format helpers reusing the existing formatResistance/formatCapacitance from
    src/utils/circuitFormulas.js.

Pure module, unit-test the snapping with a few known cases (e.g. snap(1234, "E24") -> 1200).
```

### Step 2.3 — Deterministic design → snap → simulate → verify → refine loop

**Prompt:**
```
This is the core agentic verification loop. Create src/design/loop.js exporting
async designAndVerify(spec, { runSpice }) that returns:
  { components, measured, targets, errorPct, iterations, converged, trace }

Algorithm (fully deterministic — NO LLM in this loop):
  1. Ideal design: call the existing formula engine (calculateCircuit in circuitFormulas.js)
     with spec.targets to get ideal component values.
  2. Snap every R and C to spec.constraints.eSeries using src/design/eseries.js.
  3. Build the SPICE netlist with the snapped values and run it via runSpice (src/sim/spice.js).
  4. Measure the spec's key target (cutoff/gain/DC) from the sim result.
  5. errorPct = |measured - target| / target. If errorPct <= spec.constraints.tolerance -> done.
  6. Else: for the dominant component, try its E-series neighbors() (Step 2.2), re-simulate each,
     keep the one with lowest errorPct (local search). Record each attempt in trace.
  7. Bounded: max 5 iterations. Always return the best-found result with converged flag.

Guarantees to preserve: bounded iterations (always terminates), honest errorPct from REAL sim
(never self-referential), deterministic (same spec -> same result). Add a comment block stating
these three guarantees. Wire this into App.jsx to replace the old direct calculateCircuit call
once the user clicks Run on the SpecCard.
```

### Step 2.4 — Honest verification report UI

**Prompt:**
```
Replace the old always-0.0% badge with a real verification report driven by designAndVerify()
output (src/design/loop.js). Create/extend a component that shows:
  - Result badge: "✓ Verified in SPICE — 1.8% error (E24, 2 iterations)" or
    "△ Best effort — 6.1% error, tolerance 5% not met in 5 iterations".
  - Measured vs target table (target fc/gain/vout vs SPICE-measured).
  - The refine trace: each iteration's component value tried and its error, so the loop is
    transparent (this transparency is a selling point — show the work).
  - The final buyable component list with E-series values and standard part designators.

Keep the existing dark theme. This replaces the Phase 1.3 "analytical" placeholder for any
circuit that now runs through the real loop.
```

---

## Phase 3 — LLM parser fallback

### Step 3.1 — Structured-output LLM parser behind the fast path

**Prompt:**
```
Add an LLM fallback to the parser so arbitrary phrasings work, while keeping the regex fast path.
Create src/parse/llmParser.js exporting async parseWithLLM(text) that returns a CircuitSpec
(src/spec/circuitSpec.js).

- Use the Anthropic Messages API with tool-calling / structured JSON output. Constrain the model
  to return ONLY: { type: <enum of the 10 SUPPORTED_TYPES>, targets: {...}, confidence: 0..1 }.
  The enum constraint means it cannot invent an unsupported circuit.
- Read the API key from an env var (process.env.REACT_APP_ANTHROPIC_KEY); if absent, parseWithLLM
  throws a clear "LLM parser unavailable (no key)" error so the app can fall back gracefully.
- Use the current model id claude-sonnet-5 (or the latest Sonnet). Keep the system prompt short:
  "You extract analog circuit design intent. Output only the structured fields."
- Map the LLM's returned fields through makeSpec() so defaults/validation are applied uniformly,
  and set assumed[] for anything the model left null.

Do not call the LLM yet from the main flow — just build and unit-test this module with a few
tricky phrasings ("step 9 volts down to about 3v3", "I need roughly 40x voltage boost").
```

### Step 3.2 — Confidence routing + graceful offline fallback

**Prompt:**
```
Wire the LLM parser into the flow with graceful degradation. In the submit handler:
  1. Run the existing regex parsePrompt(text) first (instant, offline).
  2. If its spec.confidence >= 0.9, use it directly (fast path, no API call).
  3. Else, if the LLM key is present, call parseWithLLM(text) and use its result.
  4. If the LLM is unavailable or errors, fall back to the regex result even at low confidence,
     and surface a note in the SpecCard ("Low-confidence match — please check the fields").
Always end at the SpecCard confirm step (Phase 0.3) regardless of which parser produced the spec,
so the user still confirms before running. Add a small indicator showing which parser was used
(⚡ fast / 🤖 LLM). Keep the app fully functional with NO key set.
```

---

## Phase 4 — Product / novelty polish

### Step 4.1 — Real parts + BOM with pricing
```
Add a parts layer: map each snapped E-series component to a real orderable part with a price.
Start with a bundled static catalog (JSON of common 0603 resistors/capacitors with typical unit
prices and a placeholder MPN/distributor part number). Create src/design/bom.js: buildBOM(components)
-> [{ ref, value, mpn, unitPrice, qty }] plus a total. Show a BOM table + total cost in the report,
and add a "Download BOM (CSV)" export next to the existing SPICE/KiCad/Altium exports in
src/components/ExplanationPanel.jsx. Structure it so a live Digikey/Mouser API can replace the
static catalog later behind the same buildBOM interface.
```

### Step 4.2 — Monte-Carlo tolerance sweep (yield)
```
Add a "tolerance analysis" mode: given the verified design, randomly perturb each component within
its tolerance band (e.g. ±5%), run the real SPICE sim N=200 times, and report the distribution of
the key metric (histogram) plus the yield (% of runs within spec). Reuse src/sim/spice.js and
src/design/loop.js measurement helpers. Add a "Run tolerance sweep" button on the verification
report; show the histogram with the existing recharts dependency. This demonstrates
manufacturing-grade rigor — a strong differentiator.
```

### Step 4.3 — Multi-agent framing (orchestration)
```
Refactor the pipeline into named, swappable "agents" behind a small orchestrator so the product
story ("multi-agent hardware design") is real, not decorative:
  - DesignerAgent: spec -> ideal components (formula engine)
  - SimulatorAgent: netlist -> measured results (ngspice-wasm)
  - RefineAgent: the E-series local-search loop
  - (later) DFMAgent, CostAgent
Create src/agents/ with one module per agent and an orchestrator that runs them in sequence and
streams status to the ProcessingLog. Keep each agent a pure function with a typed input/output so
they're independently testable. No behavior change vs Phase 2 — this is a structural refactor that
makes the agent architecture explicit and extensible.
```

---

## Phase 5 — Company scale (later, needs team/capital)

- **Server-side ngspice**: for large circuits, corner analysis, big Monte-Carlo — optional backend
  behind the same sim interface. Only when in-browser wasm hits limits.
- **PCB layout + quantum-inspired annealing**: when the product grows into placement/routing
  (genuinely NP-hard combinatorial), add a quantum-INSPIRED annealer (simulated/digital annealing,
  runs on classical hardware today) as the optimization backend — QPU-ready, marketed as "advanced
  optimization," not the whole pitch. This is the honest quantum angle; it only becomes relevant
  at the layout stage, never for analytic component sizing.
- **Pure quantum EDA**: research moonshot; only with a quantum team and patient capital.

---

## Definition of done for the "seed demo" (Phases 0–2)

- User types a prompt → sees an editable spec card (every assumption visible) → clicks Run.
- Deterministic loop snaps to E-series, runs REAL ngspice-wasm, measures error, refines, converges.
- Report shows honest measured-vs-target error, the refine trace, and a buyable component list.
- All 10 circuits render their OWN correct schematics; CircuitJS has 0 bad connections.
- Everything in-browser, zero install. LLM optional and only at the edges.
