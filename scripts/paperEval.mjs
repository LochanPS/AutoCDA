/**
 * paperEval.mjs — the paper's headline experiment, run for real.
 *
 * Compares two ways to turn an intent into parts, both measured by the SAME
 * independent ngspice oracle:
 *   • BASELINE  "generate, don't verify": the closed-form design snapped to the
 *               nearest E-series parts (what an LLM/analytical tool emits), taken
 *               as-is — one SPICE measurement, no refinement.
 *   • ORACLE    "verify in the loop": the full propose -> SPICE-grade -> re-propose
 *               loop (the default deterministic secant proposer).
 *
 * Reports, per method, the error distribution and the fraction meeting tolerance,
 * over a fixed grid of verifiable types/targets. Deterministic + reproducible:
 *   node --import ./server/loader.mjs scripts/paperEval.mjs
 */
import { designerAgent } from "../src/agents/designerAgent.js";
import { orchestrate } from "../src/agents/orchestrator.js";
import { simulatorAgent } from "../src/agents/simulatorAgent.js";
import { makeSpec } from "../src/spec/circuitSpec.js";
import { runSpice } from "../src/sim/spice.js";

const CASES = [
  ["rc_lowpass", { fc: 500 }], ["rc_lowpass", { fc: 3300 }], ["rc_lowpass", { fc: 12000 }],
  ["rc_highpass", { fc: 500 }], ["rc_highpass", { fc: 4700 }],
  ["voltage_divider", { Vin: 9, Vout: 3.3 }], ["voltage_divider", { Vin: 24, Vout: 5 }], ["voltage_divider", { Vin: 5, Vout: 1.8 }],
  ["led_limiter", { Vsupply: 5, I: 0.02 }], ["led_limiter", { Vsupply: 12, I: 0.01 }],
  ["opamp_inverting", { Av: 10 }], ["opamp_inverting", { Av: 47 }],
  ["opamp_noninverting", { Av: 5 }], ["opamp_noninverting", { Av: 21 }],
  ["common_emitter", { Av: 10 }], ["common_emitter", { Av: 40 }],
  ["band_pass", { fL: 300, fH: 3000 }],
  ["sallen_key_lowpass", { fc: 1000 }], ["sallen_key_lowpass", { fc: 5000 }],
  ["mfb_lowpass", { fc: 1000 }], ["mfb_lowpass", { fc: 4000 }],
  ["instrumentation_amp", { Av: 10 }], ["instrumentation_amp", { Av: 100 }],
  ["current_mirror", { I: 0.005 }], ["current_mirror", { I: 0.02 }],
];

const errOf = (measured, target) =>
  typeof measured === "number" && isFinite(measured) && target ? Math.abs((measured - target) / target) : null;

function stats(errs) {
  const v = errs.filter((e) => e != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const q = (p) => v[Math.min(v.length - 1, Math.floor(p * (v.length - 1)))];
  const within = (t) => v.filter((e) => e <= t).length / v.length;
  return {
    n: v.length,
    medianPct: +(q(0.5) * 100).toFixed(2),
    p90Pct: +(q(0.9) * 100).toFixed(2),
    maxPct: +(v[v.length - 1] * 100).toFixed(2),
    within5: +(within(0.05) * 100).toFixed(0),
    within2: +(within(0.02) * 100).toFixed(0),
    within1: +(within(0.01) * 100).toFixed(0),
  };
}

const baseErrs = [], oracleErrs = [], iters = [];
for (const [type, targets] of CASES) {
  // BASELINE: analytical snap, measured once, no refinement.
  const d = designerAgent({ type, targets, eSeries: "E24" });
  const vm = {};
  for (const c of d.snapped) if (c.rawValue != null) vm[c.ref] = c.rawValue;
  let be = null;
  try { const s = await simulatorAgent({ type, targets, valueMap: vm, runSpice }); be = errOf(s.measured, s.target); } catch {}
  baseErrs.push(be);

  // ORACLE: full verify loop (tolerance 2% so the loop actually engages).
  let oe = null, it = 0;
  try {
    const res = await orchestrate(makeSpec({ type, targets, constraints: { tolerance: 0.02 } }), { runSpice, strategy: "reasoning" });
    oe = res.errorPct; it = res.iterations || 0;
  } catch {}
  oracleErrs.push(oe); iters.push(it);
  console.error(`${type} ${JSON.stringify(targets)}  base ${be == null ? "—" : (be * 100).toFixed(1) + "%"}  oracle ${oe == null ? "—" : (oe * 100).toFixed(1) + "%"} (${it})`);
}

const out = {
  cases: CASES.length,
  baseline: stats(baseErrs),
  oracle: stats(oracleErrs),
  meanOracleIterations: +(iters.reduce((a, b) => a + b, 0) / iters.length).toFixed(1),
};
console.log("\n" + JSON.stringify(out, null, 2));
