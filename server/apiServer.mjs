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
 * Config (all env, all optional — safe defaults, no secrets in the repo):
 *   PORT / VERIFY_API_PORT   listen port (host PORT wins; default 3002)
 *   CORS_ORIGIN              comma-list of allowed origins, or "*" (default "*")
 *   MAX_BODY_BYTES           request-body cap (default 65536)
 *   API_KEYS                 "key1=600,key2" — per-key req/window limit (default KEYED_RATE_LIMIT)
 *   KEYED_RATE_LIMIT         default limit for keys with no explicit number (default 120)
 *   ANON_RATE_LIMIT          free anonymous (no/unknown key) limit per window (default 10)
 *   RATE_WINDOW_MS           rate-limit window (default 60000)
 *   USAGE_FILE               optional path to persist per-key usage counts as JSON
 *
 * Endpoints (JSON, CORS enabled):
 *   GET  /api/health                       -> { ok, types }      (no auth, no rate limit)
 *   GET  /api/usage                        -> { tier, limit, used, windowRemaining }
 *   GET  /api/types                        -> [{ id, name, fields }]
 *   POST /api/parse    { prompt }          -> { type, targets, constraints, confidence, assumed }
 *   POST /api/verify   { prompt } | { type, targets, constraints?, strategy? }
 *                                          -> verified design + measured error + netlist + BOM
 *   POST /api/compose  { stages:[{type,targets}] }
 *                                          -> cascaded multi-stage circuit, measured end-to-end
 *
 * Auth: send your key as `x-api-key: <key>` or `Authorization: Bearer <key>`.
 * No key = free anonymous tier (low limit). Unknown key = 401.
 */
import http from "node:http";
import fs from "node:fs";
import { orchestrate } from "../src/agents/orchestrator.js";
import { runSpice } from "../src/sim/spice.js";
import { makeSpec, SUPPORTED_TYPES } from "../src/spec/circuitSpec.js";
import { parsePrompt } from "../src/utils/circuitParser.js";
import { buildBOM } from "../src/design/bom.js";
import { composeCircuit, verifyComposition } from "../src/design/compose.js";

const PORT = process.env.PORT || process.env.VERIFY_API_PORT || 3002;

// ── CORS ─────────────────────────────────────────────────────────────────────
const CORS_ORIGINS = (process.env.CORS_ORIGIN || "*")
  .split(",").map((s) => s.trim()).filter(Boolean);
const CORS_WILDCARD = CORS_ORIGINS.length === 1 && CORS_ORIGINS[0] === "*";
function corsHeaders(origin) {
  let allow = "*";
  if (!CORS_WILDCARD) allow = origin && CORS_ORIGINS.includes(origin) ? origin : CORS_ORIGINS[0];
  return {
    "access-control-allow-origin": allow,
    vary: "Origin",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, x-api-key, authorization",
    "access-control-max-age": "86400",
  };
}

// ── request-body cap ──────────────────────────────────────────────────────────
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 65536);
const TOO_LARGE = Symbol("too_large");
const readBody = (req) =>
  new Promise((resolve) => {
    let size = 0, aborted = false;
    const chunks = [];
    req.on("data", (c) => {
      if (aborted) return;
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        // Stop buffering and let the handler reply 413. Don't destroy the socket:
        // that would reset the connection before the response is written. Remaining
        // chunks are dropped (not buffered), so memory stays bounded.
        aborted = true;
        chunks.length = 0;
        resolve(TOO_LARGE);
        req.resume();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (aborted) return;
      const b = Buffer.concat(chunks).toString("utf8");
      try { resolve(b ? JSON.parse(b) : {}); } catch { resolve(null); }
    });
    req.on("error", () => { if (!aborted) resolve(null); });
  });

// ── API keys + tiers ───────────────────────────────────────────────────────────
const KEYED_DEFAULT = Number(process.env.KEYED_RATE_LIMIT || 120);
const ANON_LIMIT = Number(process.env.ANON_RATE_LIMIT || 10);
const WINDOW_MS = Number(process.env.RATE_WINDOW_MS || 60000);
const KEY_LIMITS = new Map(); // key -> limit per window
for (const entry of (process.env.API_KEYS || "").split(",").map((s) => s.trim()).filter(Boolean)) {
  const [k, lim] = entry.split("=");
  if (k) KEY_LIMITS.set(k.trim(), lim ? Number(lim) : KEYED_DEFAULT);
}

function callerFrom(req) {
  const raw = req.headers["x-api-key"] || String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const key = String(raw).trim();
  if (key) {
    if (KEY_LIMITS.has(key)) return { id: "key:" + key, tier: "keyed", limit: KEY_LIMITS.get(key) };
    return { invalidKey: true };
  }
  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "anon";
  return { id: "anon:" + ip, tier: "anon", limit: ANON_LIMIT };
}

