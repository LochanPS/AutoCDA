/**
 * spiceCache.js — content-addressed cache for SPICE results.
 *
 * ngspice is deterministic: the same netlist always yields the same measurement.
 * So the canonicalized deck is a perfect cache key — the very normalization the
 * reproducibility stamp hashes (repro.js). The design loop re-simulates the same
 * candidate deck repeatedly (stall guards, joint grids revisiting a pair) and
 * different API calls often send identical decks; caching turns those into
 * zero-cost lookups instead of wasm runs.
 *
 * The key is the full CANONICAL STRING, not the 32-bit repro hash — a hash
 * collision would return a wrong result, and correctness beats a few saved bytes.
 * (The repro hash still labels/audits an entry; it just isn't the key.)
 *
 * Pure and dependency-light (only the canonicalizer), so it unit-tests without the
 * wasm engine. LRU-bounded so a long-lived server stays memory-safe.
 */
import { canonicalizeNetlist } from "./repro";

/**
 * @param {{max?:number}} [opts]  max entries before least-recently-used eviction
 * @returns {{get, set, has, stats, clear, key}}
 */
export function createSpiceCache({ max = 1000 } = {}) {
  const map = new Map(); // insertion order = LRU order (re-inserted on hit)
  let hits = 0;
  let misses = 0;
  const key = (netlist) => canonicalizeNetlist(netlist);

  return {
    key,
    has(netlist) {
      return map.has(key(netlist));
    },
    get(netlist) {
      const k = key(netlist);
      if (map.has(k)) {
        hits++;
        const v = map.get(k);
        map.delete(k); // move to most-recent
        map.set(k, v);
        return v;
      }
      misses++;
      return undefined;
    },
    set(netlist, value) {
      const k = key(netlist);
      if (map.has(k)) map.delete(k);
      map.set(k, value);
      while (map.size > max) map.delete(map.keys().next().value); // evict LRU
      return value;
    },
    clear() {
      map.clear();
      hits = 0;
      misses = 0;
    },
    stats() {
      const total = hits + misses;
      return { size: map.size, max, hits, misses, hitRate: total ? +(hits / total).toFixed(3) : 0 };
    },
  };
}
