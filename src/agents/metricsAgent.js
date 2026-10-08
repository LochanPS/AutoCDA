/**
 * metricsAgent — post-verify "richer metrics" pass (Theme B2).
 *
 * Once the design is verified against its primary target, this optionally runs a
 * few extra SPICE analyses to measure the numbers a pro actually checks — the
 * ones that fall out of the time-domain waveforms B1 unlocked:
 *   • oscillator → amplitude (Vpp), THD of the output sine
 *   • zener/shunt regulator → line regulation (ramped supply) and load regulation
 *     (stepped load), plus the settled output
 *
 * Pure except for the injected runSpice. Every measurement is wrapped so a metric
 * that fails to converge is simply omitted — it never fails the verified result.
 * Other types report no extra metrics yet (their stability / PSRR / output-impedance
 * numbers need non-ideal device models not in this build; the analyzers for them
 * live in sim/metrics.js, ready to wire when those models land).
 */

import { buildNetlist } from "./simulatorAgent";
import { measureOscillation, measureTHD, measureLineRegulation, measureLoadRegulation, measureSettled } from "../sim/transient";
import { collectOpampMetrics } from "../sim/opampModel";

const num = (v) => Number(Number(v).toPrecision(6)).toString();

// Zener line-regulation deck: supply ramps ±20 % across the run; Vout slope vs Vin
// is the regulation. Fixed 1 k load. Mirrors the verify deck's device model.
function zenerLineDeck(v, t) {
  const Vin = t.Vin;
  const lo = num(Vin * 0.8);
  const hi = num(Vin * 1.2);
  return `* zener line regulation\nVin in 0 PWL(0 ${lo} 10m ${hi})\nR1 in out ${num(v.R1)}\nDz 0 out ZD\nRL out 0 1k\n.model ZD D(BV=${num(v.Dz)} IBV=0.01 RS=2 N=2)\n.tran 10u 10m uic\n.end`;
}

// Zener load-regulation deck: fixed supply, a second load switches in at 5 ms via
// a voltage-controlled switch; Vout before vs after the step is the regulation.
function zenerLoadDeck(v, t) {
  const Vin = num(t.Vin);
  return `* zener load regulation\nVin in 0 DC ${Vin}\nR1 in out ${num(v.R1)}\nDz 0 out ZD\nRLfix out 0 10k\nSw out n2 ctrl 0 SWMOD\nRLswitched n2 0 600\nVctrl ctrl 0 PWL(0 0 5m 0 5.001m 1)\n.model SWMOD SW(Ron=0.1 Roff=1e9 Vt=0.5)\n.model ZD D(BV=${num(v.Dz)} IBV=0.01 RS=2 N=2)\n.tran 10u 10m uic\n.end`;
}

/**
 * Collect the extra metrics for a verified design.
 * @param {{type, targets, valueMap, runSpice}} input
 * @returns {Promise<Object|null>} a metrics object, or null if the type has none
 */
export async function collectMetrics({ type, targets, valueMap, runSpice }) {
  const safe = async (fn) => {
    try {
      return await fn();
    } catch {
      return null;
    }
  };

  if (type === "rc_oscillator") {
    const net = buildNetlist(type, valueMap, targets);
    if (!net) return null;
    const result = await safe(() => runSpice(net));
    if (!result) return null;
    const osc = measureOscillation(result, "out");
    const thd = measureTHD(result, "out");
    const m = {};
    if (osc) {
      if (osc.vpp != null) m.amplitudeVpp = { value: osc.vpp, unit: "V", label: "Output amplitude (Vpp)" };
      if (osc.rms != null) m.rms = { value: osc.rms, unit: "V", label: "Output RMS" };
    }
    if (thd != null) m.thd = { value: thd * 100, unit: "%", label: "Total harmonic distortion" };
    return Object.keys(m).length ? m : null;
  }

  if (type === "zener_regulator") {
    const m = {};
    const lineRes = await safe(() => runSpice(zenerLineDeck(valueMap, targets)));
    if (lineRes) {
      const settled = measureSettled(lineRes, "out", { tail: 0.05 });
      if (settled != null) m.vout = { value: settled, unit: "V", label: "Regulated output" };
      const line = measureLineRegulation(lineRes, { outNode: "out", inNode: "in" });
      if (line && isFinite(line.percent)) {
        m.lineRegulation = { value: line.percent, unit: "%/V", label: "Line regulation (ΔVout per input volt)" };
      }
    }
    const loadRes = await safe(() => runSpice(zenerLoadDeck(valueMap, targets)));
    if (loadRes) {
      const load = measureLoadRegulation(loadRes, { outNode: "out", stepFrac: 0.5 });
      if (load && isFinite(load.dVout)) {
        m.loadRegulation = { value: load.dVout * 1000, unit: "mV", label: "Load regulation (ΔVout, load step)" };
      }
    }
    return Object.keys(m).length ? m : null;
  }

  if (type === "opamp_inverting" || type === "opamp_noninverting") {
    // Non-ideal op-amp macromodel → closed-loop bandwidth + phase/gain margin,
    // the numbers an ideal-VCVS deck can't produce. Each measure is wrapped and
    // never fails the verified result.
    return await safe(() => collectOpampMetrics({ type, valueMap, runSpice }));
  }

  return null;
}
