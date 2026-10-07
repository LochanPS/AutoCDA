/**
 * topologyAgent.js — A3: LLM topology proposal → deterministic verify.
 *
 * The regex/LLM PARSER (src/parse/*) maps an intent onto one of the fixed
 * SUPPORTED_TYPES. That is breadth-by-menu. A3 is the honest path to open-ended
 * coverage: for an intent with no closed-form template, let a model *propose a
 * topology*, then run that proposal through the SAME deterministic verify path
 * the built-in types use. The model never gets the final word — ngspice does. A
 * proposal is ACCEPTED only if SPICE runs clean (no real errors) AND the measured
 * value meets the target within tolerance; otherwise it is rejected or returned
 * flagged best-effort. Trust is preserved because verification, not generation,
 * decides.
 *
 * Two proposal shapes (the model picks one):
 *   • "known"   → { type, targets } selecting a built-in verified type. Runs the
 *                 full orchestrate() loop (designer → simulator → refine). This is
 *                 the preferred path: a novel phrasing resolves to a trusted block.
 *   • "netlist" → { netlist, measurement, target, targetName } : a parametric
 *                 ngspice deck plus how to measure it. Run once and graded against
 *                 the target. This covers intents no built-in type matches.
 *
 * The proposer is pluggable, exactly like reasoningAgent's value proposer:
 *   heuristicTopologyProposer (default)  deterministic, no API key — reuses the
 *                                        regex parser to map to a known type.
 *   llmTopologyProposer                  a real Claude tool-call that may also
 *                                        emit a netlist topology.
 *
 * Pure over the injected runSpice/orchestrate, so the accept/reject gate is unit-
 * tested with fakes — no wasm, no network.
 */

import { parsePrompt } from "../utils/circuitParser";
import { SUPPORTED_TYPES, makeSpec, validateSpec } from "../spec/circuitSpec";
import { measureCutoff, measureGain, measureDC, measureUnityGainFreq } from "../sim/measure";
import { realErrors } from "./simulatorAgent";

const TYPE_IDS = SUPPORTED_TYPES.map((t) => t.id);

// Whitelisted measurement kinds for a netlist proposal → the pure analyzer.
// The model can only ask for a measurement we trust; it cannot run arbitrary JS.
const MEASURERS = {
  cutoff: (r, m) => measureCutoff(r, m.node || m.outNode || "out"),
  gain: (r, m) => measureGain(r, m.inNode || "in", m.outNode || "out"),
  dc: (r, m) => measureDC(r, m.node || m.outNode || "out"),
  unityGain: (r, m) => measureUnityGainFreq(r, m.inNode || "in", m.outNode || "out"),
};

export const MEASUREMENT_KINDS = Object.keys(MEASURERS);

const finite = (x) => typeof x === "number" && isFinite(x);
const errPct = (measured, target) =>
  !finite(measured) || !finite(target) || target === 0 ? null : Math.abs((measured - target) / target);

/**
 * Deterministic, offline topology proposer: reuse the regex parser to map the
 * intent onto a known verified type. Returns a "known" proposal, or null when
 * nothing matches (the caller then reports no proposal rather than guessing).
 * @param {{intent:string}} ctx
 * @returns {{kind:"known", type:string, targets:object, confidence:number, rationale:string}|null}
 */
export function heuristicTopologyProposer({ intent }) {
  const spec = parsePrompt(intent || "");
  if (!spec || !spec.type || spec.confidence === 0) return null;
  return {
    kind: "known",
    type: spec.type,
    targets: spec.targets,
    confidence: spec.confidence,
    rationale: `regex mapped intent to the built-in ${spec.type}`,
  };
}

/**
 * Propose a topology for an intent, then VERIFY it deterministically.
 *
 * @param {Object} input
 * @param {string} input.intent
 * @param {(netlist:string)=>Promise<object>} input.runSpice   real/fake ngspice
 * @param {Function} [input.propose=heuristicTopologyProposer]  async or sync
 * @param {number}  [input.tolerance=0.05]
 * @param {Function} [input.orchestrate]  the verify loop for "known" proposals;
 *   defaults to the real orchestrator. Injectable so tests avoid the wasm engine.
 * @param {(msg:string)=>void} [input.onStatus]
 * @returns {Promise<{
 *   accepted:boolean, provenance:string, reason?:string,
 *   proposal?:object, spec?:object, result?:object,
 *   measured?:number|null, target?:number|null, targetName?:string|null,
 *   errorPct?:number|null, errors?:string[], netlist?:string
 * }>}
 */
