/**
 * loop.js — compatibility shim for the design/verify pipeline.
 *
 * The pipeline was refactored (Phase 4.3) into explicit agents under src/agents/:
 *   DesignerAgent → SimulatorAgent → RefineAgent, run by the orchestrator.
 * This module keeps the original import paths working: `designAndVerify` and the
 * simulation primitives the Monte-Carlo sweep uses. No behaviour change.
 */

export { designAndVerify, orchestrate } from "../agents/orchestrator";
export {
  simulateMeasure,
  circuitTargetInfo,
  isVerifiable,
  dominantRef,
  buildNetlist,
} from "../agents/simulatorAgent";
