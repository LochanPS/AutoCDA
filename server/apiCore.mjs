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
import { parseWithLLM, selectProvider } from "../src/parse/llmParser.js";
import { collectMetrics } from "../src/agents/metricsAgent.js";
import { reproStamp } from "../src/sim/repro.js";
import { landedCostINR, envLandedOpts } from "../src/design/sourcing.js";
import { annotateAvailability } from "../src/design/availability.js";
import { proposeVerifiedSubstitutes } from "../src/design/substitutes.js";
import { dominantRef } from "../src/agents/simulatorAgent.js";
import { runCorners } from "../src/design/corners.js";

export { SUPPORTED_TYPES };

export function listTypes() {
  return SUPPORTED_TYPES.map((t) => ({ id: t.id, name: t.name, fields: t.fields }));
}

export function runParse(prompt) {
  return parsePrompt(prompt);
}

async function specFromRequest(body) {
  // Accept either a natural-language prompt or an explicit {type, targets}.
  if (body.prompt) {
    const p = parsePrompt(body.prompt);
    // Server-side LLM fallback: when the regex parser is unsure AND a key is
    // configured in the environment (OPENROUTER_API_KEY / REACT_APP_ANTHROPIC_KEY),
    // ask the LLM. The key stays on the server — never in a client bundle. Opt out
    // per request with { llm: false }. Any LLM error falls back to the regex result.
    const unsure = !p.type || p.confidence < 0.9;
    if (unsure && body.llm !== false && selectProvider()) {
      try {
        return { spec: await parseWithLLM(body.prompt), via: "llm" };
      } catch { /* fall back to the regex result below */ }
    }
    if (!p.type || p.confidence === 0) return { error: `could not parse "${body.prompt}"`, parsed: p };
    return { spec: makeSpec({ type: p.type, targets: p.targets, constraints: p.constraints, confidence: p.confidence, assumed: p.assumed }), via: "regex" };
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
  const sr = await specFromRequest(body);
  if (sr.error) return { status: 422, payload: { ok: false, ...sr } };
  const spec = sr.spec;
  const strategy = body.strategy === "grid" ? "grid" : "reasoning";
  const res = await orchestrate(spec, { runSpice, strategy });
  const circuit = res.circuit || {};
  const components = (res.components || circuit.components || []).map((c) => ({
    ref: c.ref, value: c.display, rawValue: c.rawValue, unit: c.unit, description: c.description,
    ...(c.synthesis ? { synthesis: c.synthesis } : {}),
  }));
  const finalParts = res.components || circuit.components || [];
  const bom = buildBOM(finalParts);

  // ── D3: one call returns the richer verification + sourcing, not just pass/fail ──
  // valueMap for the extra-metrics pass (ref -> raw SI value).
  const valueMap = {};
  for (const c of finalParts) if (c.rawValue != null) valueMap[c.ref] = c.rawValue;

  // Richer measured metrics (Theme B2): THD/amplitude for oscillators, line/load
  // regulation for regulators, etc. Null for types with none. Never fails verify.
  let metrics = null;
  if (res.verifiable) {
    try { metrics = await collectMetrics({ type: spec.type, targets: spec.targets, valueMap, runSpice }); }
    catch { metrics = null; }
  }

  // Reproducibility stamp (Theme B5): engine version + canonical netlist hash, so a
  // verified result is auditable and re-runnable — cite it, re-derive it.
  const repro = circuit.netlist ? reproStamp(circuit.netlist) : null;

  // Sourcing (Theme C): the India landed cost no global distributor shows — parts +
  // customs duty + GST + shipping + forex. Pure/deterministic (no per-call network).
  const indiaLanded = landedCostINR(bom.total, envLandedOpts());
  // C3: stock / MOQ / lead-time aware roll-up (when can the whole order ship).
  const avail = annotateAvailability(bom);
  const sourcing = {
    bomUsd: bom.total,
    indiaLandedINR: indiaLanded,
    availability: {
      allInStock: avail.allInStock,
      orderLeadDays: avail.orderLeadDays,
      outOfStock: avail.outOfStock,
      moqInflated: avail.moqInflated,
      availableTotal: avail.availableTotal,
    },
  };

  // C4: SPICE-verified substitutes for the dominant part — opt-in ({ substitutes:true })
  // since each candidate is re-simulated. Useful when a part is scarce/expensive.
  let substitutes = null;
  if (body.substitutes && res.verifiable) {
    const dom = dominantRef(spec.type);
    if (dom) {
      try {
        const options = await proposeVerifiedSubstitutes({ type: spec.type, targets: spec.targets, components: finalParts, ref: dom, tolerance: res.tolerance ?? 0.05, runSpice });
        substitutes = { ref: dom, options };
      } catch { substitutes = null; }
    }
  }

  // Corner & environment analysis (Theme B4) — opt-in (several extra SPICE runs).
  let corners = null;
  if (body.corners && res.verifiable) {
    try { corners = await runCorners(spec, finalParts, { runSpice }); }
    catch { corners = null; }
  }

  return {
    status: 200,
    payload: {
      ok: true,
      type: spec.type,
      name: circuit.name || spec.type,
      via: sr.via || "regex",
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
      metrics,
      sourcing,
      ...(substitutes ? { substitutes } : {}),
      repro,
      ...(corners ? { corners } : {}),
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
        sourcing: { bomUsd: bom.total, indiaLandedINR: landedCostINR(bom.total, envLandedOpts()) },
        repro: comp.netlist ? reproStamp(comp.netlist) : null,
        netlist: comp.netlist,
      },
    };
  } catch (e) {
    return { status: 422, payload: { ok: false, error: String(e.message || e) } };
  }
}