export async function proposeAndVerify({
  intent,
  runSpice,
  propose = heuristicTopologyProposer,
  tolerance = 0.05,
  orchestrate,
  onStatus,
} = {}) {
  const status = (m) => { if (onStatus) onStatus(m); };

  status("Proposing a topology for the intent");
  let proposal = null;
  try {
    proposal = await propose({ intent });
  } catch (e) {
    return { accepted: false, provenance: "none", reason: `proposer error: ${e.message}` };
  }
  if (!proposal) {
    return { accepted: false, provenance: "none", reason: "no topology proposed for this intent" };
  }

  // ── known-type proposal → full verify loop ──────────────────────────────────
  if (proposal.kind === "known") {
    if (!TYPE_IDS.includes(proposal.type)) {
      return { accepted: false, provenance: "llm-topology", proposal, reason: `proposed unknown type "${proposal.type}"` };
    }
    let spec;
    try {
      spec = makeSpec({ type: proposal.type, targets: proposal.targets || {}, confidence: proposal.confidence });
    } catch (e) {
      return { accepted: false, provenance: "llm-mapped-known", proposal, reason: e.message };
    }
    const v = validateSpec(spec);
    if (!v.ok) {
      return { accepted: false, provenance: "llm-mapped-known", proposal, spec, reason: v.errors.join("; ") };
    }
    const orch = orchestrate || (await import("./orchestrator")).orchestrate;
    status(`Verifying the proposed ${proposal.type} in the deterministic loop`);
    const result = await orch(spec, { runSpice, strategy: "reasoning", onStatus });
    return {
      accepted: !!result.converged,
      provenance: "llm-mapped-known",
      proposal,
      spec,
      result,
      measured: result.measured,
      target: result.targetValue,
      targetName: result.targetName,
      errorPct: result.errorPct,
      errors: result.errors,
    };
  }

  // ── raw netlist proposal → run once + grade ─────────────────────────────────
  if (proposal.kind === "netlist") {
    const { netlist, measurement, target, targetName } = proposal;
    if (!netlist || !measurement || !MEASURERS[measurement.kind]) {
      return { accepted: false, provenance: "llm-topology", proposal, reason: "netlist proposal missing a valid netlist/measurement" };
    }
    const tol = typeof proposal.tolerance === "number" ? proposal.tolerance : tolerance;
    status("Running the proposed netlist through ngspice");
    let result;
    try {
      result = await runSpice(netlist);
    } catch (e) {
      return { accepted: false, provenance: "llm-topology", proposal, netlist, reason: `spice error: ${e.message}` };
    }
    const errors = realErrors(result.errors);
    const measured = MEASURERS[measurement.kind](result, measurement);
    const e = errPct(measured, target);
    // The simulator decides: clean run AND within tolerance, or it is not accepted.
    const accepted = errors.length === 0 && e != null && e <= tol;
    return {
      accepted,
      provenance: "llm-topology",
      proposal,
      netlist,
      measured,
      target: finite(target) ? target : null,
      targetName: targetName || measurement.kind,
      errorPct: e,
      errors,
      reason: accepted
        ? undefined
        : errors.length
        ? "ngspice reported errors — rejected"
        : e == null
        ? "measurement failed — rejected"
        : `measured error ${(e * 100).toFixed(1)}% exceeds tolerance ${(tol * 100).toFixed(1)}% — best-effort`,
    };
  }

  return { accepted: false, provenance: "none", proposal, reason: `unknown proposal kind "${proposal.kind}"` };
}

/**
 * Real-API topology proposer: asks Claude to either map the intent to a built-in
 * verified type (preferred) or emit a parametric ngspice netlist + how to measure
 * it. Mirrors llmParser.js: constrained tool schema, direct-browser call, throws
 * when no key so the caller falls back to the heuristic proposer.
 * @param {{ key?:string, model?:string, fetchImpl?:Function }} [opts]
 */
export function llmTopologyProposer({ key = process.env.REACT_APP_ANTHROPIC_KEY, model = "claude-sonnet-5", fetchImpl } = {}) {
  const doFetch = fetchImpl || (typeof fetch !== "undefined" ? fetch : null);
  const TOOL = {
    name: "propose_topology",
    description:
      "Propose an analog circuit topology for the user's intent. Prefer selecting a built-in verified type when one fits; otherwise emit a parametric ngspice netlist and how to measure its key figure.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["known", "netlist"], description: "Which proposal shape follows." },
        type: { type: "string", enum: TYPE_IDS, description: 'For kind "known": the built-in type id.' },
        targets: { type: "object", description: 'For kind "known": numeric design targets in base SI units.' },
        netlist: { type: "string", description: 'For kind "netlist": a complete ngspice deck (sources, parts, analysis, .end).' },
        measurement: {
          type: "object",
          description: 'For kind "netlist": how to read the key figure.',
          properties: {
            kind: { type: "string", enum: MEASUREMENT_KINDS },
            inNode: { type: "string" },
            outNode: { type: "string" },
            node: { type: "string" },
          },
        },
        target: { type: "number", description: 'For kind "netlist": the target value the measurement should hit.' },
        targetName: { type: "string", description: 'For kind "netlist": name of the measured figure (e.g. "fc", "Av").' },
        rationale: { type: "string" },
      },
      required: ["kind"],
    },
  };

  return async function propose({ intent }) {
    if (!key) throw new Error("LLM topology proposer unavailable (no key)");
    if (!doFetch) throw new Error("no fetch implementation");
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
        max_tokens: 1024,
        system:
          "You are an analog circuit designer. Propose a topology for the intent. Prefer a built-in verified type when one fits; only emit a raw netlist for intents no built-in type covers. Netlists must be valid ngspice and use ideal VCVS (E-source) op-amps.",
        tools: [TOOL],
        tool_choice: { type: "tool", name: TOOL.name },
        messages: [{ role: "user", content: intent }],
      }),
    });
    if (!res.ok) throw new Error(`LLM topology HTTP ${res.status}`);
    const data = await res.json();
    const use = (data.content || []).find((b) => b.type === "tool_use" && b.name === TOOL.name);
    if (!use || !use.input) throw new Error("LLM topology: no tool_use in response");
    return use.input;
  };
}
