// Rule-based circuit intent parser — no LLM needed.
// Extracts circuit type + numerical parameters from natural language.

// ── unit extraction ──────────────────────────────────────────────────────────

const SI_PREFIX = { p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, μ: 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9 };

function extractFrequency(text) {
  // "1kHz", "500 Hz", "2.5 MHz", "1000hz"
  const re = /(\d+(?:\.\d+)?)\s*([kmgKMG])?\s*(?:hz|hertz|HZ)/i;
  const m = text.match(re);
  if (!m) return null;
  return parseFloat(m[1]) * (SI_PREFIX[m[2]] || 1);
}

function extractVoltage(text, label) {
  // label = optional keyword before the number (e.g. "from", "to", "output", "input")
  const pattern = label
    ? new RegExp(`${label}\\s+(\\d+(?:\\.\\d+)?)\\s*([kmµuKM])?\\s*v`, 'i')
    : /(\d+(?:\.\d+)?)\s*([kmµuKM])?\s*v/i;
  const m = text.match(pattern);
  if (!m) return null;
  return parseFloat(m[1]) * (SI_PREFIX[m[2]] || 1);
}

function extractCurrent(text) {
  // "20mA", "100 mA", "0.02A"
  const re = /(\d+(?:\.\d+)?)\s*([µuKkm])?\s*(?:a|amp|ampere|amps)/i;
  const m = text.match(re);
  if (!m) return null;
  return parseFloat(m[1]) * (SI_PREFIX[m[2]] || 1);
}

function extractGain(text) {
  // "gain 20", "gain of 50", "Av=20", "×20", "x20"
  const re = /(?:gain\s*(?:of)?\s*|av\s*[=:]\s*|[×x]\s*)(\d+(?:\.\d+)?)/i;
  const m = text.match(re);
  if (!m) return null;
  return parseFloat(m[1]);
}

// ── circuit type detection ───────────────────────────────────────────────────

const CIRCUIT_PATTERNS = [
  {
    id: 'rc_lowpass',
    keywords: ['low pass', 'low-pass', 'lowpass', 'lp filter', 'lp '],
    extract: (text) => {
      const fc = extractFrequency(text);
      return fc ? { fc } : null;
    },
    defaults: { fc: 1000 },
  },
  {
    id: 'rc_highpass',
    keywords: ['high pass', 'high-pass', 'highpass', 'hp filter', 'hp '],
    extract: (text) => {
      const fc = extractFrequency(text);
      return fc ? { fc } : null;
    },
    defaults: { fc: 500 },
  },
  {
    id: 'voltage_divider',
    keywords: ['voltage divider', 'divider', 'step down', 'step-down', 'level shift'],
    extract: (text) => {
      // Try "from X to Y", "XVin YVout", "XVto Y"
      let Vin = extractVoltage(text, 'from') || extractVoltage(text, 'input') || extractVoltage(text, 'vin');
      let Vout = extractVoltage(text, 'to') || extractVoltage(text, 'output') || extractVoltage(text, 'vout');

      // Fallback: grab all voltages in order
      if (!Vin || !Vout) {
        const allV = [...text.matchAll(/(\d+(?:\.\d+)?)\s*v\b/gi)].map(m => parseFloat(m[1]));
        if (allV.length >= 2) { Vin = allV[0]; Vout = allV[1]; }
      }
      return Vin && Vout ? { Vin, Vout } : null;
    },
    defaults: { Vin: 12, Vout: 5 },
  },
  {
    id: 'led_limiter',
    keywords: ['led', 'current limiter', 'current limit'],
    extract: (text) => {
      const I = extractCurrent(text);
      const Vsupply = extractVoltage(text, 'supply') || extractVoltage(text, 'from') || extractVoltage(text);
      return { Vsupply: Vsupply || 5, I: I || 0.02 };
    },
    defaults: { Vsupply: 5, I: 0.02 },
  },
  {
    id: 'common_emitter',
    keywords: ['common emitter', 'bjt', 'transistor amp', 'bjt amplifier'],
    extract: (text) => {
      const Av = extractGain(text);
      return Av ? { Av } : null;
    },
    defaults: { Av: 20 },
  },
  {
    id: 'band_pass',
    keywords: ['band pass', 'band-pass', 'bandpass', 'bp filter'],
    extract: (text) => {
      const freqs = [...text.matchAll(/(\d+(?:\.\d+)?)\s*([kmKM])?\s*(?:hz|hertz)/gi)]
        .map(m => parseFloat(m[1]) * (SI_PREFIX[m[2]] || 1));
      if (freqs.length >= 2) return { fL: Math.min(...freqs), fH: Math.max(...freqs) };
      const fc = extractFrequency(text);
      return fc ? { fL: fc / Math.sqrt(10), fH: fc * Math.sqrt(10) } : null;
    },
    defaults: { fL: 200, fH: 2000 },
  },
  {
    id: 'opamp_inverting',
    keywords: ['inverting', 'inverting amplifier', 'op-amp inverting', 'opamp inverting'],
    extract: (text) => {
      const Av = extractGain(text);
      return Av ? { Av } : null;
    },
    defaults: { Av: 10 },
  },
  {
    id: 'opamp_noninverting',
    keywords: ['non-inverting', 'noninverting', 'non inverting', 'op-amp non'],
    extract: (text) => {
      const Av = extractGain(text);
      return Av ? { Av } : null;
    },
    defaults: { Av: 11 },
  },
  {
    id: 'zener_regulator',
    keywords: ['zener', 'voltage regulator', 'zener regulator', 'zener diode'],
    extract: (text) => {
      const Vz = extractVoltage(text, 'zener') || extractVoltage(text, 'output') || extractVoltage(text, 'regulate');
      const Vin = extractVoltage(text, 'input') || extractVoltage(text, 'supply') || extractVoltage(text, 'from');
      return { Vin: Vin || 12, Vz: Vz || 5 };
    },
    defaults: { Vin: 12, Vz: 5 },
  },
  {
    id: 'rc_oscillator',
    keywords: ['oscillator', 'wien bridge', 'phase shift oscillator', 'rc oscillator'],
    extract: (text) => {
      const f = extractFrequency(text);
      return f ? { f } : null;
    },
    defaults: { f: 1000 },
  },
  {
    id: 'amplifier',
    keywords: ['amplifier', 'amp '],
    extract: (text) => {
      const Av = extractGain(text);
      return Av ? { Av } : null;
    },
    defaults: { Av: 20 },
  },
];

// ── main parse function ──────────────────────────────────────────────────────

export function parsePrompt(text) {
  const lower = text.toLowerCase();

  for (const pattern of CIRCUIT_PATTERNS) {
    const matched = pattern.keywords.some(kw => lower.includes(kw));
    if (!matched) continue;

    const extracted = pattern.extract(text);
    const params = { ...pattern.defaults, ...(extracted || {}) };

    return { circuitId: pattern.id, params, matched: true };
  }

  return { matched: false, circuitId: null, params: {} };
}
