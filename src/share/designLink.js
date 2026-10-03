/**
 * designLink.js — encode a design into a shareable URL hash, and back.
 *
 * A design (type, targets, constraints, components) is JSON-serialized, then
 * compressed with lz-string's URI-safe codec (already a dependency) and placed
 * in the URL hash as `#d=<blob>`. Opening that link decodes the payload; the app
 * rebuilds the spec and re-runs the SPICE-graded loop, so a link reproduces AND
 * re-verifies the design with no backend.
 *
 * Pure module — the only ambient dependency is an optional `location` passed in.
 */

import LZString from "lz-string";
import { SUPPORTED_TYPES } from "../spec/circuitSpec";

export const HASH_KEY = "d";
const KNOWN_TYPES = new Set(SUPPORTED_TYPES.map((t) => t.id));

// Compact on-wire shape keeps the blob short: short keys, only the fields a
// reload needs. Components are stored for reference/fallback; re-verification
// regenerates them deterministically from the spec.
function compact({ type, targets, constraints, components } = {}) {
  return {
    v: 1,
    t: type,
    g: targets || {},
    c: {
      e: (constraints && constraints.eSeries) || "E24",
      x: constraints && constraints.tolerance != null ? constraints.tolerance : 0.05,
      m: constraints && constraints.maxCost != null ? constraints.maxCost : null,
    },
    p: (components || [])
      .filter((c) => c && c.rawValue != null)
      .map((c) => ({ r: c.ref, v: c.rawValue, u: c.unit })),
  };
}

function expand(o) {
  if (!o || o.v !== 1 || typeof o.t !== "string" || !KNOWN_TYPES.has(o.t)) return null;
  const c = o.c || {};
  return {
    type: o.t,
    targets: o.g && typeof o.g === "object" ? { ...o.g } : {},
    constraints: {
      eSeries: typeof c.e === "string" ? c.e : "E24",
      tolerance: typeof c.x === "number" ? c.x : 0.05,
      maxCost: typeof c.m === "number" ? c.m : null,
    },
    components: Array.isArray(o.p)
      ? o.p.map((p) => ({ ref: p.r, rawValue: p.v, unit: p.u }))
      : [],
  };
}

/** Encode a design to a URI-safe compressed string. */
export function encodeDesign(design) {
  return LZString.compressToEncodedURIComponent(JSON.stringify(compact(design)));
}

/** Decode a blob back to a design, or null if it is missing/corrupt/unknown. */
export function decodeDesign(blob) {
  if (!blob || typeof blob !== "string") return null;
  try {
    const json = LZString.decompressFromEncodedURIComponent(blob);
    if (!json) return null;
    return expand(JSON.parse(json));
  } catch {
    return null;
  }
}

/** Build a full shareable URL (origin + path + `#d=<blob>`) for a design. */
export function buildShareUrl(design, location) {
  const loc = location || (typeof window !== "undefined" ? window.location : null);
  const base = loc ? `${loc.origin}${loc.pathname}` : "";
  return `${base}#${HASH_KEY}=${encodeDesign(design)}`;
}

/** Read a design out of a location hash string (e.g. "#d=..."), or null. */
export function readDesignFromHash(hash) {
  if (!hash || typeof hash !== "string") return null;
  const h = hash.replace(/^#/, "");
  // Support "d=..." possibly among other &-separated params.
  for (const part of h.split("&")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq) === HASH_KEY) return decodeDesign(part.slice(eq + 1));
  }
  return null;
}
