# A Verifying Oracle for Trustworthy LLM Analog Circuit Design

*Working draft — arXiv/workshop short paper. Numbers are reproducible from the
AutoCDA repository (see **Reproducibility**). Items marked **[TODO]** need work
before submission: a live-LLM proposer run at scale, a baseline tool comparison,
and a larger, more diverse human-written dataset. Authors/affiliations omitted.*

---

## Abstract

Large language models can describe analog circuits fluently but choose component
values unreliably: the numbers look plausible and are often wrong, with no signal
of which. We present **AutoCDA**, a system that makes an LLM trustworthy for small
analog design by confining it to *proposing* and handing the *deciding* to a
deterministic oracle. A plain-English intent is parsed into a typed specification;
a design is produced not by one formula but by a closed loop that **proposes**
component values, **grades** each candidate against an independent in-browser SPICE
oracle (ngspice compiled to WebAssembly), observes the measured error, and
**re-proposes** — projecting every value onto the discrete set of standard
(E-series) parts so the result is always orderable. The same propose-then-verify
contract governs breadth: for an intent with no closed-form template, the LLM may
propose a *topology*, which is **accepted only if the oracle grades it within
tolerance** — the model never gets the last word. Across 22 circuit types and a
559-case labelled benchmark, the natural-language front end reaches 99.5% intent
accuracy on canonical phrasings (85.2% for the offline regex alone across all
difficulties, with an LLM fallback for the hard tail), and the design loop
converges to a within-tolerance, buyable design in 100% of SPICE-verifiable cases
at 5%, 2% and 1% tolerance. Every result is labelled measured-vs-derived and
carries a reproducibility stamp (engine version + canonical netlist hash), and the
engine is exposed as an HTTP API and an MCP server so any agent can verify a
circuit mid-reasoning instead of guessing.

## 1. Introduction

A raw LLM asked for "a low-pass filter at 2 kHz" will emit an R and a C. Sometimes
they are right; often they are off by tens of percent; nothing distinguishes the
two cases. For hardware this is worse than useless — a confidently wrong value is
built, or bought, before the error surfaces. The lesson of recent tool-augmented
systems is that LLMs are strong *proposers* and weak *verifiers of their own
output*. We apply that lesson literally: keep the LLM in the loop only where it
proposes, and make an external, deterministic simulator the sole authority on
whether a design is correct.

Our contributions:

1. **A verifying-oracle architecture** for analog synthesis: a bounded
   propose→SPICE-grade→re-propose loop whose every candidate is an orderable
   standard part, reporting honest measured-vs-target error (§2.2).
2. **Three constrained LLM roles** — intent parsing, topology proposal, and
   next-value proposal — each gated by the same oracle, so model error degrades
   gracefully instead of silently (§2.3).
3. **An accept/reject gate for open-ended coverage** (§2.4): a proposed topology
   with no template is run through the identical verify path and kept only if it
   measures within tolerance.
4. **Reproducibility by construction** (§2.5) and a developer surface (HTTP + MCP)
   that lets other agents call the oracle (§2.6).

## 2. System

### 2.1 Pipeline

`intent → parse → CircuitSpec → design → snap-to-E-series → SPICE-verify →
refine → BOM`. The `CircuitSpec` is a typed object `{type, targets, constraints,
confidence, assumed[]}`; everything downstream reads it. Parsing is a regex fast
path with an optional LLM fallback when confidence is low; any defaulted target is
recorded in `assumed[]` and surfaced, never hidden.

### 2.2 The verifying oracle and the design loop

The oracle is ngspice (via `eecircuit-engine`, WebAssembly), run identically in the
browser and on the server. It is **independent of the design equations**: a circuit
is sized from its governing formula, but the reported error is what ngspice
*measures* on the snapped netlist, so error is genuine, not a restatement of the
formula. The loop (a log-domain secant proposer by default) fits the local response
`measured = k·value^p` from the two most recent simulations and solves for the
target; two-phase refinement (coarse E24, then an E96 resistor trim, then a joint
two-component search) reaches sub-1% tolerance where a single standard part cannot.
Every proposed value is snapped to the nearest standard part before it is
simulated, so the search never leaves the buyable set.

### 2.3 Three constrained LLM roles

The LLM is interchangeable with a deterministic alternative in every role, and in
every role the oracle grades the result:

- **Parse** (`intent → spec`): a tool-call constrained to the supported type
  enum, so the model cannot invent an unsupported type.
