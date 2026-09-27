/**
 * circuitSpec.js — canonical CircuitSpec data structure for AutoCDA.
 *
 * The CircuitSpec is the single object every part of the app consumes: parser
 * output, design engine input, exporters, and UI all read/write this shape.
 *
 * Shape:
 *   {
 *     type: string,        // one of SUPPORTED_TYPES ids
 *     targets: {},         // design goals, e.g. { fc: 2000 } or { Vin: 12, Vout: 5 }
 *     constraints: {       // defaults: tolerance 0.05, eSeries "E24", maxCost null
 *       tolerance: 0.05,
 *       eSeries: "E24",
 *       maxCost: null
 *     },
 *     confidence: 0..1,    // parser's certainty
 *     assumed: []          // human-readable strings for any defaulted value
 *   }
 *
 * Pure module — no React, no side effects. Required target fields are sourced
 * from the extract() logic in src/utils/circuitParser.js.
 */

/**
 * The 10 supported circuit types, each with a display name and the list of
 * target field keys it requires. Field keys match circuitParser.js extract().
 * @type {ReadonlyArray<{id: string, name: string, fields: string[]}>}
 */
export const SUPPORTED_TYPES = [
  { id: 'rc_lowpass', name: 'RC Low-Pass Filter', fields: ['fc'] },
  { id: 'rc_highpass', name: 'RC High-Pass Filter', fields: ['fc'] },
  { id: 'voltage_divider', name: 'Voltage Divider', fields: ['Vin', 'Vout'] },
  { id: 'led_limiter', name: 'LED Current Limiter', fields: ['Vsupply', 'I'] },
  { id: 'common_emitter', name: 'Common-Emitter Amplifier', fields: ['Av'] },
  { id: 'band_pass', name: 'Band-Pass Filter', fields: ['fL', 'fH'] },
  { id: 'opamp_inverting', name: 'Inverting Op-Amp', fields: ['Av'] },
  { id: 'opamp_noninverting', name: 'Non-Inverting Op-Amp', fields: ['Av'] },
  { id: 'zener_regulator', name: 'Zener Voltage Regulator', fields: ['Vin', 'Vz'] },
  { id: 'rc_oscillator', name: 'RC Oscillator', fields: ['f'] },
];

/** Default constraint values applied when a partial spec omits them. */
const CONSTRAINT_DEFAULTS = {
  tolerance: 0.05,
  eSeries: 'E24',
  maxCost: null,
};

/** @returns {{id, name, fields} | undefined} */
function findType(type) {
  return SUPPORTED_TYPES.find((t) => t.id === type);
}

/**
 * Build a full CircuitSpec from a partial one, filling constraint defaults and
 * validating the type.
 * @param {Object} partial
 * @param {string} partial.type - must be a SUPPORTED_TYPES id
 * @param {Object} [partial.targets]
 * @param {Object} [partial.constraints]
 * @param {number} [partial.confidence]
 * @param {string[]} [partial.assumed]
 * @returns {{type, targets, constraints, confidence, assumed}}
 * @throws {Error} if type is not in SUPPORTED_TYPES
 */
export function makeSpec(partial = {}) {
  const { type, targets, constraints, confidence, assumed } = partial;

  if (!findType(type)) {
    throw new Error(
      `makeSpec: unknown circuit type "${type}". ` +
        `Must be one of: ${SUPPORTED_TYPES.map((t) => t.id).join(', ')}`
    );
  }

  return {
    type,
    targets: { ...(targets || {}) },
    constraints: { ...CONSTRAINT_DEFAULTS, ...(constraints || {}) },
    confidence: typeof confidence === 'number' ? confidence : 1,
    assumed: Array.isArray(assumed) ? [...assumed] : [],
  };
}

/**
 * Validate a CircuitSpec.
 * @param {Object} spec
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateSpec(spec) {
  const errors = [];

  if (!spec || typeof spec !== 'object') {
    return { ok: false, errors: ['spec is missing or not an object'] };
  }

  const typeDef = findType(spec.type);
  if (!typeDef) {
    errors.push(`unknown circuit type "${spec.type}"`);
    // Cannot check required fields without a known type.
    return { ok: errors.length === 0, errors };
  }

  const targets = spec.targets || {};
  for (const field of typeDef.fields) {
    const v = targets[field];
    if (v === undefined || v === null) {
      errors.push(`missing required target "${field}" for type "${spec.type}"`);
    } else if (typeof v !== 'number' || Number.isNaN(v)) {
      errors.push(`target "${field}" for type "${spec.type}" is not a valid number`);
    }
  }

  return { ok: errors.length === 0, errors };
}
