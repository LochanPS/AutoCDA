/**
 * spice.js — in-browser SPICE simulation via ngspice compiled to WebAssembly.
 *
 * Wraps the `eecircuit-engine` package (ngspice-wasm). Fully client-side, no
 * backend. The wasm module is loaded once and cached across calls.
 *
 * This is the REAL simulator that replaces the Phase 1 analytical self-check.
 * It is deterministic and independent of the design equations, so the error it
 * reports (Phase 2.3) is genuine measured-vs-target error.
 *
 * Public API:
 *   initSpice()                         → Promise<Simulation>  (cached)
 *   runSpice(netlist)                   → Promise<ParsedResult>
 *   measureCutoff(result, node?)        → -3 dB frequency from an AC sweep
 *   measureGain(result, inNode, outNode)→ mid-band gain (magnitude ratio)
 *   measureDC(result, node)             → DC node voltage
 *
 * ParsedResult shape:
 *   {
 *     raw,               // original eecircuit ResultType
 *     dataType,          // "real" (DC/tran) | "complex" (AC)
 *     sweepName,         // independent axis variable name
 *     sweepType,         // "frequency" | "time" | "voltage" | ...
 *     sweep: number[],   // independent axis values
 *     nodes: { [name]: number[] },            // magnitude (complex) or value (real)
 *     nodesComplex: { [name]: {real,img}[] }, // only present for AC
 *     errors: string[],  // ngspice error lines, if any
 *   }
 */

import { Simulation } from "eecircuit-engine";
import { measureCutoff, measureGain, measureDC } from "./measure";

// Re-export the pure analyzers so existing `import ... from "../sim/spice"` works.
export { measureCutoff, measureGain, measureDC } from "./measure";

let _sim = null;
let _startPromise = null;

/** Load and start the ngspice-wasm engine once; subsequent calls reuse it. */
export async function initSpice() {
  if (_sim) return _sim;
  if (!_startPromise) {
    const sim = new Simulation();
    _startPromise = sim
      .start()
      .then(() => {
        _sim = sim;
        return sim;
      })
      .catch((e) => {
        // Reset so a later call can retry after a failed load.
        _startPromise = null;
        throw e;
      });
  }
  return _startPromise;
}

/** Run a netlist through ngspice and return a parsed result. */
export async function runSpice(netlist) {
  const sim = await initSpice();
  sim.setNetList(netlist);
  const result = await sim.runSim();
  let errors = [];
  try {
    errors = sim.getError() || [];
  } catch {
    errors = [];
  }
  return parseResult(result, errors);
}

// ── result parsing ─────────────────────────────────────────────────────────

const magnitude = (v) =>
  typeof v === "number" ? Math.abs(v) : Math.hypot(v.real, v.img);
const realOf = (v) => (typeof v === "number" ? v : v.real);

function parseResult(result, errors) {
  const complex = result.dataType === "complex";
  const data = result.data || [];

  // Independent axis: the frequency/time variable, else the first column.
  const sweepEntry =
    data.find((d) => d.type === "frequency" || d.type === "time") || data[0];

  const nodes = {};
  const nodesComplex = {};
  for (const d of data) {
    if (d === sweepEntry) continue;
    nodes[d.name] = d.values.map(magnitude);
    if (complex) nodesComplex[d.name] = d.values.map((v) => ({ ...v }));
  }

  return {
    raw: result,
    dataType: result.dataType,
    sweepName: sweepEntry ? sweepEntry.name : null,
    sweepType: sweepEntry ? sweepEntry.type : null,
    sweep: sweepEntry ? sweepEntry.values.map(realOf) : [],
    nodes,
    nodesComplex: complex ? nodesComplex : undefined,
    errors,
  };
}

// ── dev-only self-test ─────────────────────────────────────────────────────
// Not wired into the app flow. Exposed on window in development so it can be
// triggered from the browser console:  await window.__spiceTest()
// Confirms the real engine measures the RC low-pass -3 dB point near 1 kHz.

const RC_LOWPASS_1K = `* RC Low-Pass fc~1kHz (R=1k, C=159nF)
V1 in 0 AC 1
R1 in out 1k
C1 out 0 159n
.ac dec 100 10 1meg
.end`;

export async function devTestRcLowpass() {
  const result = await runSpice(RC_LOWPASS_1K);
  const fc = measureCutoff(result, "out");
  // eslint-disable-next-line no-console
  console.log(
    `[spice devtest] rc_lowpass measured -3dB ≈ ${
      fc ? fc.toFixed(1) : "n/a"
    } Hz (expected ~1000 Hz)`,
    { errors: result.errors, variableNames: result.raw.variableNames }
  );
  return { fc, errors: result.errors, variableNames: result.raw.variableNames };
}

if (process.env.NODE_ENV === "development" && typeof window !== "undefined") {
  window.__spiceTest = devTestRcLowpass;
}
