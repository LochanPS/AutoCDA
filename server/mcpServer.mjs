/**
 * mcpServer.mjs — AutoCDA as an MCP server. "The SPICE-verified truth-layer for AI."
 *
 * Any MCP-capable agent (Claude Desktop, Claude Code, Cursor, …) can call these
 * tools mid-reasoning to get a *verified* circuit — real component values, the
 * ngspice-measured result, honest error, netlist, and a priced BOM — instead of a
 * plausible-looking guess. The model proposes; the deterministic simulator decides.
 *
 * Transport: stdio, newline-delimited JSON-RPC 2.0 (the MCP stdio framing). No SDK,
 * no network, no cold start — it runs in-process next to the agent. Same core as the
 * HTTP API (server/apiCore.mjs), so a verify here and a verify over HTTP agree.
 *
 * Run:  node --import ./server/loader.mjs server/mcpServer.mjs
 *       npm run mcp
 *
 * Register with an agent (example — Claude Desktop claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "autocda": {
 *         "command": "node",
 *         "args": ["--import", "./server/loader.mjs", "server/mcpServer.mjs"],
 *         "cwd": "/absolute/path/to/autocda"
 *       }
 *     }
 *   }
 *
 * Tools:
 *   verify_circuit      prompt | {type,targets,constraints?,strategy?} -> verified design + BOM + netlist
 *   parse_prompt        {prompt}                                       -> structured spec (no design step)
 *   compose_circuit     {stages:[{type,targets}]}                      -> cascaded circuit, measured end-to-end
 *   list_circuit_types  {}                                             -> the supported types + target fields
 */
import { listTypes, runParse, runVerify, runCompose, SUPPORTED_TYPES } from "./apiCore.mjs";

const PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "autocda-verify", version: "1.0.0" };

// ── tool definitions ───────────────────────────────────────────────────────────
const TOOLS = [
  {
    name: "verify_circuit",
    description:
      "Design and SPICE-VERIFY an analog circuit. Give a plain-English prompt (e.g. " +
      '"low-pass filter at 1 kHz") or an explicit {type, targets}. Returns the chosen ' +
      "component values, the ngspice-MEASURED result, the honest error vs target, whether " +
      "it converged within tolerance, the netlist, and a priced bill of materials. Use this " +
      "whenever you need real, buildable values instead of a guess.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Natural-language circuit request." },
        type: { type: "string", description: "Explicit circuit type id (see list_circuit_types). Alternative to prompt." },
        targets: { type: "object", description: "Target values for the type, e.g. {\"Vin\":9,\"Vout\":3.3} or {\"fc\":1000}." },
        constraints: { type: "object", description: "Optional constraints, e.g. {\"eSeries\":\"E96\"}." },
        strategy: { type: "string", enum: ["reasoning", "grid"], description: "Search strategy; default reasoning." },
      },
    },
  },
  {
    name: "parse_prompt",
    description:
      "Parse a plain-English circuit request into a structured spec (type, targets, " +
      "constraints, confidence, and which values were assumed) WITHOUT designing or " +
      "simulating. Use to inspect how a prompt is understood before committing to verify.",
    inputSchema: {
      type: "object",
      properties: { prompt: { type: "string", description: "Natural-language circuit request." } },
      required: ["prompt"],
    },
  },
  {
    name: "compose_circuit",
    description:
      "Cascade multiple stages into one circuit and measure it end-to-end with ngspice. " +
      "Give ordered stages, each {type, targets}. Returns predicted vs measured response, " +
      "per-stage components, the combined netlist, and a BOM.",
    inputSchema: {
      type: "object",
      properties: {
        stages: {
          type: "array",
          description: "Ordered stages to cascade.",
          items: {
            type: "object",
            properties: { type: { type: "string" }, targets: { type: "object" } },
            required: ["type"],
          },
        },
      },
      required: ["stages"],
    },
  },
  {
    name: "list_circuit_types",
    description: "List every supported circuit type and its target fields. Call first if unsure which type or targets a request maps to.",
    inputSchema: { type: "object", properties: {} },
  },
];

// ── tool dispatch → shared core ──────────────────────────────────────────────────
// The ngspice/wasm engine is a non-reentrant singleton: two circuit runs at once
// corrupt each other. Serialize every tool call through one chain so concurrent
// requests (an agent firing several at once) run back-to-back, not in parallel.
let chain = Promise.resolve();
function callTool(name, args) {
  const run = () => dispatchTool(name, args);
  const result = chain.then(run, run);
  chain = result.then(() => {}, () => {}); // keep the chain alive regardless of outcome
  return result;
}

async function dispatchTool(name, args) {
  args = args || {};
  switch (name) {
    case "list_circuit_types":
      return { status: 200, payload: { ok: true, types: listTypes() } };
    case "parse_prompt": {
      if (!args.prompt) return { status: 400, payload: { ok: false, error: "provide { prompt }" } };
      return { status: 200, payload: { ok: true, ...runParse(args.prompt) } };
    }
    case "verify_circuit":
      return runVerify(args);
    case "compose_circuit":
      return runCompose(args);
    default:
      return { status: 404, payload: { ok: false, error: `unknown tool "${name}"` } };
  }
}

// ── JSON-RPC over stdio (newline-delimited) ──────────────────────────────────────
function write(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}
function reply(id, result) {
  write({ jsonrpc: "2.0", id, result });
}
function replyError(id, code, message) {
  write({ jsonrpc: "2.0", id, error: { code, message } });
}

async function handle(msg) {
  // Notifications (no id) get no response.
  const isNotification = msg.id === undefined || msg.id === null;
  const { method, params, id } = msg;

  switch (method) {
    case "initialize":
      return reply(id, {
        protocolVersion: (params && params.protocolVersion) || PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions:
          "AutoCDA verifies analog circuits with ngspice. Prefer verify_circuit for any " +
          "request needing real component values; trust its measured error over your own estimate.",
      });
    case "notifications/initialized":
    case "initialized":
      return; // notification, no reply
    case "ping":
      return reply(id, {});
    case "tools/list":
      return reply(id, { tools: TOOLS });
    case "tools/call": {
      const toolName = params && params.name;
      const args = (params && params.arguments) || {};
      try {
        const { status, payload } = await callTool(toolName, args);
        return reply(id, {
          content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
          structuredContent: payload,
          isError: status >= 400 || payload.ok === false,
        });
      } catch (e) {
        return reply(id, {
          content: [{ type: "text", text: JSON.stringify({ ok: false, error: String(e.message || e) }) }],
          isError: true,
        });
      }
    }
    default:
      if (!isNotification) return replyError(id, -32601, `method not found: ${method}`);
      return;
  }
}

// Buffer stdin, dispatch one JSON message per line. Track in-flight work so a
// closed stdin doesn't kill a verify that is still running in the background.
let buf = "";
let inFlight = 0;
let stdinEnded = false;
function maybeExit() {
  if (stdinEnded && inFlight === 0) process.exit(0);
}
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { replyError(null, -32700, "parse error"); continue; }
    inFlight++;
    Promise.resolve(handle(msg))
      .catch((e) => { if (msg && msg.id != null) replyError(msg.id, -32603, String(e.message || e)); })
      .finally(() => { inFlight--; maybeExit(); });
  }
});
process.stdin.on("end", () => { stdinEnded = true; maybeExit(); });

// eslint-disable-next-line no-console
console.error(`[mcp] autocda-verify ready on stdio — ${SUPPORTED_TYPES.length} circuit types, ngspice in-process`);
