/**
 * repro.js — reproducibility stamp (Theme B5).
 *
 * A verified result is only trustworthy if someone else can re-run the exact same
 * thing and get the exact same number. Every verified design therefore carries:
 *   • the engine that measured it (name + version), and
 *   • a hash of the precise netlist that was simulated.
 *
 * The hash is over the *canonical* netlist text (comments and blank lines dropped,
 * whitespace collapsed, lower-cased), so cosmetic differences don't change it but
 * any real electrical change does. Pure and dependency-free.
 */

// Bump when the eecircuit-engine dependency is upgraded (keep in sync with
// node_modules/eecircuit-engine/package.json "version"). Kept as a constant
// rather than importing the package JSON so this module stays pure and portable
// across the app bundle, the Node benchmark, and tests.
export const ENGINE = "ngspice (eecircuit-engine wasm)";
export const ENGINE_VERSION = "1.8.0";
export const HASH_ALGO = "fnv1a32";

/**
 * Canonicalize a SPICE netlist for hashing: strip comment lines (`*` / leading
 * `;`), drop blank lines, collapse internal whitespace, lower-case, and join with
 * single newlines. Electrically-identical decks hash identically; any value,
 * topology, or analysis-directive change flips the hash.
 */
export function canonicalizeNetlist(netlist) {
  if (!netlist) return "";
  return String(netlist)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("*") && !line.startsWith(";"))
    .map((line) => line.replace(/\s+/g, " ").toLowerCase())
    .join("\n");
}

/**
 * FNV-1a 32-bit hash of a string → 8-char lowercase hex. Deterministic, fast, no
 * crypto dependency (this is an integrity/identity tag, not a security hash).
 */
export function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    // h *= 16777619, kept in 32-bit range via the >>> 0 at the end of each step.
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ("0000000" + h.toString(16)).slice(-8);
}

/** Hash of the canonical form of a netlist. */
export function netlistHash(netlist) {
  return fnv1a32(canonicalizeNetlist(netlist));
}

/**
 * Build the reproducibility stamp for a verified netlist.
 * @param {string} netlist  the exact deck that was simulated
 * @param {{engineVersion?:string}} [opts]
 * @returns {{engine, engineVersion, hashAlgo, netlistHash}}
 */
export function reproStamp(netlist, { engineVersion = ENGINE_VERSION } = {}) {
  return {
    engine: ENGINE,
    engineVersion,
    hashAlgo: HASH_ALGO,
    netlistHash: netlistHash(netlist),
  };
}
