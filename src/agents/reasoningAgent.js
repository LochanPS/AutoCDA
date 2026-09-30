/**
 * ReasoningAgent — a real closed-loop design agent: propose → SPICE-grade →
 * observe → re-propose, until the honest measured error is within tolerance.
 *
 * This is the genuinely agentic path, in contrast to RefineAgent, which sweeps a
 * FIXED neighbourhood of the snapped value blindly. Here each next candidate is
 * DECIDED from the simulator's feedback: the loop looks at what SPICE actually
 * measured for the values it has already tried and reasons about where to go
 * next. The reasoning step is pluggable:
 *
 *   secantProposer (default)  deterministic, no API key. Models the local
 *                             response as a power law measured = k·value^p, fits
 *                             the exponent from the two most recent simulations
 *                             (a secant / Newton step in log-log space), and
 *                             solves for the value that hits the target. With a
 *                             single point it takes a first-order step using the
 *                             known monotonic direction of the circuit.
 *   llmReasoningProposer      swaps the reasoning for a real Claude tool-call
 *                             (needs REACT_APP_ANTHROPIC_KEY). Same loop, same
 *                             SPICE grader — only the "where next?" decision
 *                             moves into the model. This is the version where an
 *                             AI is actually in the design loop.
 *
 * Whatever the proposer returns is snapped to the E-series, so every candidate
 * stays a buyable part. The loop is bounded (maxIterations) and reports the full
 * trace with the rationale behind each move, so the search is auditable.
 *
 * The SPICE grading is injected as `simulate` (default: SimulatorAgent over the
 * provided runSpice), so the loop is unit-testable against an analytic model
 * without the wasm engine, and runs against real ngspice in the app/benchmark.
 */

import { snap, neighbors, applyValue } from "../design/eseries";
import { simulatorAgent, dominantRef } from "./simulatorAgent";

export const MAX_ITERATIONS = 6;

/**
 * Sign of d(measured)/d(value) for each verifiable type's dominant component:
 * does the measured scalar INCREASE (+1) or DECREASE (-1) as the dominant part
 * value grows? Used only for the first-order step before two points exist.
 *   rc_lowpass/highpass  fc = 1/(2πRC), dominant C  → fc falls as C rises   (-1)
 *   voltage_divider      Vout = Vin·R2/(R1+R2), dom R1 → Vout falls as R1↑  (-1)
 *   led_limiter          I = (Vs−Vf)/R1, dom R1        → I falls as R1↑      (-1)
 *   opamp_inverting      Av = Rf/R1, dom Rf            → Av rises as Rf↑     (+1)
 *   opamp_noninverting   Av = 1+Rf/Rg, dom Rf          → Av rises as Rf↑     (+1)
 *   common_emitter       Av ≈ RC/(RE+re'), dom RE      → Av falls as RE↑     (-1)
 *   band_pass            f0 = 1/(2π√…), dom C1         → f0 falls as C1↑     (-1)
 */
const MONO = {
  rc_lowpass: -1,
  rc_highpass: -1,
  voltage_divider: -1,
  led_limiter: -1,
  opamp_inverting: +1,
  opamp_noninverting: +1,
  common_emitter: -1,
  band_pass: -1,
};

const valueMap = (components) => {
  const m = {};
  for (const c of components) if (c.rawValue != null) m[c.ref] = c.rawValue;
  return m;
};

const finite = (x) => typeof x === "number" && isFinite(x);

/**
 * Deterministic feedback proposer. Returns the next dominant value to try and a
 * short rationale, given the target and the history of (value, measured) points.
 * @param {{type,target,current,history,eSeries}} ctx
 * @returns {{value:number, rationale:string}}
 */
export function secantProposer({ type, target, current, history, eSeries = "E24" }) {
  const usable = history.filter((h) => finite(h.value) && finite(h.measured) && h.measured > 0);

  // Two distinct points → fit the local exponent and solve for the target.
  if (usable.length >= 2) {
    const [p1, p2] = usable.slice(-2);
    if (p2.value !== p1.value) {
      const p =
        (Math.log(p2.measured) - Math.log(p1.measured)) /
        (Math.log(p2.value) - Math.log(p1.value));
      if (finite(p) && Math.abs(p) > 1e-6) {
        const raw = p2.value * Math.pow(target / p2.measured, 1 / p);
        if (finite(raw) && raw > 0) {
          return {
            value: snap(raw, eSeries),
            rationale: `secant fit p=${p.toFixed(2)} on last two sims → solve for ${short(target)}`,
          };
        }
      }
    }
  }

  // One point (or degenerate) → first-order step using the known direction.
  const last = usable[usable.length - 1];
  if (last) {
    const sign = MONO[type] ?? -1;
    // measured = k·value^sign (assume |exponent|≈1) ⇒ value* = value·(target/measured)^sign
    const raw = last.value * Math.pow(target / last.measured, sign);
    if (finite(raw) && raw > 0) {
      return {
        value: snap(raw, eSeries),
        rationale: `first-order step: measured ${short(last.measured)} vs target ${short(target)}, dir ${sign > 0 ? "↑" : "↓"}`,
      };
    }
  }

  // No usable feedback → probe an E-series neighbour of the current value.
  const nb = neighbors(current, eSeries, 1);
  return { value: nb.length ? nb[nb.length - 1] : current, rationale: "probe (no measurement yet)" };
}

