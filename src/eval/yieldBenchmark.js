/**
 * yieldBenchmark.js — evaluate yield-aware selection vs nominal-nearest snapping.
 *
 * For each case: design ideally, produce (a) the baseline nominal-snapped parts
 * and (b) the yield-aware parts, then measure each design's TRUE yield with an
 * INDEPENDENT Monte-Carlo run (real ngspice, fresh randomness, not the model the
 * selector used). Reports per-case yield and the aggregate improvement.
 *
 * This is the evaluation that turns the optimizer into a result: it shows, with
 * ground-truth simulation, that yield-aware selection meets or beats the
 * baseline across a range of circuits.
 *
 * Runs in the browser (needs the wasm engine). In development it is exposed as
 * window.__yieldBench().
 */

import { calculateCircuit } from "../utils/circuitFormulas";
import { snap } from "../design/eseries";
import { selectYieldAware } from "../design/yieldAware";
import { runToleranceSweep } from "../design/montecarlo";
import { runSpice } from "../sim/spice";

const isPassive = (c) => c.unit === "Ω" || c.unit === "F";
const spec = (type, targets, tol = 0.05, eSeries = "E24") => ({ type, targets, constraints: { tolerance: tol, eSeries } });

const CASES = [
  spec("voltage_divider", { Vin: 9, Vout: 3.3 }),
  spec("voltage_divider", { Vin: 12, Vout: 5 }),
  spec("voltage_divider", { Vin: 5, Vout: 1.8 }),
  spec("rc_lowpass", { fc: 1000 }),
  spec("rc_lowpass", { fc: 3300 }),
  spec("rc_highpass", { fc: 500 }),
  spec("band_pass", { fL: 300, fH: 3000 }),
  spec("led_limiter", { Vsupply: 5, I: 0.02 }),
  spec("opamp_noninverting", { Av: 11 }),
  spec("opamp_inverting", { Av: 10 }),
];

/**
 * @param {{ runSpice?, N?, cases?, onProgress? }} opts
 */
export async function runYieldBenchmark({ runSpice: sim = runSpice, N = 150, cases = CASES, onProgress } = {}) {
  const rows = [];
  for (let i = 0; i < cases.length; i++) {
    const s = cases[i];
    const ideal = calculateCircuit(s.type, s.targets);
    const baseline = ideal.components.map((c) =>
      isPassive(c) ? { ...c, rawValue: snap(c.rawValue, s.constraints.eSeries) } : { ...c }
    );

    const ya = await selectYieldAware(s, ideal, { runSpice: sim, verifyMC: { topK: 4, N: 80 } });

    // Independent ground-truth Monte-Carlo for each design (fresh randomness).
    const baseMC = await runToleranceSweep(s, baseline, { runSpice: sim, N });
    const yaMC = ya.ok ? await runToleranceSweep(s, ya.components, { runSpice: sim, N }) : null;

    const err = (mc) => (mc && mc.target ? Math.abs((mc.mean - mc.target) / mc.target) : null);
    const row = {
      case: `${s.type} ${JSON.stringify(s.targets)}`,
      baselineYield: baseMC.yield,
      yieldAwareYield: yaMC ? yaMC.yield : null,
      delta: yaMC ? yaMC.yield - baseMC.yield : null,
      baselineError: err(baseMC),
      yieldAwareError: yaMC ? err(yaMC) : null,
      predictedYield: ya.ok ? ya.predictedYield : null,
      considered: ya.ok ? ya.considered : null,
    };
    rows.push(row);
    if (onProgress) onProgress((i + 1) / cases.length, row);
  }

  const valid = rows.filter((r) => r.delta != null);
  const meanDelta = valid.reduce((a, r) => a + r.delta, 0) / (valid.length || 1);
  const wins = valid.filter((r) => r.delta > 0.005).length;
  const ties = valid.filter((r) => Math.abs(r.delta) <= 0.005).length;
  const losses = valid.filter((r) => r.delta < -0.005).length;
  const meanBaseErr = valid.reduce((a, r) => a + (r.baselineError || 0), 0) / (valid.length || 1);
  const meanYaErr = valid.reduce((a, r) => a + (r.yieldAwareError || 0), 0) / (valid.length || 1);

  return { rows, meanDelta, wins, ties, losses, n: valid.length, N, meanBaseErr, meanYaErr };
}

// Dev-only console hook: await window.__yieldBench()
if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  window.__yieldBench = async (opts = {}) => {
    // eslint-disable-next-line no-console
    console.log("[yieldBench] running… (real ngspice, this takes a few minutes)");
    const r = await runYieldBenchmark({
      onProgress: (p, row) =>
        // eslint-disable-next-line no-console
        console.log(`[yieldBench] ${(p * 100).toFixed(0)}%  ${row.case}  base ${(row.baselineYield * 100).toFixed(1)}% → ya ${row.yieldAwareYield == null ? "n/a" : (row.yieldAwareYield * 100).toFixed(1) + "%"}`),
      ...opts,
    });
    // eslint-disable-next-line no-console
    console.table(
      r.rows.map((x) => ({
        case: x.case,
        baseYield: (x.baselineYield * 100).toFixed(1) + "%",
        yieldAware: x.yieldAwareYield == null ? "n/a" : (x.yieldAwareYield * 100).toFixed(1) + "%",
        deltaPP: x.delta == null ? "n/a" : (x.delta * 100).toFixed(1),
        baseErr: x.baselineError == null ? "n/a" : (x.baselineError * 100).toFixed(2) + "%",
        yaErr: x.yieldAwareError == null ? "n/a" : (x.yieldAwareError * 100).toFixed(2) + "%",
      }))
    );
    // eslint-disable-next-line no-console
    console.log(`[yieldBench] mean yield gain ${(r.meanDelta * 100).toFixed(2)} pp | wins ${r.wins} ties ${r.ties} losses ${r.losses} of ${r.n} | mean |err| base ${(r.meanBaseErr * 100).toFixed(2)}% → ya ${(r.meanYaErr * 100).toFixed(2)}%`);
    return r;
  };
}
