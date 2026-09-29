/**
 * DesignerAgent — CircuitSpec → ideal component values, then snapped to E-series.
 *
 * Pure. Uses the closed-form formula engine for the ideal design, then snaps
 * every passive (R/C) to the nearest buyable standard value.
 *
 * @typedef {Object} DesignInput
 * @property {string} type
 * @property {Object} targets
 * @property {string} eSeries
 *
 * @typedef {Object} DesignOutput
 * @property {boolean} ok
 * @property {string} [error]
 * @property {string} [name]
 * @property {Array} [idealComponents]  the raw formula-engine components
 * @property {Array} [snapped]          same list with passives snapped to E-series
 */

import { calculateCircuit } from "../utils/circuitFormulas";
import { snap, applyValue } from "../design/eseries";

const isPassive = (c) => c.unit === "Ω" || c.unit === "F";

/**
 * @param {DesignInput} input
 * @returns {DesignOutput}
 */
export function designerAgent({ type, targets, eSeries = "E24" }) {
  const ideal = calculateCircuit(type, targets || {});
  if (!ideal) return { ok: false, error: "unknown circuit type" };

  const snapped = ideal.components.map((c) =>
    isPassive(c) ? applyValue(c, snap(c.rawValue, eSeries)) : { ...c }
  );

  return { ok: true, name: ideal.name, idealComponents: ideal.components, snapped };
}
