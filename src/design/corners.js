/**
 * corners.js — corner & environment analysis (Theme B4).
 *
 * Monte-Carlo (montecarlo.js) answers "what's the yield if every part wanders
 * randomly within tolerance?". Corner analysis answers the complementary, worst-
 * case question a datasheet asks: "does it still meet spec at the EXTREMES of
 * temperature, supply, and process?". Instead of random draws it visits the
 * deliberate corners:
 *   • temperature — cold / hot, injected as a `.temp` directive so device models
 *     (diodes, BJTs) shift the way real silicon does;
 *   • supply      — the rail at ±N % (re-runs with the supply target scaled);
 *   • process     — every passive at +tol and at −tol together (the fast/slow
 *     extremes), the hardest combined case.
 * Each corner re-runs the SAME deterministic SPICE grader the nominal design was
 * verified with, so "verified across conditions" means measured, not asserted.
 *
 * Pure except for the injected runSpice.
 */

import { simDescriptor, circuitTargetInfo, isVerifiable } from "../agents/simulatorAgent";

// Supply-rail targets, in priority order — whichever a type uses is the one the
// supply corner scales.
const SUPPLY_KEYS = ["Vin", "Vsupply", "VCC", "Vdd"];

export const supplyKeyFor = (targets) => SUPPLY_KEYS.find((k) => typeof targets?.[k] === "number") || null;

// Insert a `.temp` directive into a deck just before its `.end` line. ngspice
// applies it to the whole run; omitted for the nominal 27 °C corner.
export function withTemp(netlist, tempC) {
  if (tempC == null) return netlist;
  const lines = netlist.split(/\r?\n/);
  const endIdx = lines.findIndex((l) => /^\s*\.end\s*$/i.test(l));
  const directive = `.temp ${tempC}`;
  if (endIdx === -1) return `${netlist}\n${directive}`;
  lines.splice(endIdx, 0, directive);
  return lines.join("\n");
}

export const passivePerturb = (valueMap, components, factor) => {
  const out = { ...valueMap };
  for (const c of components || []) {
    if (c.rawValue == null) continue;
    if (c.unit === "Ω" || c.unit === "F") out[c.ref] = c.rawValue * factor;
  }
  return out;
};

async function gradeCorner({ type, targets, valueMap, tempC, runSpice }) {
  const d = simDescriptor(type);
  if (!d || d.verifiable === false) return null;
  const deck = withTemp(d.build(valueMap, targets || {}), tempC);
  const result = await runSpice(deck);
  const measured = d.measure(result);
  return typeof measured === "number" && isFinite(measured) ? measured : null;
}

/**
 * Run the corner sweep for a verified design.
 *
 * @param {import('../spec/circuitSpec').CircuitSpec} spec
 * @param {Array<{ref,rawValue,unit}>} components  the verified (nominal) parts
 * @param {{ runSpice, temps?:number[], supplyRel?:number, processTol?:number,
 *           tolerance?:number, onProgress?:Function }} opts
 *   temps       temperature corners in °C (default [0, 27, 70])
 *   supplyRel   supply corner as a fraction (default 0.1 → ±10 %)
 *   processTol  passive spread for the process corner (default 0.05 → ±5 %)
 * @returns {Promise<object>} { supported, target, nominal, corners[], worst, spread, pass }
 */
export async function runCorners(spec, components, {
  runSpice,
  temps = [0, 27, 70],
  supplyRel = 0.1,
  processTol = 0.05,
  tolerance = spec?.constraints?.tolerance ?? 0.05,
  onProgress,
} = {}) {
  const type = spec.type;
  if (!isVerifiable(type)) return { supported: false };

  const targets = spec.targets || {};
  const info = circuitTargetInfo(type, targets);
  const target = info ? info.value : null;
  const targetName = info ? info.name : null;

  const nominalMap = {};
  for (const c of components || []) if (c.rawValue != null) nominalMap[c.ref] = c.rawValue;

  const supplyKey = supplyKeyFor(targets);
  const corners = [];
  const add = async (label, axis, { map = nominalMap, tgts = targets, tempC = null, condition } = {}) => {
    const measured = await gradeCorner({ type, targets: tgts, valueMap: map, tempC, runSpice });
    const errorPct = measured != null && target ? Math.abs((measured - target) / target) : null;
    corners.push({ label, axis, condition, measured, errorPct, pass: errorPct != null && errorPct <= tolerance });
    if (onProgress) onProgress(corners.length);
  };

  // Nominal reference (27 °C, nominal supply, nominal parts).
  await add("nominal", "nominal", { condition: "27 °C, nominal rail & parts" });

  // Temperature corners (device models shift; passives are ideal here).
  for (const T of temps) {
    if (T === 27) continue;
    await add(`${T} °C`, "temperature", { tempC: T, condition: `${T} °C` });
  }

  // Supply corners, if the type has a rail target.
  if (supplyKey) {
    const v = targets[supplyKey];
    await add(`${supplyKey} −${supplyRel * 100}%`, "supply", { tgts: { ...targets, [supplyKey]: v * (1 - supplyRel) }, condition: `${supplyKey} = ${(v * (1 - supplyRel)).toPrecision(4)}` });
    await add(`${supplyKey} +${supplyRel * 100}%`, "supply", { tgts: { ...targets, [supplyKey]: v * (1 + supplyRel) }, condition: `${supplyKey} = ${(v * (1 + supplyRel)).toPrecision(4)}` });
  }

  // Process corners: all passives low (−tol) and all passives high (+tol).
  await add(`process −${processTol * 100}%`, "process", { map: passivePerturb(nominalMap, components, 1 - processTol), condition: `passives −${processTol * 100}%` });
  await add(`process +${processTol * 100}%`, "process", { map: passivePerturb(nominalMap, components, 1 + processTol), condition: `passives +${processTol * 100}%` });

  const nominal = corners.find((c) => c.axis === "nominal")?.measured ?? null;
  const measuredVals = corners.map((c) => c.measured).filter((m) => m != null);
  const min = measuredVals.length ? Math.min(...measuredVals) : null;
  const max = measuredVals.length ? Math.max(...measuredVals) : null;
  const withErr = corners.filter((c) => c.errorPct != null);
  const worst = withErr.length ? withErr.reduce((a, b) => (b.errorPct > a.errorPct ? b : a)) : null;
  const pass = withErr.length > 0 && withErr.every((c) => c.pass);

  return {
    supported: true,
    type,
    target,
    targetName,
    tolerance,
    nominal,
    corners,
    spread: min != null ? { min, max } : null,
    worst,
    pass,
  };
}
