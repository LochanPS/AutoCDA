/**
 * apiServer.mjs — AutoCDA Verification API.
 *
 * "The SPICE-verified truth layer for AI circuit design." Any tool/LLM can POST a
 * circuit intent and get back a verified, buyable design: real component values,
 * the ngspice-measured result, honest error, the netlist, and a bill of materials.
 *
 * Reuses the exact app design/verify code (via server/loader.mjs, which resolves
 * the app's extensionless ESM imports). ngspice runs server-side, so there is no
 * per-call AI cost — the engine is deterministic.
 *
 * Run:  node --import ./server/loader.mjs server/apiServer.mjs
 *       npm run verify-api
 *
 * Endpoints (JSON, CORS enabled):
 *   GET  /api/health                       -> { ok, types }
 *   GET  /api/types                        -> [{ id, name, fields }]
 *   POST /api/parse    { prompt }          -> { type, targets, constraints, confidence, assumed }
 *   POST /api/verify   { prompt } | { type, targets, constraints?, strategy? }
 *                                          -> verified design + measured error + netlist + BOM
 */
import http from "node:http";
import { orchestrate } from "../src/agents/orchestrator.js";
import { runSpice } from "../src/sim/spice.js";
import { makeSpec, SUPPORTED_TYPES } from "../src/spec/circuitSpec.js";
import { parsePrompt } from "../src/utils/circuitParser.js";
import { buildBOM } from "../src/design/bom.js";

const PORT = process.env.VERIFY_API_PORT || 3002;

const readBody = (req) =>
  new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => (b += c));
    req.on("end", () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve(null); } });
  });

const send = (res, code, obj) => {
  res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" });
  res.end(JSON.stringify(obj));
};

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

async function verify(body) {
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

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "GET" && url.pathname === "/api/health")
    return send(res, 200, { ok: true, service: "autocda-verify-api", types: SUPPORTED_TYPES.length });
  if (req.method === "GET" && url.pathname === "/api/types")
    return send(res, 200, SUPPORTED_TYPES.map((t) => ({ id: t.id, name: t.name, fields: t.fields })));

  if (req.method === "POST" && (url.pathname === "/api/verify" || url.pathname === "/api/parse")) {
    const body = await readBody(req);
    if (body == null) return send(res, 400, { ok: false, error: "invalid JSON" });
    try {
      if (url.pathname === "/api/parse") {
        if (!body.prompt) return send(res, 400, { ok: false, error: "provide { prompt }" });
        return send(res, 200, { ok: true, ...parsePrompt(body.prompt) });
      }
      const { status, payload } = await verify(body);
      return send(res, status, payload);
    } catch (e) {
      return send(res, 500, { ok: false, error: String(e.message || e) });
    }
  }
  return send(res, 404, { ok: false, error: "not found", see: "/api/health, /api/types, POST /api/parse, POST /api/verify" });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[verify-api] http://localhost:${PORT}  —  ${SUPPORTED_TYPES.length} circuit types, ngspice server-side`);
});