const short = (x) =>
  !finite(x) ? String(x) : Math.abs(x) >= 1000 || (Math.abs(x) > 0 && Math.abs(x) < 0.01) ? x.toExponential(2) : x.toPrecision(3);

/**
 * One single-variable feedback search: tune `ref` (snapped to `series`) with the
 * given proposer until within tolerance or the iteration budget is spent. Every
 * other component is held at `base`. Pure over the injected grader.
 * @returns {Promise<{best, trace, errors}>}
 */
async function searchOne({ type, targets, ref, series, base, tolerance, maxIterations, grade, propose, onStatus }) {
  let value = base[ref];
  const history = [];
  const trace = [];
  let best = null;
  let errors = [];
  let rationale = series === "E96" ? `fine trim: ${ref} on E96` : "start: E-series-snapped analytical value";

  for (let i = 0; i < maxIterations; i++) {
    const vals = { ...base, [ref]: value };
    if (onStatus) onStatus(`Reasoning step ${i + 1}/${maxIterations}: try ${ref}=${short(value)}`);

    const sim = await grade({ valueMap: vals });
    errors = sim.errors || [];
    const measured = sim.measured;
    const target = sim.target;
    const errorPct =
      !finite(measured) || !finite(target) || target === 0 ? null : Math.abs((measured - target) / target);

    trace.push({ ref, value, measured, errorPct, rationale });
    history.push({ value, measured });

    if (errorPct != null && (best == null || errorPct < best.errorPct)) {
      best = { ref, candidate: value, measured, errorPct };
    }
    if (errorPct != null && errorPct <= tolerance) break;

    const next = propose({ type, target, current: value, history, eSeries: series });
    // Stall guard: if the proposal repeats the current value, nudge one E-series
    // step in the direction the error demands, else stop (no better move exists).
    if (next.value === value) {
      const sign = MONO[type] ?? -1;
      const wantUp = errorPct != null && (measured < target ? sign > 0 : sign < 0);
      const nb = neighbors(value, series, 1);
      const nudged = wantUp ? nb[nb.length - 1] : nb[0];
      if (nudged == null || nudged === value) break;
      value = nudged;
      rationale = "stall guard: single E-series step toward target";
    } else {
      value = next.value;
      rationale = next.rationale;
    }
  }
  return { best, trace, errors };
}

/**
 * Run the closed loop.
 *
 * Two phases. Phase 1 tunes the dominant component on the requested series (E24
 * by default). If that alone cannot meet tolerance — inevitable for a tight spec,
 * since a single E24 part is only ~5% granular — Phase 2 fine-trims a RESISTOR on
 * E96 (~1%). Resistors are the honest place to buy precision: E96 (1%) parts are
 * standard, while capacitors are not made to fine tolerances, so for RC/band-pass
 * (capacitor-dominant) the trim moves R1, not the cap. Each phase gets its own
 * iteration budget; Phase 2 runs only when Phase 1 leaves error above tolerance.
 *
 * @param {Object} input
 * @param {string} input.type
 * @param {Object} input.targets
 * @param {Array}  input.snapped          starting (snapped) components
 * @param {number} [input.tolerance=0.05]
 * @param {string} [input.eSeries="E24"]
 * @param {number} [input.maxIterations=MAX_ITERATIONS]  per-phase budget
 * @param {boolean} [input.fineTrim=true]  allow the E96 resistor trim phase
 * @param {(netlist:string)=>Promise<object>} [input.runSpice]  real SPICE
 * @param {(args:{valueMap:Object})=>Promise<Object>} [input.simulate]  grader override
 * @param {Function} [input.propose=secantProposer]
 * @param {(msg:string)=>void} [input.onStatus]
 * @returns {Promise<{dominant, best, trace, iterations, errors, converged, finalComponents}>}
 */
