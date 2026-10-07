/**
 * designFile.js — save a design to a portable `.autocda.json` file and read it
 * back (Theme E1: portable designs).
 *
 * The URL-share model (designLink.js) keeps work movable, and localStorage
 * (designStore.js) keeps a "My designs" list, but both live inside one browser.
 * A design *file* lets a user save to device and resume later on any machine —
 * no account, by design. The file is plain JSON so it is diffable, inspectable,
 * and future-proof.
 *
 * On-disk shape (wrapped, self-describing):
 *   { magic, v, name, savedAt, design: { type, targets, constraints, components } }
 *
 * parseDesignFile also accepts a bare design object (the inner `design` shape)
 * so hand-written or older files still load. Unknown circuit types are rejected
 * up front with a readable message rather than failing deep in makeSpec.
 *
 * Pure module — no DOM, no network. The caller handles the download/upload I/O.
 */

import { SUPPORTED_TYPES } from "../spec/circuitSpec";

export const DESIGN_FILE_EXT = ".autocda.json";
export const DESIGN_FILE_VERSION = 1;

const MAGIC = "autocda.design";
const KNOWN_TYPES = new Set(SUPPORTED_TYPES.map((t) => t.id));

function normConstraints(c = {}) {
  return {
    eSeries: typeof c.eSeries === "string" ? c.eSeries : "E24",
    tolerance: typeof c.tolerance === "number" ? c.tolerance : 0.05,
    maxCost: typeof c.maxCost === "number" ? c.maxCost : null,
  };
}

/**
 * Serialize a design to the pretty-printed file text.
 * @param {{type,targets,constraints,components}} design
 * @param {{name?: string}} [opts]
 * @returns {string} JSON text to write to `<name>.autocda.json`
 */
export function toDesignFile(design, { name } = {}) {
  const d = design || {};
  const payload = {
    magic: MAGIC,
    v: DESIGN_FILE_VERSION,
    name: (name || d.type || "design").slice(0, 120),
    savedAt: new Date().toISOString(),
    design: {
      type: d.type,
      targets: { ...(d.targets || {}) },
      constraints: normConstraints(d.constraints),
      components: (d.components || [])
        .filter((c) => c && c.rawValue != null)
        .map((c) => ({ ref: c.ref, rawValue: c.rawValue, unit: c.unit })),
    },
  };
  return JSON.stringify(payload, null, 2) + "\n";
}

/**
 * Parse file text back into a design payload.
 * @param {string} text
 * @returns {{ok: true, design: object, name: string} | {ok: false, error: string}}
 */
export function parseDesignFile(text) {
  if (!text || typeof text !== "string") return { ok: false, error: "The file is empty." };

  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn’t valid JSON." };
  }

  // Reject files that declare a different magic; accept wrapped or bare shapes.
  if (obj && obj.magic && obj.magic !== MAGIC) {
    return { ok: false, error: "That file isn’t an AutoCDA design." };
  }
  const body = obj && obj.design && typeof obj.design === "object" ? obj.design : obj;

  if (!body || typeof body.type !== "string") {
    return { ok: false, error: "That file doesn’t describe a design." };
  }
  if (!KNOWN_TYPES.has(body.type)) {
    return { ok: false, error: "That design’s circuit type isn’t recognized — it may be from a newer version." };
  }

  const design = {
    type: body.type,
    targets: body.targets && typeof body.targets === "object" ? { ...body.targets } : {},
    constraints: normConstraints(body.constraints),
    components: Array.isArray(body.components)
      ? body.components
          .filter((p) => p && p.ref)
          .map((p) => ({ ref: p.ref, rawValue: p.rawValue, unit: p.unit }))
      : [],
  };
  const name = (obj && typeof obj.name === "string" && obj.name) || design.type;
  return { ok: true, design, name };
}

/** Turn a design name into a safe `.autocda.json` filename. */
export function designFileName(name) {
  const safe = String(name || "design")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60) || "design";
  return `${safe}${DESIGN_FILE_EXT}`;
}
