/**
 * spiceCache.test.js — the content-addressed SPICE result cache (pure, no wasm).
 */
import { createSpiceCache } from "./spiceCache";

const deckA = "* a\nV1 in 0 AC 1\nR1 in out 1k\nC1 out 0 159n\n.ac dec 100 10 100k\n.end";
// Same deck, only whitespace/comment differences → must canonicalize to one key.
const deckAspaced = "*  a\n\nV1   in 0 AC 1\nR1 in out 1k\nC1 out 0 159n\n.ac dec 100 10 100k\n.end\n";
const deckB = "* b\nV1 in 0 AC 1\nR1 in out 2k\nC1 out 0 100n\n.ac dec 100 10 100k\n.end";

describe("createSpiceCache", () => {
  test("miss then hit; stats track", () => {
    const c = createSpiceCache();
    expect(c.get(deckA)).toBeUndefined();     // miss
    c.set(deckA, { measured: 998 });
    expect(c.get(deckA)).toEqual({ measured: 998 }); // hit
    const s = c.stats();
    expect(s.hits).toBe(1);
    expect(s.misses).toBe(1);
    expect(s.hitRate).toBeCloseTo(0.5, 3);
    expect(s.size).toBe(1);
  });

  test("canonicalization: whitespace-only differences share a key", () => {
    const c = createSpiceCache();
    c.set(deckA, { v: 1 });
    expect(c.has(deckAspaced)).toBe(true);
    expect(c.get(deckAspaced)).toEqual({ v: 1 });
    expect(c.stats().size).toBe(1); // not two entries
  });

  test("distinct decks are distinct entries", () => {
    const c = createSpiceCache();
    c.set(deckA, { v: "a" });
    c.set(deckB, { v: "b" });
    expect(c.get(deckA)).toEqual({ v: "a" });
    expect(c.get(deckB)).toEqual({ v: "b" });
    expect(c.stats().size).toBe(2);
  });

  test("LRU eviction at max; recently-used survives", () => {
    // Keys differ in ELEMENT content (comments are canonicalized away).
    const k1 = "R1 in out 1k\n.end";
    const k2 = "R1 in out 2k\n.end";
    const k3 = "R1 in out 3k\n.end";
    const c = createSpiceCache({ max: 2 });
    c.set(k1, 1);
    c.set(k2, 2);
    c.get(k1);          // touch k1 → k2 is now LRU
    c.set(k3, 3);       // evicts k2
    expect(c.has(k1)).toBe(true);
    expect(c.has(k3)).toBe(true);
    expect(c.has(k2)).toBe(false);
    expect(c.stats().size).toBe(2);
  });

  test("clear resets entries and counters", () => {
    const c = createSpiceCache();
    c.set(deckA, { v: 1 });
    c.get(deckA);
    c.clear();
    const s = c.stats();
    expect(s.size).toBe(0);
    expect(s.hits).toBe(0);
    expect(s.misses).toBe(0);
  });
});