export async function reasoningAgent({
  type,
  targets,
  snapped,
  tolerance = 0.05,
  eSeries = "E24",
  maxIterations = MAX_ITERATIONS,
  fineTrim = true,
  runSpice,
  simulate,
  propose = secantProposer,
  onStatus,
}) {
  const dominant = dominantRef(type);
  if (!dominant) return { dominant: null, best: null, trace: [], iterations: 0, errors: [], converged: false, finalComponents: snapped };

  const grade =
    simulate || ((args) => simulatorAgent({ type, targets, valueMap: args.valueMap, runSpice }));

  const baseVals = valueMap(snapped);
  const unitOf = (ref) => (snapped.find((c) => c.ref === ref) || {}).unit;

  // Phase 1: coarse search on the dominant component at the requested series.
  const p1 = await searchOne({ type, targets, ref: dominant, series: eSeries, base: baseVals, tolerance, maxIterations, grade, propose, onStatus });
  let trace = p1.trace;
  let errors = p1.errors;
  let best = p1.best;
  const finalVals = { ...baseVals };
  if (best) finalVals[dominant] = best.candidate;

  // Phase 2: E96 resistor trim, only if Phase 1 fell short and a finer part helps.
  // Dominant is a capacitor (RC / band-pass) → trim R1; else trim the dominant
  // resistor itself on E96. Skip if that would repeat Phase 1 (already E96).
  const needTrim = fineTrim && best && best.errorPct > tolerance;
  if (needTrim) {
    const fineRef = unitOf(dominant) === "F" ? "R1" : dominant;
    const fineSeries = "E96";
    const canHelp = baseVals[fineRef] != null && !(fineRef === dominant && eSeries === fineSeries);
    if (canHelp) {
      if (onStatus) onStatus(`Phase 2: fine-trimming ${fineRef} on E96 for ${(tolerance * 100).toFixed(0)}% tolerance`);
      const base2 = { ...finalVals, [fineRef]: snap(finalVals[fineRef], fineSeries) };
      const p2 = await searchOne({ type, targets, ref: fineRef, series: fineSeries, base: base2, tolerance, maxIterations, grade, propose, onStatus });
      trace = trace.concat(p2.trace);
      if (p2.errors && p2.errors.length) errors = p2.errors;
      if (p2.best && (!best || p2.best.errorPct < best.errorPct)) {
        best = p2.best;
        finalVals[fineRef] = p2.best.candidate;
      }
    }
  }

  const finalComponents = snapped.map((c) =>
    finalVals[c.ref] != null && finalVals[c.ref] !== c.rawValue ? applyValue(c, finalVals[c.ref]) : c
  );

  return {
    dominant,
    best,
    trace,
    iterations: trace.length,
    errors,
    converged: !!best && best.errorPct <= tolerance,
    finalComponents,
  };
}

/**
 * Real-API reasoning proposer: asks Claude for the next value given the target
 * and the measured history. Same loop and SPICE grader as the deterministic
 * path — only the decision moves into the model. Returns a proposer function.
 *
 * @param {{ key?:string, model?:string, fetchImpl?:Function }} [opts]
 */
export function llmReasoningProposer({ key = process.env.REACT_APP_ANTHROPIC_KEY, model = "claude-sonnet-5", fetchImpl } = {}) {
  const doFetch = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
  const TOOL = {
    name: "propose_next_value",
    description: "Given a design target and the simulator feedback so far, propose the next component value to try.",
    input_schema: {
      type: "object",
      properties: {
        value: { type: "number", description: "The next component value to simulate (base SI unit: Ω or F)." },
        rationale: { type: "string", description: "One short sentence on why this value should move the measurement toward the target." },
      },
      required: ["value", "rationale"],
    },
  };

  return async function propose({ type, target, current, history }) {
    if (!key) throw new Error("LLM reasoning proposer unavailable (no key)");
    if (!doFetch) throw new Error("no fetch implementation");
    const points = history
      .map((h) => `value=${h.value} → measured=${h.measured}`)
      .join("\n");
    const prompt =
      `Circuit type: ${type}\nDesign target (measured scalar): ${target}\n` +
      `Current value: ${current}\nSimulator history:\n${points}\n\n` +
      `Propose the next value to simulate so the measurement converges to the target. ` +
      `The response will be snapped to the nearest E-series part, so any positive real value is fine.`;
    const res = await doFetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model,
        max_tokens: 256,
        tool_choice: { type: "tool", name: TOOL.name },
        tools: [TOOL],
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) throw new Error(`LLM reasoning HTTP ${res.status}`);
    const data = await res.json();
    const use = (data.content || []).find((b) => b.type === "tool_use" && b.name === TOOL.name);
    if (!use) throw new Error("LLM reasoning: no tool_use in response");
    return { value: use.input.value, rationale: use.input.rationale || "llm proposal" };
  };
}
