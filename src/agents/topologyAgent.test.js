/**
 * topologyAgent.test.js — A3: LLM-propose → deterministic-verify.
 *
 * The gate is the point of A3: a proposal is accepted ONLY when SPICE runs clean
 * and the measured value meets the target. These tests drive the gate with fake
 * proposers, a fake runSpice, and (for the "known" path) a fake orchestrate, so
 * the accept/reject logic is verified without the wasm engine or any network.
 */

import {
  proposeAndVerify,
  heuristicTopologyProposer,
  MEASUREMENT_KINDS,
} from "./topologyAgent";

// A minimal parsed-result stub shaped like spice.js parseResult output.
const dcResult = (node, value, errors = []) => ({
  sweep: [0],
  sweepType: "voltage",
  nodes: { [node]: [value] },
  errors,
});

describe("heuristicTopologyProposer (offline, regex-backed)", () => {
  test("maps a plain intent to a built-in verified type", () => {
    const p = heuristicTopologyProposer({ intent: "design a low pass filter at 2 kHz" });
    expect(p).toMatchObject({ kind: "known", type: "rc_lowpass" });
    expect(p.targets.fc).toBe(2000);
  });

  test("returns null when nothing matches", () => {
    expect(heuristicTopologyProposer({ intent: "xyzzy nonsense qux" })).toBeNull();
  });
});

describe("proposeAndVerify — known-type path (full loop via injected orchestrate)", () => {
  test("accepts when the verify loop converges", async () => {
    const fakeOrch = vi.fn(async () => ({
      converged: true, measured: 1000, targetValue: 1000, targetName: "fc", errorPct: 0, errors: [],
    }));
    const out = await proposeAndVerify({
      intent: "low pass filter 1 kHz",
      runSpice: async () => dcResult("out", 1),
      orchestrate: fakeOrch,
    });
    expect(out.accepted).toBe(true);
    expect(out.provenance).toBe("llm-mapped-known");
    expect(fakeOrch).toHaveBeenCalled();
    expect(out.spec.type).toBe("rc_lowpass");
  });

  test("rejects when the loop cannot converge — simulator has the final word", async () => {
    const fakeOrch = vi.fn(async () => ({
      converged: false, measured: 1300, targetValue: 1000, targetName: "fc", errorPct: 0.3, errors: [],
    }));
    const out = await proposeAndVerify({
      intent: "low pass filter 1 kHz",
      runSpice: async () => dcResult("out", 1),
      orchestrate: fakeOrch,
    });
    expect(out.accepted).toBe(false);
    expect(out.errorPct).toBeCloseTo(0.3, 6);
  });

  test("no proposal for an unrecognizable intent", async () => {
    const out = await proposeAndVerify({ intent: "qwerty zxcvb", runSpice: async () => dcResult("out", 1) });
    expect(out.accepted).toBe(false);
    expect(out.provenance).toBe("none");
    expect(out.reason).toMatch(/no topology/i);
  });
});

describe("proposeAndVerify — raw netlist path (run once + grade)", () => {
  const netlistProposer = (over = {}) => async () => ({
    kind: "netlist",
    netlist: "* proposed\nV1 in 0 DC 10\nR1 in out 1k\nR2 out 0 1k\n.op\n.end",
    measurement: { kind: "dc", node: "out" },
    target: 5,
    targetName: "Vout",
    ...over,
  });

  test("accepts a clean run within tolerance", async () => {
    const out = await proposeAndVerify({
      intent: "a 2:1 divider from 10V",
      propose: netlistProposer(),
      runSpice: async () => dcResult("out", 5.0),
      tolerance: 0.05,
    });
    expect(out.accepted).toBe(true);
    expect(out.provenance).toBe("llm-topology");
    expect(out.measured).toBe(5.0);
    expect(out.errorPct).toBeCloseTo(0, 6);
  });

  test("REJECTS when ngspice reports a real error, even if the number looks right", async () => {
    const out = await proposeAndVerify({
      intent: "something",
      propose: netlistProposer(),
      runSpice: async () => dcResult("out", 5.0, ["Error: singular matrix"]),
      tolerance: 0.05,
    });
    expect(out.accepted).toBe(false);
    expect(out.errors).toContain("Error: singular matrix");
    expect(out.reason).toMatch(/error/i);
  });

  test("drops benign Note:/Warning lines (not real errors)", async () => {
    const out = await proposeAndVerify({
      intent: "something",
      propose: netlistProposer(),
      runSpice: async () => dcResult("out", 5.0, ["Note: using default model", "Warning: tolerance"]),
    });
    expect(out.accepted).toBe(true);
    expect(out.errors).toEqual([]);
  });

  test("REJECTS (best-effort) when measured error exceeds tolerance", async () => {
    const out = await proposeAndVerify({
      intent: "something",
      propose: netlistProposer(),
      runSpice: async () => dcResult("out", 8.0), // target 5 → 60% off
      tolerance: 0.05,
    });
    expect(out.accepted).toBe(false);
    expect(out.errorPct).toBeCloseTo(0.6, 6);
    expect(out.reason).toMatch(/best-effort/i);
  });

  test("REJECTS when the measurement cannot be read", async () => {
    const out = await proposeAndVerify({
      intent: "something",
      propose: netlistProposer({ measurement: { kind: "dc", node: "missing" } }),
      runSpice: async () => dcResult("out", 5.0),
    });
    expect(out.accepted).toBe(false);
    expect(out.measured == null).toBe(true);
  });

  test("a proposer throwing is handled, not fatal", async () => {
    const out = await proposeAndVerify({
      intent: "x",
      propose: async () => { throw new Error("network down"); },
      runSpice: async () => dcResult("out", 5),
    });
    expect(out.accepted).toBe(false);
    expect(out.reason).toMatch(/network down/);
  });

  test("measurement whitelist is exactly the trusted analyzers", () => {
    expect(new Set(MEASUREMENT_KINDS)).toEqual(new Set(["cutoff", "gain", "dc", "unityGain"]));
  });
});
