import { canonicalizeNetlist, fnv1a32, netlistHash, reproStamp, ENGINE_VERSION } from "./repro";

describe("canonicalizeNetlist", () => {
  test("drops comments, blank lines, collapses whitespace, lower-cases", () => {
    const deck = `* a comment\nV1 in 0   DC 5\n\n; another comment\nR1 in OUT 1K\n.END`;
    expect(canonicalizeNetlist(deck)).toBe("v1 in 0 dc 5\nr1 in out 1k\n.end");
  });

  test("cosmetic differences canonicalize identically", () => {
    const a = `* title\nR1 a b 1k\n.end`;
    const b = `R1   a   b   1k\n\n.END\n`;
    expect(canonicalizeNetlist(a)).toBe(canonicalizeNetlist(b));
  });
});

describe("fnv1a32", () => {
  test("known vectors", () => {
    // Reference FNV-1a 32-bit hashes.
    expect(fnv1a32("")).toBe("811c9dc5");
    expect(fnv1a32("a")).toBe("e40c292c");
    expect(fnv1a32("foobar")).toBe("bf9cf968");
  });

  test("always 8 hex chars", () => {
    for (const s of ["", "x", "a longer netlist string\n.end"]) {
      expect(fnv1a32(s)).toMatch(/^[0-9a-f]{8}$/);
    }
  });
});

describe("netlistHash", () => {
  test("stable across cosmetic edits", () => {
    const a = `* RC\nR1 in out 1k\nC1 out 0 159n\n.end`;
    const b = `R1   IN   OUT   1K\nC1 out 0 159n\n.END`;
    expect(netlistHash(a)).toBe(netlistHash(b));
  });

  test("flips on any electrical change", () => {
    const base = `R1 in out 1k\nC1 out 0 159n\n.end`;
    const changed = `R1 in out 1k\nC1 out 0 160n\n.end`;
    expect(netlistHash(base)).not.toBe(netlistHash(changed));
  });
});

describe("reproStamp", () => {
  test("carries engine, version, algo, and hash", () => {
    const s = reproStamp("R1 a b 1k\n.end");
    expect(s.engine).toMatch(/ngspice/i);
    expect(s.engineVersion).toBe(ENGINE_VERSION);
    expect(s.hashAlgo).toBe("fnv1a32");
    expect(s.netlistHash).toMatch(/^[0-9a-f]{8}$/);
  });

  test("version override is honoured", () => {
    expect(reproStamp("x", { engineVersion: "9.9.9" }).engineVersion).toBe("9.9.9");
  });
});
