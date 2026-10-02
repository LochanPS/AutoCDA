// Rule-based circuit intent parser — no LLM needed.
// Extracts circuit type + numerical parameters from natural language and
// returns a canonical CircuitSpec (see src/spec/circuitSpec.js).
//
// This is the regex FAST PATH. It never silently defaults: any required target
// not found in the text is filled from `defaults` AND recorded in spec.assumed[]
// so the confirm-before-run UI can show every guess.

import { makeSpec } from '../spec/circuitSpec';

// ── unit extraction ──────────────────────────────────────────────────────────

const SI_PREFIX = { p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, μ: 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9 };

// A number: integer/decimal, optional scientific notation. Commas are stripped
// from the text BEFORE matching (see normalize), so "1,500" arrives as "1500".
const NUM = String.raw`\d+(?:\.\d+)?(?:e[-+]?\d+)?`;

/**
 * Canonicalize free text before any parsing:
 *   - strip thousands commas between digits ("1,500" -> "1500")
 *   - collapse runs of whitespace and trim (so "LOW   PASS" matches "low pass")
 */
function normalize(text) {
  return (text || '')
    .replace(/(\d),(?=\d{3}(?:\D|$))/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractFrequency(text) {
  // "1kHz", "500 Hz", "2.5 MHz", "1000hz", "1e3 Hz"
  const re = new RegExp(`(${NUM})\\s*([kmgKMG])?\\s*(?:hz|hertz)`, 'i');
  const m = text.match(re);
  if (!m) return null;
  return parseFloat(m[1]) * (SI_PREFIX[m[2]] || 1);
}

function extractVoltage(text, label) {
  // label = optional keyword before the number (e.g. "from", "to", "output", "input")
  const pattern = label
    ? new RegExp(`${label}\\s+(${NUM})\\s*([kmµuKM])?\\s*v`, 'i')
    : new RegExp(`(${NUM})\\s*([kmµuKM])?\\s*v`, 'i');
  const m = text.match(pattern);
  if (!m) return null;
  return parseFloat(m[1]) * (SI_PREFIX[m[2]] || 1);
}

function extractCurrent(text) {
  // "20mA", "100 mA", "0.02A"
  const re = new RegExp(`(${NUM})\\s*([µuKkm])?\\s*(?:a|amp|ampere|amps)`, 'i');
  const m = text.match(re);
  if (!m) return null;
  return parseFloat(m[1]) * (SI_PREFIX[m[2]] || 1);
}

function extractGain(text) {
  // "gain 20", "gain of 50", "Av=20", "×20", "x20"
  const re = new RegExp(`(?:gain\\s*(?:of)?\\s*|av\\s*[=:]\\s*|[×x]\\s*)(${NUM})`, 'i');
  const m = text.match(re);
  if (!m) return null;
  return parseFloat(m[1]);
}

// ── human-readable formatting for assumed[] notes ─────────────────────────────

function formatValue(field, v) {
  switch (field) {
    case 'fc': case 'fL': case 'fH': case 'f':
      return v >= 1e6 ? `${v / 1e6} MHz` : v >= 1e3 ? `${v / 1e3} kHz` : `${v} Hz`;
    case 'I':
      return v < 1 ? `${v * 1000} mA` : `${v} A`;
    case 'Vin': case 'Vout': case 'Vsupply': case 'Vz':
      return `${v} V`;
    case 'Av':
      return `${v}×`;
    default:
      return `${v}`;
  }
}

// ── circuit type detection ───────────────────────────────────────────────────
//
// ORDERING MATTERS: patterns are tried top-to-bottom, first keyword match wins.
// Specific circuits (common_emitter, opamp_*) come BEFORE the broad/greedy
// generic patterns (generic 'amplifier'/'amp ', bare 'divider') so a prompt like
// "common emitter amplifier" resolves to common_emitter, not the generic amp.
// Each pattern's extract() returns ONLY fields found in the text (no defaults).
// `fields` = required target keys; `defaults` = fallback value per field.

const CIRCUIT_PATTERNS = [
  // Sallen-Key / 2nd-order low-pass MUST precede rc_lowpass: "sallen-key lowpass"
  // contains the substring "lowpass", so rc_lowpass would otherwise win.
  {
    id: 'sallen_key_lowpass',
    keywords: ['sallen', 'sallen-key', 'sallen key', 'second order low', 'second-order low',
               '2nd order low', '2nd-order low', 'two pole low', 'two-pole low', 'butterworth low'],
    fields: ['fc'],
    extract: (text) => {
      const fc = extractFrequency(text);
      return fc ? { fc } : {};
    },
    defaults: { fc: 1000 },
  },
  {
    id: 'rc_lowpass',
    keywords: ['low pass', 'low-pass', 'lowpass', 'lp filter', 'lp '],
    fields: ['fc'],
    extract: (text) => {
      const fc = extractFrequency(text);
      return fc ? { fc } : {};
    },
    defaults: { fc: 1000 },
  },
  {
    id: 'rc_highpass',
    keywords: ['high pass', 'high-pass', 'highpass', 'hp filter', 'hp '],
    fields: ['fc'],
    extract: (text) => {
      const fc = extractFrequency(text);
      return fc ? { fc } : {};
    },
    defaults: { fc: 500 },
  },
  {
    id: 'band_pass',
    keywords: ['band pass', 'band-pass', 'bandpass', 'bp filter'],
    fields: ['fL', 'fH'],
    extract: (text) => {
      const freqs = [...text.matchAll(new RegExp(`(${NUM})\\s*([kmKM])?\\s*(?:hz|hertz)`, 'gi'))]
        .map(m => parseFloat(m[1]) * (SI_PREFIX[m[2]] || 1));
      if (freqs.length >= 2) return { fL: Math.min(...freqs), fH: Math.max(...freqs) };
      const fc = extractFrequency(text);
      // Single centre frequency → derive a decade-wide band around it.
      return fc ? { fL: fc / Math.sqrt(10), fH: fc * Math.sqrt(10) } : {};
    },
    defaults: { fL: 200, fH: 2000 },
  },
  {
    id: 'common_emitter',
    keywords: ['common emitter', 'bjt', 'transistor amp', 'bjt amplifier'],
    fields: ['Av'],
    extract: (text) => {
      const Av = extractGain(text);
      return Av ? { Av } : {};
    },
    defaults: { Av: 20 },
  },
  // NOTE: non-inverting MUST come before inverting — the string "non-inverting"
  // contains the substring "inverting", so the inverting pattern would otherwise
  // match a non-inverting prompt first.
  {
    id: 'opamp_noninverting',
    keywords: ['non-inverting', 'noninverting', 'non inverting', 'op-amp non'],
    fields: ['Av'],
    extract: (text) => {
      const Av = extractGain(text);
      return Av ? { Av } : {};
    },
    defaults: { Av: 11 },
  },
  {
    id: 'opamp_inverting',
    keywords: ['inverting', 'inverting amplifier', 'op-amp inverting', 'opamp inverting'],
    fields: ['Av'],
    extract: (text) => {
      const Av = extractGain(text);
      return Av ? { Av } : {};
    },
    defaults: { Av: 10 },
  },
  {
    id: 'zener_regulator',
    keywords: ['zener', 'voltage regulator', 'zener regulator', 'zener diode'],
    fields: ['Vin', 'Vz'],
    extract: (text) => {
      const Vz = extractVoltage(text, 'zener') || extractVoltage(text, 'output') || extractVoltage(text, 'regulate');
      const Vin = extractVoltage(text, 'input') || extractVoltage(text, 'supply') || extractVoltage(text, 'from');
      const out = {};
      if (Vin) out.Vin = Vin;
      if (Vz) out.Vz = Vz;
      return out;
    },
    defaults: { Vin: 12, Vz: 5 },
  },
  {
    id: 'led_limiter',
    keywords: ['led', 'current limiter', 'current limit'],
    fields: ['Vsupply', 'I'],
    extract: (text) => {
      const I = extractCurrent(text);
      const Vsupply = extractVoltage(text, 'supply') || extractVoltage(text, 'from') || extractVoltage(text);
      const out = {};
      if (Vsupply) out.Vsupply = Vsupply;
      if (I) out.I = I;
      return out;
    },
    defaults: { Vsupply: 5, I: 0.02 },
  },
  {
    id: 'rc_oscillator',
    keywords: ['oscillator', 'wien bridge', 'phase shift oscillator', 'rc oscillator'],
    fields: ['f'],
    extract: (text) => {
      const f = extractFrequency(text);
      return f ? { f } : {};
    },
    defaults: { f: 1000 },
  },
  {
    id: 'voltage_divider',
    keywords: ['voltage divider', 'divider', 'step down', 'step-down', 'level shift'],
    fields: ['Vin', 'Vout'],
    extract: (text) => {
      const has = (x) => x !== null && x !== undefined;
      let Vin = extractVoltage(text, 'from') ?? extractVoltage(text, 'input') ?? extractVoltage(text, 'vin');
      let Vout = extractVoltage(text, 'to') ?? extractVoltage(text, 'output') ?? extractVoltage(text, 'vout');
      // Fallback: grab all voltages in order (use ?? so a legitimate 0 V is kept).
      if (!has(Vin) || !has(Vout)) {
        const allV = [...text.matchAll(new RegExp(`(${NUM})\\s*v\\b`, 'gi'))].map(m => parseFloat(m[1]));
        if (allV.length >= 2) { Vin = has(Vin) ? Vin : allV[0]; Vout = has(Vout) ? Vout : allV[1]; }
      }
      const out = {};
      if (has(Vin)) out.Vin = Vin;
      if (has(Vout)) out.Vout = Vout;
      return out;
    },
    defaults: { Vin: 12, Vout: 5 },
  },
  // Generic op-amp (no inverting/non-inverting stated). MUST come before the
  // greedy 'amp ' fallback, otherwise "op-amp gain 5" matches 'amp ' and is
  // mis-typed as a BJT common-emitter. An op-amp request is at least an op-amp;
  // default to inverting (the canonical textbook op-amp gain stage) and let the
  // SpecCard switch to non-inverting.
  {
    id: 'opamp_inverting',
    keywords: ['op-amp', 'op amp', 'opamp', 'operational amplifier'],
    fields: ['Av'],
    extract: (text) => {
      const Av = extractGain(text);
      return Av ? { Av } : {};
    },
    defaults: { Av: 10 },
  },
  // GREEDY generic amplifier — MUST stay last. 'amp '/'amplifier' match many
  // prompts, so it only wins when no specific amplifier keyword did. Maps to
  // common_emitter (a concrete supported type) since generic "amplifier" alone
  // is ambiguous; the SpecCard lets the user switch type before running.
  {
    id: 'common_emitter',
    keywords: ['amplifier', 'amp '],
    fields: ['Av'],
    extract: (text) => {
      const Av = extractGain(text);
      return Av ? { Av } : {};
    },
    defaults: { Av: 20 },
  },
];

// ── main parse function ──────────────────────────────────────────────────────

/**
 * Parse a natural-language prompt into a CircuitSpec.
 * @param {string} text
 * @returns {import('../spec/circuitSpec').CircuitSpec}
 *   - keyword matched + all targets found in text  → confidence 1.0
 *   - keyword matched + >=1 target defaulted        → confidence 0.6, assumed[] filled
 *   - no keyword matched                            → { type: null, confidence: 0 }
 */
export function parsePrompt(text) {
  const clean = normalize(text);
  const lower = clean.toLowerCase();

  for (const pattern of CIRCUIT_PATTERNS) {
    const matched = pattern.keywords.some(kw => lower.includes(kw));
    if (!matched) continue;

    const extracted = pattern.extract(clean) || {};
    const targets = {};
    const assumed = [];

    for (const field of pattern.fields) {
      if (extracted[field] !== undefined && extracted[field] !== null) {
        targets[field] = extracted[field];
      } else {
        const dflt = pattern.defaults[field];
        targets[field] = dflt;
        assumed.push(`${field} defaulted to ${formatValue(field, dflt)} (not found in prompt)`);
      }
    }

    const confidence = assumed.length === 0 ? 1.0 : 0.6;
    return makeSpec({ type: pattern.id, targets, confidence, assumed });
  }

  // No keyword matched → unidentified circuit. type:null is intentionally not a
  // SUPPORTED_TYPES id; callers check confidence === 0 before running anything.
  return {
    type: null,
    targets: {},
    constraints: { tolerance: 0.05, eSeries: 'E24', maxCost: null },
    confidence: 0,
    assumed: [],
  };
}
