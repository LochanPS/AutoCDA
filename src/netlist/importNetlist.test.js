import { detectAnalysis, validateNetlist, normalizeDeck } from "./importNetlist";

// Three pasted netlists covering three analysis kinds.
const AC_DECK = `* RC low-pass, fc ~ 1 kHz
V1 in 0 AC 1
R1 in out 1k
C1 out 0 159n
.ac dec 100 10 1meg
.end`;

const OP_DECK = `* 10 V divider -> ~3.33 V
V1 in 0 DC 10
R1 in out 2k
R2 out 0 1k
.op
.end`;

const TRAN_DECK = `* RC step response
V1 in 0 PULSE(0 1 0 1u 1u 5m 10m)
R1 in out 1k
C1 out 0 1u
.tran 10u 5m
.end`;

describe("detectAnalysis — three pasted netlists", () => {
  test("AC deck detected as .ac", () => {
    expect(detectAnalysis(AC_DECK).kind).toBe("ac");
  });
  test("operating-point deck detected as .op", () => {
    expect(detectAnalysis(OP_DECK).kind).toBe("op");
  });
  test("transient deck detected as .tran", () => {
    expect(detectAnalysis(TRAN_DECK).kind).toBe("tran");
  });
  test("no analysis directive returns null", () => {
    expect(detectAnalysis("* just parts\nR1 in out 1k\n.end")).toBeNull();
  });
  test("ignores directives that appear inside comments", () => {
    expect(detectAnalysis("* .ac is only mentioned here\nR1 a b 1k\n.op\n.end").kind).toBe("op");
  });
});

describe("validateNetlist — three pasted netlists pass", () => {
  for (const [name, deck] of [["AC", AC_DECK], ["op", OP_DECK], ["tran", TRAN_DECK]]) {
    test(`${name} deck validates`, () => {
      const r = validateNetlist(deck);
      expect(r.ok).toBe(true);
      expect(r.elements).toBeGreaterThan(0);
    });
  }
});

describe("validateNetlist — malformed input is rejected with a message", () => {
  test("empty input", () => {
    const r = validateNetlist("   \n  ");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/paste|upload/i);
  });
  test("no elements, only directives", () => {
    const r = validateNetlist("* title\n.op\n.end");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/no circuit elements/i);
  });
  test("missing analysis directive", () => {
    const r = validateNetlist("* title\nR1 in out 1k\nC1 out 0 1u\n.end");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/analysis directive/i);
  });
  test("unrecognised element line", () => {
    const r = validateNetlist("* title\n@weird in out 1k\n.op\n.end");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/unrecognised element/i);
  });
  test("element line missing nodes", () => {
    const r = validateNetlist("* title\nR1\n.op\n.end");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/missing nodes/i);
  });
});

describe("normalizeDeck — makes a pasted deck safe for ngspice", () => {
  test("prepends a title line when the first line is a real element", () => {
    const out = normalizeDeck("V1 in 0 AC 1\nR1 in out 1k\n.ac dec 10 1 1k\n.end");
    expect(out.split("\n")[0]).toMatch(/^\*/);
    // the original first element is preserved (not swallowed as the title)
    expect(out).toMatch(/^\* .*\nV1 in 0 AC 1/);
  });
  test("keeps an existing comment title unchanged at the top", () => {
    const out = normalizeDeck(AC_DECK);
    expect(out.split("\n")[0]).toBe("* RC low-pass, fc ~ 1 kHz");
  });
  test("appends .end when omitted", () => {
    const out = normalizeDeck("* t\nR1 in out 1k\n.op");
    expect(out.trim().endsWith(".end")).toBe(true);
  });
  test("does not duplicate an existing .end", () => {
    const out = normalizeDeck(OP_DECK);
    expect(out.match(/\.end/gi)).toHaveLength(1);
  });
});