// ── rate limiting (fixed window) + usage counting ──────────────────────────────
const buckets = new Map(); // id -> { count, resetAt }
const usage = new Map();   // id -> lifetime count
const USAGE_FILE = process.env.USAGE_FILE || "";
if (USAGE_FILE) {
  try {
    const j = JSON.parse(fs.readFileSync(USAGE_FILE, "utf8"));
    for (const [k, v] of Object.entries(j)) usage.set(k, Number(v) || 0);
  } catch { /* first run / missing file */ }
}
let flushTimer = null;
function scheduleFlush() {
  if (!USAGE_FILE || flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    try { fs.writeFileSync(USAGE_FILE, JSON.stringify(Object.fromEntries(usage))); } catch { /* ignore */ }
  }, 5000);
  flushTimer.unref?.();
}
function rateCheck(caller) {
  const now = Date.now();
  let b = buckets.get(caller.id);
  if (!b || now >= b.resetAt) { b = { count: 0, resetAt: now + WINDOW_MS }; buckets.set(caller.id, b); }
  b.count++;
  usage.set(caller.id, (usage.get(caller.id) || 0) + 1);
  return { ok: b.count <= caller.limit, limit: caller.limit, remaining: Math.max(0, caller.limit - b.count), resetAt: b.resetAt };
}
// Prune expired buckets so anon-IP churn can't grow memory without bound.
const pruneTimer = setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (now >= b.resetAt) buckets.delete(k);
}, WINDOW_MS);
pruneTimer.unref?.();

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
  const cors = corsHeaders(req.headers.origin);
  const send = (code, obj, extra = {}) => {
    res.writeHead(code, { "content-type": "application/json", ...cors, ...extra });
    res.end(JSON.stringify(obj));
  };

  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // Health: unauthenticated + unthrottled so host probes always succeed.
  if (req.method === "GET" && url.pathname === "/api/health")
    return send(200, { ok: true, service: "autocda-verify-api", types: SUPPORTED_TYPES.length });

  // Identify + authenticate caller.
  const caller = callerFrom(req);
  if (caller.invalidKey) return send(401, { ok: false, error: "invalid API key" });

  // Rate limit everything past health.
  const rl = rateCheck(caller);
  scheduleFlush();
  const rlHeaders = {
    "x-ratelimit-limit": String(rl.limit),
    "x-ratelimit-remaining": String(rl.remaining),
    "x-ratelimit-reset": String(Math.ceil(rl.resetAt / 1000)),
  };
  if (!rl.ok) {
    const retryS = Math.ceil((rl.resetAt - Date.now()) / 1000);
    return send(429, { ok: false, error: "rate limit exceeded", tier: caller.tier, limit: rl.limit, retryAfterSeconds: retryS },
      { ...rlHeaders, "retry-after": String(retryS) });
  }

  if (req.method === "GET" && url.pathname === "/api/usage")
    return send(200, { ok: true, tier: caller.tier, limit: caller.limit, used: usage.get(caller.id) || 0, windowRemaining: rl.remaining }, rlHeaders);

  if (req.method === "GET" && url.pathname === "/api/types")
    return send(200, SUPPORTED_TYPES.map((t) => ({ id: t.id, name: t.name, fields: t.fields })), rlHeaders);

  if (req.method === "POST" && url.pathname === "/api/compose") {
    const body = await readBody(req);
    if (body === TOO_LARGE) return send(413, { ok: false, error: `payload exceeds ${MAX_BODY_BYTES} bytes` }, rlHeaders);
    if (body == null || !Array.isArray(body.stages)) return send(400, { ok: false, error: "provide { stages: [{type, targets}] }" }, rlHeaders);
    try {
      const comp = composeCircuit(body.stages);
      const v = await verifyComposition(comp, { runSpice });
      const bom = buildBOM(comp.components);
      return send(200, {
        ok: true,
        stages: comp.stages,
        predicted: comp.predicted,
        measureKind: comp.measureKind,
        measured: v.measured,
        errors: v.errors,
        components: comp.components.map((c) => ({ ref: c.ref, value: c.display, unit: c.unit, stage: c.stage })),
        bom: { rows: bom.rows, total: bom.total },
        netlist: comp.netlist,
      }, rlHeaders);
    } catch (e) {
      return send(422, { ok: false, error: String(e.message || e) }, rlHeaders);
    }
  }

  if (req.method === "POST" && (url.pathname === "/api/verify" || url.pathname === "/api/parse")) {
    const body = await readBody(req);
    if (body === TOO_LARGE) return send(413, { ok: false, error: `payload exceeds ${MAX_BODY_BYTES} bytes` }, rlHeaders);
    if (body == null) return send(400, { ok: false, error: "invalid JSON" }, rlHeaders);
    try {
      if (url.pathname === "/api/parse") {
        if (!body.prompt) return send(400, { ok: false, error: "provide { prompt }" }, rlHeaders);
        return send(200, { ok: true, ...parsePrompt(body.prompt) }, rlHeaders);
      }
      const { status, payload } = await verify(body);
      return send(status, payload, rlHeaders);
    } catch (e) {
      return send(500, { ok: false, error: String(e.message || e) }, rlHeaders);
    }
  }
  return send(404, { ok: false, error: "not found", see: "/api/health, /api/usage, /api/types, POST /api/parse, POST /api/verify, POST /api/compose" }, rlHeaders);
});

server.listen(PORT, () => {
  const keyed = KEY_LIMITS.size;
  // eslint-disable-next-line no-console
  console.log(`[verify-api] http://localhost:${PORT}  —  ${SUPPORTED_TYPES.length} circuit types, ngspice server-side`);
  // eslint-disable-next-line no-console
  console.log(`[verify-api] cors=${CORS_WILDCARD ? "*" : CORS_ORIGINS.join(",")}  anon=${ANON_LIMIT}/win  keyedKeys=${keyed}  window=${WINDOW_MS}ms  bodyCap=${MAX_BODY_BYTES}B`);
});