- **Propose next value**: the model may replace the secant step, deciding the next
  component value from the simulator's feedback; the loop and the SPICE grader are
  unchanged.
- **Propose topology** (§2.4).

### 2.4 Accept/reject gate for breadth

Fixed templates are breadth-by-menu. For an intent no template covers, a topology
agent lets the model propose either a known type with targets or a raw parametric
netlist plus a whitelisted measurement. The proposal is **run through the same
deterministic verify path and accepted only if ngspice reports no errors and the
measured value is within tolerance**; otherwise it is rejected or returned flagged
best-effort. Generation is thus gated by verification — trust is structural, not
probabilistic.

### 2.5 Reproducibility

Each result carries `{engine, engineVersion, hashAlgo, netlistHash}` over the
canonicalized deck. The same intent yields the same stamped design; a stamp is an
audit key and a cache key (identical netlists need not be re-simulated).

### 2.6 Developer surface

The identical core (`server/apiCore.mjs`) backs an HTTP API and an MCP server. One
`/api/verify` call returns the verified design, a priced BOM, richer measured
metrics (THD/amplitude for oscillators; line/load regulation for regulators), a
locale landed cost, and the reproducibility stamp. The MCP server exposes
`verify_circuit`/`parse`/`compose` so an agent verifies mid-reasoning.

## 3. Evaluation

**Intent parsing.** On a 559-case labelled benchmark spanning 22 types, the offline
regex parser reaches **99.5% / 96% / 57%** exact-match on easy/medium/hard
phrasings (85.2% overall); the deployed system routes low-confidence cases to the
LLM, which lifts the hard, colloquial tail. [TODO: report the live-LLM routed
number and confidence calibration at scale.]

**Design-loop convergence.** Over every SPICE-verifiable type, from good seeds and
seeds up to 64× off, the loop converges to a within-tolerance design in **100%** of
cases at 5%, 2% and 1% tolerance (the last two via the E96 and joint-trim phases).
These are CI-enforced assertions (`reasoningStress.test.js`); a regression fails the
build.

**Measured error (real ngspice).** Representative first-pass (pre-refinement)
measurements: RC low-pass fc 2 kHz → 1988.8 Hz (0.56%); instrumentation amp Av 100
→ 100.99 (0.99%); current mirror 10 mA → 10.16 mA (1.6%); Wien oscillator 1 kHz →
982.2 Hz (1.78%), with THD and amplitude read from the transient. Refinement drives
these lower.

**Composition.** Verified blocks cascade into one deck measured end-to-end;
branching (fan-out) compositions are supported, with an inter-stage loading check
(output vs input impedance) and per-stage attribution of a composed miss.

[TODO: a head-to-head against a non-verifying LLM baseline and against a
commercial calculator, on the same dataset, reporting error distribution.]

## 4. Related work

LLMs for EDA and code; tool-augmented and verifier-in-the-loop LLMs; program
synthesis with test oracles; classical analog sizing (equation-based and
optimization-based). Our point of difference is the *honest-error contract* — an
independent simulator, not the generator, reports correctness — combined with a
buyable-by-construction output and result reproducibility. [TODO: citations.]

## 5. Limitations

Coverage is still anchored on templates plus the topology-proposal escape hatch,
whose real-world breadth needs large-scale evaluation; the ideal-op-amp decks omit
device non-idealities (stability margins, PSRR, output impedance need non-ideal
models — the analyzers exist, the models do not yet); sourcing/landed-cost figures
use illustrative default rates; the live-LLM proposer is implemented but not yet
benchmarked at scale.

## 6. Conclusion

Confining an LLM to proposals under a deterministic verifying oracle turns a fluent
but unreliable describer into a trustworthy analog design assistant: open-ended
enough to be useful, honest enough to build or buy from. The same oracle, offered
as an API and an MCP tool, lets other agents stop guessing component values.

## Reproducibility

- Parser/benchmark numbers: `npm run benchmark` (regenerates `docs/benchmark.html`).
- Convergence guarantees: `CI=true npx react-scripts test` (`reasoningStress.test.js`).
- Measurements: `npm run verify-api`, then `POST /api/verify`, or the MCP server.
- Code map: oracle `src/sim/spice.js`; measurement `src/sim/measure.js`,
  `src/sim/transient.js`; design loop `src/agents/reasoningAgent.js`; topology gate
  `src/agents/topologyAgent.js`; reproducibility `src/sim/repro.js`.
