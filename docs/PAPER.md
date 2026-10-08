# A Verifying Oracle for Trustworthy LLM Analog Circuit Design

*Short paper / preprint, submission-ready draft. Every reported number is
reproducible from the AutoCDA repository (see **Reproducibility**). Remaining work
is scoped in **§5 Limitations** (broader human-written dataset; non-ideal device
models; a confirmatory live-LLM-proposer run). Authors/affiliations and formal
citation keys to be finalised for the target venue.*

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
difficulties, with an LLM fallback for the hard tail). Verification pays off
directly: over 25 design tasks graded on real ngspice, putting the oracle in the
loop cuts **median measured error from 2.3% to 0.8%**, 90th-percentile error from
5.8% to 1.7%, and lifts the fraction meeting a 2% tolerance from **32% to 96%**
versus emitting the same closed-form design unverified — at a mean of 3 simulations
per design. Every result is labelled measured-vs-derived and
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
LLM, which lifts the hard, colloquial tail. (Reproduce: `npm run benchmark`.)

**Does verification help? (the headline).** We compare two ways to turn an intent
into parts, graded by the *same* independent ngspice oracle, over 25 design tasks
spanning all verifiable types:

- **Baseline — "generate, don't verify":** the closed-form design snapped to the
  nearest E-series parts, taken as-is (what an analytical tool or a one-shot LLM
  emits). One measurement, no refinement.
- **Oracle — "verify in the loop":** the full propose→SPICE-grade→re-propose loop.

| Metric (measured error) | Baseline | **Oracle** |
|---|---|---|
| Median | 2.31% | **0.82%** |
| 90th percentile | 5.83% | **1.74%** |
| Within 2% tolerance | 32% | **96%** |
| Within 1% tolerance | 28% | **60%** |
| Mean simulations / design | 1 | 3 |

The oracle cuts median error ~3× and nearly triples the 2%-tolerance yield, at a
mean of three simulations — the cost is a handful of deterministic SPICE runs, not
an AI call. One task (a 20 mA current mirror into a fixed load) stays at ~40% in
*both* columns: a structural ceiling the loop cannot size around — and it reports
the honest 40%, `converged: false`, rather than a fabricated pass. That is the
honest-error contract doing its job. (Reproduce: `node --import ./server/loader.mjs
scripts/paperEval.mjs`.)

**Convergence robustness.** On analytic response models (so the loop *logic* is
isolated from engine noise), over every verifiable type and seeds up to 64× off the
ideal, the loop converges within tolerance in **100%** of cases at 5%, 2% and 1%
(the last two via the E96-resistor and joint two-component trim phases). These are
CI-enforced assertions (`reasoningStress.test.js`); a regression fails the build.

**Richer metrics.** For types whose figures live in the time domain, the same run
yields them: e.g. the Wien oscillator reports amplitude 2.95 Vpp and THD 5.6% from
the transient; zener/shunt regulators report line and load regulation.

**Composition.** Verified blocks cascade into one deck measured end-to-end;
branching (fan-out) compositions are supported, with an inter-stage loading check
(output vs input impedance) and per-stage attribution of a composed miss.

## 4. Related work

**Tool-augmented and verifier-in-the-loop LLMs.** ReAct interleaves reasoning with
tool calls [1] and Toolformer teaches models to call external tools [2]; we take the
stronger stance that an external oracle, not the model, is the authority on
correctness. **Program synthesis with oracles.** Execution/test-guided synthesis
accepts a candidate only if it passes an executable check (e.g. test-driven and
execution-guided decoding) [3,4]; our SPICE grader is the analog analogue of a test
oracle. **Self-verification.** LLMs asked to self-critique improve unevenly and can
be confidently wrong [5]; we therefore externalize verification entirely. **LLMs for
EDA / analog sizing.** Surveys of LLMs in hardware design [6] and classical analog
sizing by equations or optimization [7] motivate the problem; our point of
difference is the *honest-error contract* — an independent simulator reports
correctness — combined with buyable-by-construction output and result
reproducibility. The oracle itself is ngspice [8].

## 5. Limitations

Coverage is anchored on templates plus the topology-proposal escape hatch (§2.4),
whose real-world breadth still needs large-scale evaluation on human-written
prompts; our 559-case benchmark is part-generated and should be broadened. A 2-pole op-amp
macromodel (`src/sim/opampModel.js`) now yields real closed-loop bandwidth and
phase/gain margin for the op-amp amplifiers (e.g. an inverting ×10 measures a
100 kHz bandwidth and ~85° phase margin — numbers the ideal VCVS cannot produce);
PSRR and slew rate still need a supply-referenced / slew-limited model, so those
remain reported only where a transient suffices.
Sourcing/landed-cost figures use illustrative default rates. The default proposer is
the deterministic secant solver benchmarked above; the LLM proposer is a drop-in
that makes the same next-value decision, offered as an ablation rather than required
for the reported results. Finally, as the current-mirror case shows, some targets
are structurally unreachable with a given topology — the system reports this
honestly instead of forcing a pass, but does not yet auto-propose a better topology
in that loop.

## References

[1] Yao et al., *ReAct: Synergizing Reasoning and Acting in Language Models*, ICLR 2023.
[2] Schick et al., *Toolformer: Language Models Can Teach Themselves to Use Tools*, NeurIPS 2023.
[3] Chen et al., *Execution-Guided Neural Program Synthesis*, ICLR 2019.
[4] Gulwani et al., *Program Synthesis*, Foundations and Trends in Programming Languages, 2017.
[5] Huang et al., *Large Language Models Cannot Self-Correct Reasoning Yet*, ICLR 2024.
[6] Zhong et al., *LLMs for EDA: A Survey*, 2023.
[7] Razavi, *Design of Analog CMOS Integrated Circuits* (equation-based sizing), 2001.
[8] Nenzi & Vogt, *ngspice — mixed-level/mixed-signal circuit simulator*.

## 6. Conclusion

Confining an LLM to proposals under a deterministic verifying oracle turns a fluent
but unreliable describer into a trustworthy analog design assistant: open-ended
enough to be useful, honest enough to build or buy from. The same oracle, offered
as an API and an MCP tool, lets other agents stop guessing component values.

## Reproducibility

- Parser/benchmark numbers: `npm run benchmark` (regenerates `docs/benchmark.html`).
- Convergence guarantees: `npm test` (`reasoningStress.test.js`).
- Measurements: `npm run verify-api`, then `POST /api/verify`, or the MCP server.
- Code map: oracle `src/sim/spice.js`; measurement `src/sim/measure.js`,
  `src/sim/transient.js`; design loop `src/agents/reasoningAgent.js`; topology gate
  `src/agents/topologyAgent.js`; reproducibility `src/sim/repro.js`.
