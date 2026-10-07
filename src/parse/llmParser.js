/**
 * llmParser.js — structured-output LLM fallback for the circuit-intent parser.
 *
 * The regex parser (src/utils/circuitParser.js) is the instant, offline fast path.
 * When it is unsure, this asks an LLM to extract the intent via tool/function
 * calling with a constrained schema, so the model can only return a supported type,
 * never an invented one. The result is mapped through makeSpec() so defaults and
 * validation are applied uniformly.
 *
 * Two providers, selected by whichever key is present (OpenRouter first):
 *   - OpenRouter (OpenAI-compatible): OPENROUTER_API_KEY [+ OPENROUTER_MODEL]
 *   - Anthropic (native):             REACT_APP_ANTHROPIC_KEY [+ ANTHROPIC_MODEL]
 * With no key, parseWithLLM throws "LLM parser unavailable (no key)" and the caller
 * falls back to the regex result. The app is fully functional with no key set.
 *
 * SECURITY: never hard-code a key. In the browser a REACT_APP_* var is embedded in
 * the bundle (demo only — proxy through a server in production). On the server read
 * the key from the environment (.env, never committed).
 */

import { makeSpec, SUPPORTED_TYPES } from "../spec/circuitSpec";

const TYPE_ENUM = SUPPORTED_TYPES.map((t) => t.id);

const SYSTEM_PROMPT =
  "You extract analog circuit design intent. Output only the structured fields.";

// Shared tool schema (the function parameters), provider-agnostic.
const TOOL_NAME = "emit_circuit_spec";
const TOOL_DESCRIPTION =
  "Return the analog circuit type and its numeric design targets extracted from the user's request.";
const TOOL_PARAMETERS = {
  type: "object",
  properties: {
    type: { type: "string", enum: TYPE_ENUM, description: "The single best-matching supported circuit type." },
    targets: {
      type: "object",
      description:
        "Numeric design targets keyed by field (fc/fL/fH in Hz, Vin/Vout/Vsupply/Vz in V, I in A, Av unitless). Base SI units. Omit a field if not stated.",
    },
    confidence: { type: "number", description: "0..1 confidence that the type and targets are correct." },
  },
  required: ["type", "targets", "confidence"],
};

const env = (k) => (typeof process !== "undefined" && process.env ? process.env[k] : undefined);

/** Which provider to use, and its config — OpenRouter preferred when both are set. */
export function selectProvider() {
  const or = env("OPENROUTER_API_KEY");
  if (or) {
    return {
      name: "openrouter",
      key: or,
      url: "https://openrouter.ai/api/v1/chat/completions",
      // Default to a FREE model so a $0 OpenRouter key works out of the box. Paid
      // models (e.g. anthropic/claude-3.5-sonnet) need credits — set OPENROUTER_MODEL
      // to one if you've funded the account. Free slugs rotate: see
      // https://openrouter.ai/models?max_price=0
      model: env("OPENROUTER_MODEL") || "meta-llama/llama-3.3-70b-instruct:free",
    };
  }
  const an = env("REACT_APP_ANTHROPIC_KEY");
  if (an) {
    return {
      name: "anthropic",
      key: an,
      url: "https://api.anthropic.com/v1/messages",
      model: env("ANTHROPIC_MODEL") || "claude-sonnet-5",
    };
  }
  return null;
}

// Instruction appended for JSON-mode providers (free models rarely do forced
// function-calling, but will return a JSON object when asked plainly).
const JSON_INSTRUCTION =
  `Respond with ONLY a JSON object, no prose and no markdown fences: ` +
  `{"type": one of [${TYPE_ENUM.join(", ")}], "targets": an object of numeric fields, "confidence": 0..1}.`;

/** Pull the first balanced JSON object out of free-form model text. Exported for tests. */
export function extractJsonObject(text) {
  if (typeof text !== "string") throw new Error("LLM returned no content");
  const s = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  if (i < 0 || j < 0 || j < i) throw new Error("no JSON object in LLM response");
  return JSON.parse(s.slice(i, j + 1));
}

/** Pull the structured spec args out of a provider response. Exported for tests. */
export function extractSpecArgs(provider, data) {
  if (provider === "openrouter") {
    // JSON mode: the spec is the JSON object in the message content.
    const content = data?.choices?.[0]?.message?.content;
    return extractJsonObject(content);
  }
  // anthropic: forced tool_use block.
  const block = (data.content || []).find((b) => b.type === "tool_use");
  if (!block || !block.input) throw new Error("LLM returned no structured output");
  return block.input;
}

/**
 * Extract a CircuitSpec from arbitrary phrasing via the configured LLM.
 * @param {string} text
 * @returns {Promise<import('../spec/circuitSpec').CircuitSpec>}
 */
export async function parseWithLLM(text, { fetchImpl = (typeof fetch !== "undefined" ? fetch : null) } = {}) {
  const p = selectProvider();
  if (!p) throw new Error("LLM parser unavailable (no key)");
  if (!fetchImpl) throw new Error("no fetch implementation");

  let headers, body;
  if (p.name === "openrouter") {
    headers = {
      "content-type": "application/json",
      authorization: `Bearer ${p.key}`,
      "HTTP-Referer": "https://auto-cda-phi.vercel.app",
      "X-Title": "AutoCDA",
    };
    // JSON mode, not function-calling: works on free OpenRouter models that don't
    // support forced tool calls. response_format is a hint; the parser is tolerant
    // of models that ignore it and just return the object (or wrap it in fences).
    body = {
      model: p.model,
      messages: [
        { role: "system", content: `${SYSTEM_PROMPT} ${JSON_INSTRUCTION}` },
        { role: "user", content: text },
      ],
      response_format: { type: "json_object" },
      max_tokens: 400,
    };
  } else {
    headers = {
      "content-type": "application/json",
      "x-api-key": p.key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    };
    body = {
      model: p.model,
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      tools: [{ name: TOOL_NAME, description: TOOL_DESCRIPTION, input_schema: TOOL_PARAMETERS }],
      tool_choice: { type: "tool", name: TOOL_NAME },
      messages: [{ role: "user", content: text }],
    };
  }

  const res = await fetchImpl(p.url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.text()).slice(0, 200); } catch { /* ignore */ }
    throw new Error(`LLM request failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }
  const data = await res.json();
  return mapToSpec(extractSpecArgs(p.name, data));
}

/**
 * Map the model's raw tool output into a validated CircuitSpec. Exported for tests.
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
    const r = targets[field];
    const nmbr = r == null ? NaN : Number(r);
    if (Number.isFinite(nmbr)) cleanTargets[field] = nmbr;
    else assumed.push(`${field} was not specified by the request; please set it`);
  }
  return makeSpec({
    type,
    targets: cleanTargets,
    confidence: typeof confidence === "number" ? confidence : 0.7,
    assumed,
  });
}
