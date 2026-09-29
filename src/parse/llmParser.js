/**
 * llmParser.js — structured-output LLM fallback for the circuit-intent parser.
 *
 * The regex parser (src/utils/circuitParser.js) is the instant, offline fast
 * path. When it is unsure, this module asks Claude to extract the intent using
 * tool-calling with a constrained JSON schema, so the model can only return one
 * of the supported circuit types, never an invented one. The result is mapped
 * through makeSpec() so defaults and validation are applied uniformly.
 *
 * The API key is read from REACT_APP_ANTHROPIC_KEY. If it is absent, parseWithLLM
 * throws "LLM parser unavailable (no key)" so the caller can fall back to the
 * regex result gracefully. The app is fully functional with no key set.
 *
 * SECURITY NOTE: a REACT_APP_* var is embedded in the client bundle, so this
 * calls the Anthropic API directly from the browser (with the direct-browser
 * access header). That is fine for local/demo use; a production deployment
 * should proxy the request through a server so the key is never shipped.
 */

import { makeSpec, SUPPORTED_TYPES } from "../spec/circuitSpec";

const MODEL = "claude-sonnet-5";
const API_URL = "https://api.anthropic.com/v1/messages";
const TYPE_ENUM = SUPPORTED_TYPES.map((t) => t.id);

const SYSTEM_PROMPT =
  "You extract analog circuit design intent. Output only the structured fields.";

// One tool with a schema that constrains the type to the 10 supported ids.
const TOOL = {
  name: "emit_circuit_spec",
  description:
    "Return the analog circuit type and its numeric design targets extracted from the user's request.",
  input_schema: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: TYPE_ENUM,
        description: "The single best-matching supported circuit type.",
      },
      targets: {
        type: "object",
        description:
          "Numeric design targets keyed by field (e.g. fc in Hz, Vin/Vout/Vsupply/Vz in V, I in A, Av unitless, fL/fH in Hz). Use base SI units. Omit a field if not stated.",
      },
      confidence: {
        type: "number",
        description: "0..1 confidence that the type and targets are correct.",
      },
    },
    required: ["type", "targets", "confidence"],
  },
};

/**
 * Extract a CircuitSpec from arbitrary phrasing via the Anthropic API.
 * @param {string} text
 * @returns {Promise<import('../spec/circuitSpec').CircuitSpec>}
 * @throws if no key is configured, or the request/response fails.
 */
export async function parseWithLLM(text, { fetchImpl = fetch } = {}) {
  const key = process.env.REACT_APP_ANTHROPIC_KEY;
  if (!key) throw new Error("LLM parser unavailable (no key)");

  const res = await fetchImpl(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{ role: "user", content: text }],
    }),
  });

  if (!res.ok) {
    let detail = "";
    try { detail = (await res.text()).slice(0, 200); } catch { /* ignore */ }
    throw new Error(`LLM request failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }

  const data = await res.json();
  const block = (data.content || []).find((b) => b.type === "tool_use");
  if (!block || !block.input) throw new Error("LLM returned no structured output");

  return mapToSpec(block.input);
}

/**
 * Map the model's raw tool output into a validated CircuitSpec. Exported for
 * unit testing without a network call.
 * @param {{type:string, targets?:object, confidence?:number}} raw
 */
export function mapToSpec(raw) {
  const { type, targets = {}, confidence } = raw || {};

  if (!TYPE_ENUM.includes(type)) {
    throw new Error(`LLM returned unsupported type "${type}"`);
  }

  const def = SUPPORTED_TYPES.find((t) => t.id === type);
  const cleanTargets = {};
  const assumed = [];

  for (const field of def.fields) {
    const raw = targets[field];
    const n = raw == null ? NaN : Number(raw);
    if (Number.isFinite(n)) {
      cleanTargets[field] = n;
    } else {
      assumed.push(`${field} was not specified by the request; please set it`);
    }
  }

  return makeSpec({
    type,
    targets: cleanTargets,
    confidence: typeof confidence === "number" ? confidence : 0.7,
    assumed,
  });
}
