import { designerAgent } from "./designerAgent";
import { reasoningAgent, secantProposer, llmReasoningProposer, MAX_ITERATIONS } from "./reasoningAgent";

// Analytic stand-in for SPICE: computes the measured scalar from the value map,
// so the loop logic is tested deterministically without the wasm engine. The
// reasoning agent only ever varies the dominant component; the rest stay at
// their snapped values, exactly as in the real grader.
function analyticSim(type, targets) {
  return async ({ valueMap: v }) => {
    let measured, target, targetName;
    if (type === "rc_lowpass" || type === "rc_highpass") {
      measured = 1 / (2 * Math.PI * v.R1 * v.C1);
      target = targets.fc;
      targetName = "fc";
    } else if (type === "voltage_divider") {
      measured = (targets.Vin * v.R2) / (v.R1 + v.R2);
      target = targets.Vout;
      targetName = "Vout";
    } else if (type === "opamp_inverting") {
      measured = v.Rf / v.R1;
      target = targets.Av;
      targetName = "Av";
    } else {
      throw new Error(`no analytic model for ${type}`);
    }
    return { verifiable: true, measured, target, targetName, errors: [] };
  };
}

async function runCase(type, targets, tol = 0.05) {
  const d = designerAgent({ type, targets, eSeries: "E24" });
  return reasoningAgent({
    type,
    targets,
    snapped: d.snapped,
    idealComponents: d.idealComponents,
    tolerance: tol,
    eSeries: "E24",
    simulate: analyticSim(type, targets),
  });
}

describe("reasoningAgent — closed SPICE-grading loop", () => {
  test("converges an inverting op-amp gain exactly (Av = Rf/R1 lands on E-series)", async () => {
    const r = await runCase("opamp_inverting", { Av: 10 });
    expect(r.dominant).toBe("Rf");
    expect(r.converged).toBe(true);
    expect(r.best.errorPct).toBeLessThanOrEqual(0.02);
    expect(r.iterations).toBeLessThanOrEqual(MAX_ITERATIONS);
  });

  test("drives an RC low-pass cutoff to within tolerance by moving C (falling response)", async () => {
    const r = await runCase("rc_lowpass", { fc: 1000 });
    expect(r.dominant).toBe("C1");
    expect(r.converged).toBe(true);
    expect(r.best.errorPct).toBeLessThanOrEqual(0.05);
  });

  test("handles the non-proportional voltage divider (Vout monotonic but not ∝ R1)", async () => {
    const r = await runCase("voltage_divider", { Vin: 9, Vout: 3.3 });
    expect(r.dominant).toBe("R1");
    // best is never worse than the starting snapped design
    expect(r.best.errorPct).toBeLessThanOrEqual(r.trace[0].errorPct + 1e-9);
    expect(r.converged).toBe(true);
  });

  test("feedback actually reduces error (best ≤ first) and every step is auditable", async () => {
    const r = await runCase("rc_lowpass", { fc: 3300 });
    expect(r.best.errorPct).toBeLessThanOrEqual(r.trace[0].errorPct + 1e-9);
    for (const step of r.trace) {
      expect(typeof step.rationale).toBe("string");
      expect(step.rationale.length).toBeGreaterThan(0);
      expect(step.ref).toBe(r.dominant);
    }
  });

  test("is bounded: never exceeds the two-phase budget even on a hard target", async () => {
    const r = await runCase("rc_lowpass", { fc: 12345 }, 0.0001); // unreachable even on E96
    expect(r.iterations).toBeLessThanOrEqual(2 * MAX_ITERATIONS); // coarse + fine phases
    expect(r.best).not.toBeNull(); // still returns the best effort
  });
});

describe("secantProposer (pure)", () => {
  test("first-order step raises C to lower an RC cutoff that read too high", () => {
    // measured fc above target ⇒ need larger C (sign -1)
    const out = secantProposer({
      type: "rc_lowpass",
      target: 1000,
      current: 1e-7,
      history: [{ value: 1e-7, measured: 1500 }],
      eSeries: "E24",
    });
    expect(out.value).toBeGreaterThan(1e-7);
    expect(out.rationale).toMatch(/first-order/);
  });

  test("two points → secant fit lands near the analytic solution", () => {
    // Av = Rf / 1k ⇒ Rf for Av=10 is 10k. Give two bracketing sims.
    const out = secantProposer({
      type: "opamp_inverting",
      target: 10,
      current: 8200,
      history: [
        { value: 8200, measured: 8.2 },
        { value: 12000, measured: 12 },
      ],
      eSeries: "E24",
    });
    expect(out.value).toBeCloseTo(10000, -2.5); // snapped near 10k
    expect(out.rationale).toMatch(/secant/);
  });
});

describe("llmReasoningProposer (real-API path, mocked transport)", () => {
  test("throws clearly when no key is configured", async () => {
    const propose = llmReasoningProposer({ key: undefined, fetchImpl: async () => {} });
    await expect(
      propose({ type: "rc_lowpass", target: 1000, current: 1e-7, history: [] })
    ).rejects.toThrow(/no key/i);
  });

  test("parses the tool_use block into { value, rationale }", async () => {
    const fetchImpl = async (url, opts) => {
      const body = JSON.parse(opts.body);
      expect(body.tools[0].name).toBe("propose_next_value");
      return {
        ok: true,
        json: async () => ({
          content: [
            { type: "tool_use", name: "propose_next_value", input: { value: 2.2e-7, rationale: "raise C to drop fc" } },
          ],
        }),
      };
    };
    const propose = llmReasoningProposer({ key: "test", fetchImpl });
    const out = await propose({ type: "rc_lowpass", target: 1000, current: 1e-7, history: [{ value: 1e-7, measured: 1590 }] });
    expect(out.value).toBeCloseTo(2.2e-7, 12);
    expect(out.rationale).toBe("raise C to drop fc");
  });
});
