/**
 * orchestrator — runs the design agents in sequence and assembles the result.
 *
 * This is the explicit "multi-agent hardware design" pipeline:
 *   DesignerAgent  (spec → ideal + snapped components)
 *   SimulatorAgent (netlist → measured, used inside RefineAgent)
 *   RefineAgent    (E-series local search over the dominant component)
 * DFMAgent / CostAgent can slot into the same sequence later.
 *
 * Each agent is a pure function with typed input/output, so they are testable in
 * isolation. This is a STRUCTURAL refactor of the Phase 2 loop: same inputs,
 * same outputs, same three guarantees (bounded, honest, deterministic). The only
 * addition is an optional onStatus stream for the processing log.
 *
 * orchestrate(spec, { runSpice, onStatus }) resolves to the same shape the old
 * designAndVerify returned.
 */

import { calculateCircuit, recalculateFromComponents } from "../utils/circuitFormulas";
import { applyValue } from "../design/eseries";
import { designerAgent } from "./designerAgent";
import { refineAgent } from "./refineAgent";
import { reasoningAgent } from "./reasoningAgent";
import { isVerifiable, circuitTargetInfo } from "./simulatorAgent";

// Rebuild the display circuit (graph/explanation/derived) from final components.
function displayCircuit(type, targets, components) {
  const recalced = recalculateFromComponents(type, components);
  if (recalced) return recalced;
  const base = calculateCircuit(type, targets);
  return base ? { ...base, components } : { id: type, components };
}

/**
 * @param {import('../spec/circuitSpec').CircuitSpec} spec
 * @param {{ runSpice: (netlist:string)=>Promise<object>, onStatus?: (msg:string)=>void,
 *           strategy?: "grid"|"reasoning", propose?: Function }} deps
 *   strategy "reasoning" (default) runs the closed feedback loop (ReasoningAgent),
 *   which converges 100% on the real-ngspice benchmark vs 95.5% for "grid" (the
 *   fixed E-series neighbourhood sweep, RefineAgent) at fewer simulations. `propose`
 *   lets the reasoning strategy use a custom proposer (e.g. the LLM one).
 */
export async function orchestrate(spec, { runSpice, onStatus, strategy = "reasoning", propose } = {}) {
  const type = spec.type;
  const targets = spec.targets || {};
  const eSeries = spec.constraints?.eSeries || "E24";
  const tol = spec.constraints?.tolerance ?? 0.05;
  const status = (m) => { if (onStatus) onStatus(m); };

  // DesignerAgent
  status("Designing from the governing equations");
  const design = designerAgent({ type, targets, eSeries });
  if (!design.ok) {
    return {
      circuit: null, components: [], measured: null, targetValue: null,
      targetName: null, targets, errorPct: null, iterations: 0,
      converged: false, verifiable: false, eSeries, tolerance: tol,
      trace: [], errors: ["unknown circuit type"],
    };
  }
  const { idealComponents, snapped } = design;
  status("Snapping to E-series (buyable) values");

  // Unverifiable in this build → return the honest analytical design.
  if (!isVerifiable(type)) {
    return {
      circuit: displayCircuit(type, targets, snapped), components: snapped,
      measured: null, targetValue: null, targetName: null, targets,
      errorPct: null, iterations: 0, converged: false, verifiable: false,
      eSeries, tolerance: tol, trace: [], errors: [],
    };
  }

  // SimulatorAgent + refinement. "grid" sweeps a fixed neighbourhood; "reasoning"
  // runs the closed propose→grade→re-propose loop. Both return the same shape.
  status("Running the ngspice-wasm simulation");
  const refine =
    strategy === "reasoning"
      ? await reasoningAgent({ type, targets, snapped, idealComponents, tolerance: tol, eSeries, runSpice, propose, onStatus })
      : await refineAgent({ type, targets, snapped, idealComponents, tolerance: tol, eSeries, runSpice, onStatus });
  const info = circuitTargetInfo(type, targets);
  const targetValue = info ? info.value : null;
  const iterations = refine.iterations;

  if (!refine.best) {
    return {
      circuit: displayCircuit(type, targets, snapped), components: snapped,
      measured: null, targetValue, targetName: info ? info.name : null, targets,
      errorPct: null, iterations, converged: false, verifiable: true,
      eSeries, tolerance: tol, trace: refine.trace, errors: refine.errors,
    };
  }

  // The reasoning strategy may tune more than the dominant (E96 trim), so it
  // returns the full component set; the grid strategy tunes only the dominant.
  const finalComponents = refine.finalComponents
    ? refine.finalComponents
    : snapped.map((c) => (c.ref === refine.dominant ? applyValue(c, refine.best.candidate) : c));
  const converged = refine.best.errorPct <= tol;
  status(converged ? "Verified in SPICE" : "Best-effort design");

  return {
    circuit: displayCircuit(type, targets, finalComponents),
    components: finalComponents,
    measured: refine.best.measured,
    targetValue,
    targetName: info ? info.name : null,
    targets,
    errorPct: refine.best.errorPct,
    iterations,
    converged,
    verifiable: true,
    eSeries,
    tolerance: tol,
    trace: refine.trace,
    errors: refine.errors,
  };
}

// Stable public name (Phase 2 API).
export const designAndVerify = orchestrate;
