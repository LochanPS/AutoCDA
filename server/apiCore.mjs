/**
 * apiCore.mjs — the verify/parse/compose logic, host-agnostic.
 *
 * One implementation of "circuit intent → SPICE-verified design", shared by every
 * front door so they can never drift:
 *   - the HTTP service   (server/apiServer.mjs)
 *   - the MCP server      (server/mcpServer.mjs)  ← "the truth-layer for AI"
 *
 * Reuses the exact app design/verify code (via server/loader.mjs). ngspice runs
 * in-process; the engine is deterministic, so there is no per-call AI cost.
 *
 * Each `run*` returns { status, payload } where status is an HTTP-style code the
 * HTTP layer forwards verbatim and the MCP layer maps to ok / isError.
 */
import { orchestrate } from "../src/agents/orchestrator.js";
import { runSpice } from "../src/sim/spice.js";
import { makeSpec, SUPPORTED_TYPES } from "../src/spec/circuitSpec.js";
import { parsePrompt } from "../src/utils/circuitParser.js";
import { buildBOM } from "../src/design/bom.js";
import { composeCircuit, verifyComposition } from "../src/design/compose.js";

export { SUPPORTED_TYPES };

export function listTypes() {
  return SUPPORTED_TYPES.map((t) => ({ id: t.id, name: t.name, fields: t.fields }));
}

export function runParse(prompt) {
  return parsePrompt(prompt);
}

function specFromRequest(body) {
  // Accept either a natural-language prompt or an explicit {type, targets}.
  if (body.prompt) {
    const p = parsePrompt(body.prompt);
    if (!p.type || p.confidence === 0) return { error: `could not parse "${body.prompt}"`, parsed: p };
    return { spec: makeSpec({ type: p.type, targets: p.targets, constraints: p.constraints, confidence: p.confidence, assumed: p.assumed }) };
  }
  if (body.type) {
    try {
      return { spec: makeSpec({ type: body.type, targets: body.targets || {}, constraints: body.constraints || {} }) };
    } catch (e) {
      return { error: String(e.message || e) };
    }
  }
  return { error: "provide { prompt } or { type, targets }" };
}

export async function runVerify(body) {
  const sr = specFromRequest(body);
  if (sr.error) return { status: 422, payload: { ok: false, ...sr } };
  const spec = sr.spec;
  const strategy = body.strategy === "grid" ? "grid" : "reasoning";
  const res = await orchestrate(spec, { runSpice, strategy });
  const circuit = res.circuit || {};
  const components = (res.components || circuit.components || []).map((c) => ({
    ref: c.ref, value: c.display, rawValue: c.rawValue, unit: c.unit, description: c.description,
    ...(c.synthesis ? { synthesis: c.synthesis } : {}),
  }));
  const bom = buildBOM(res.components || circuit.components || []);
  return {
    status: 200,
    payload: {
      ok: true,
      type: spec.type,
      name: circuit.name || spec.type,
      targets: spec.targets,
      constraints: spec.constraints,
      verified: !!res.verifiable,
      targetName: res.targetName,
      target: res.targetValue,
      measured: res.measured,
      errorPct: res.errorPct,
      converged: !!res.converged,
      iterations: res.iterations,
      eSeries: res.eSeries,
      tolerance: res.tolerance,
      assumed: spec.assumed,
      components,
      bom: { rows: bom.rows, total: bom.total },
      netlist: circuit.netlist || null,
      trace: res.trace || [],
    },
  };
}

export async function runCompose(body) {
  if (!body || !Array.isArray(body.stages))
    return { status: 400, payload: { ok: false, error: "provide { stages: [{type, targets}] }" } };
  try {
    const comp = composeCircuit(body.stages);
    const v = await verifyComposition(comp, { runSpice });
    const bom = buildBOM(comp.components);
    return {
      status: 200,
      payload: {
        ok: true,
        stages: comp.stages,
        predicted: comp.predicted,
        measureKind: comp.measureKind,
        measured: v.measured,
        errors: v.errors,
        components: comp.components.map((c) => ({ ref: c.ref, value: c.display, unit: c.unit, stage: c.stage })),
        bom: { rows: bom.rows, total: bom.total },
        netlist: comp.netlist,
      },
    };
  } catch (e) {
    return { status: 422, payload: { ok: false, error: String(e.message || e) } };
  }
}
