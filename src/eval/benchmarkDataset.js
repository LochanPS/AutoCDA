/**
 * benchmarkDataset.js — natural-language → verified-design benchmark.
 *
 * A curated set of plain-English circuit requests, each labelled with the
 * ground-truth circuit type and canonical numeric targets (base SI units:
 * Hz, V, A, unitless gain). Used to evaluate parsing accuracy (parserBenchmark)
 * and end-to-end design capability (designBenchmark), and as the fixture that
 * the LLM-vs-regex study (angle 1) plugs into.
 *
 * Fields:
 *   id         stable identifier
 *   prompt     the natural-language request
 *   type       expected SUPPORTED_TYPES id
 *   targets    expected canonical targets (base SI)
 *   difficulty "easy" | "medium" | "hard"
 *   style      "canonical" | "colloquial" | "unit-variant" | "ambiguous"
 *
 * Units: fc/fL/fH/f in Hz, V* in volts, I in amps, Av unitless.
 */

export const DATASET = [
  // ── rc_lowpass ──────────────────────────────────────────────────────────────
  { id: "lp1", prompt: "low pass filter 1kHz", type: "rc_lowpass", targets: { fc: 1000 }, difficulty: "easy", style: "canonical" },
  { id: "lp2", prompt: "design a low-pass filter with cutoff 2 kHz", type: "rc_lowpass", targets: { fc: 2000 }, difficulty: "easy", style: "canonical" },
  { id: "lp3", prompt: "RC low pass, corner frequency 500 Hz", type: "rc_lowpass", targets: { fc: 500 }, difficulty: "medium", style: "canonical" },
  { id: "lp4", prompt: "first order low pass at 3.3 kHz", type: "rc_lowpass", targets: { fc: 3300 }, difficulty: "medium", style: "canonical" },
  { id: "lp5", prompt: "lpf 4khz", type: "rc_lowpass", targets: { fc: 4000 }, difficulty: "medium", style: "unit-variant" },
  { id: "lp6", prompt: "I want a filter that passes low frequencies and cuts everything above 800 Hz", type: "rc_lowpass", targets: { fc: 800 }, difficulty: "hard", style: "colloquial" },

  // ── rc_highpass ─────────────────────────────────────────────────────────────
  { id: "hp1", prompt: "high pass filter 500Hz", type: "rc_highpass", targets: { fc: 500 }, difficulty: "easy", style: "canonical" },
  { id: "hp2", prompt: "high-pass filter with a 1 kHz cutoff", type: "rc_highpass", targets: { fc: 1000 }, difficulty: "easy", style: "canonical" },
  { id: "hp3", prompt: "RC high pass corner 2kHz", type: "rc_highpass", targets: { fc: 2000 }, difficulty: "medium", style: "canonical" },
  { id: "hp4", prompt: "hpf 600 hz", type: "rc_highpass", targets: { fc: 600 }, difficulty: "medium", style: "unit-variant" },
  { id: "hp5", prompt: "block DC and only pass signals above 100 Hz", type: "rc_highpass", targets: { fc: 100 }, difficulty: "hard", style: "colloquial" },

  // ── voltage_divider ─────────────────────────────────────────────────────────
  { id: "vd1", prompt: "voltage divider 9V to 3.3V", type: "voltage_divider", targets: { Vin: 9, Vout: 3.3 }, difficulty: "easy", style: "canonical" },
  { id: "vd2", prompt: "step down 12V to 5V", type: "voltage_divider", targets: { Vin: 12, Vout: 5 }, difficulty: "easy", style: "canonical" },
  { id: "vd3", prompt: "divide 5 volts down to 1.8 volts", type: "voltage_divider", targets: { Vin: 5, Vout: 1.8 }, difficulty: "medium", style: "colloquial" },
  { id: "vd4", prompt: "resistor divider from 15V giving 2.5V", type: "voltage_divider", targets: { Vin: 15, Vout: 2.5 }, difficulty: "medium", style: "canonical" },
  { id: "vd5", prompt: "level shift 3.3V to 1.8V", type: "voltage_divider", targets: { Vin: 3.3, Vout: 1.8 }, difficulty: "medium", style: "canonical" },
  { id: "vd6", prompt: "step 9 volts down to about 3v3", type: "voltage_divider", targets: { Vin: 9, Vout: 3.3 }, difficulty: "hard", style: "colloquial" },

  // ── led_limiter ─────────────────────────────────────────────────────────────
  { id: "led1", prompt: "LED current limiter 5V 20mA", type: "led_limiter", targets: { Vsupply: 5, I: 0.02 }, difficulty: "easy", style: "canonical" },
  { id: "led2", prompt: "current limiting resistor for an LED on 12V at 10mA", type: "led_limiter", targets: { Vsupply: 12, I: 0.01 }, difficulty: "medium", style: "canonical" },
  { id: "led3", prompt: "LED resistor, 3.3V supply, 5mA", type: "led_limiter", targets: { Vsupply: 3.3, I: 0.005 }, difficulty: "easy", style: "canonical" },
  { id: "led4", prompt: "drive an LED from 5 volts at 15 mA", type: "led_limiter", targets: { Vsupply: 5, I: 0.015 }, difficulty: "medium", style: "colloquial" },
  { id: "led5", prompt: "limit the LED current to 20mA off a 9V battery", type: "led_limiter", targets: { Vsupply: 9, I: 0.02 }, difficulty: "hard", style: "colloquial" },

  // ── common_emitter ──────────────────────────────────────────────────────────
  { id: "ce1", prompt: "common emitter amplifier gain 20", type: "common_emitter", targets: { Av: 20 }, difficulty: "easy", style: "canonical" },
  { id: "ce2", prompt: "BJT amplifier with voltage gain 50", type: "common_emitter", targets: { Av: 50 }, difficulty: "medium", style: "canonical" },
  { id: "ce3", prompt: "transistor amp gain of 30", type: "common_emitter", targets: { Av: 30 }, difficulty: "medium", style: "colloquial" },
  { id: "ce4", prompt: "common-emitter stage, Av=15", type: "common_emitter", targets: { Av: 15 }, difficulty: "medium", style: "canonical" },

  // ── opamp_inverting ─────────────────────────────────────────────────────────
  { id: "inv1", prompt: "inverting amplifier gain 10", type: "opamp_inverting", targets: { Av: 10 }, difficulty: "easy", style: "canonical" },
  { id: "inv2", prompt: "inverting op-amp with gain of 25", type: "opamp_inverting", targets: { Av: 25 }, difficulty: "easy", style: "canonical" },
  { id: "inv3", prompt: "op-amp inverting, Av = 5", type: "opamp_inverting", targets: { Av: 5 }, difficulty: "medium", style: "canonical" },
  { id: "inv4", prompt: "invert the signal and amplify it 100 times", type: "opamp_inverting", targets: { Av: 100 }, difficulty: "hard", style: "colloquial" },

  // ── opamp_noninverting ──────────────────────────────────────────────────────
  { id: "ninv1", prompt: "non-inverting amplifier gain 11", type: "opamp_noninverting", targets: { Av: 11 }, difficulty: "easy", style: "canonical" },
  { id: "ninv2", prompt: "noninverting op-amp gain 2", type: "opamp_noninverting", targets: { Av: 2 }, difficulty: "easy", style: "canonical" },
  { id: "ninv3", prompt: "non inverting amp, gain 40", type: "opamp_noninverting", targets: { Av: 40 }, difficulty: "medium", style: "canonical" },
  { id: "ninv4", prompt: "buffer and boost by 3x without flipping the signal", type: "opamp_noninverting", targets: { Av: 3 }, difficulty: "hard", style: "colloquial" },

  // ── band_pass ───────────────────────────────────────────────────────────────
  { id: "bp1", prompt: "band pass filter 200Hz to 2kHz", type: "band_pass", targets: { fL: 200, fH: 2000 }, difficulty: "easy", style: "canonical" },
  { id: "bp2", prompt: "bandpass from 300 to 3000 Hz", type: "band_pass", targets: { fL: 300, fH: 3000 }, difficulty: "easy", style: "canonical" },
  { id: "bp3", prompt: "pass band between 1kHz and 10kHz", type: "band_pass", targets: { fL: 1000, fH: 10000 }, difficulty: "medium", style: "canonical" },
  { id: "bp4", prompt: "band-pass filter for audio, 100Hz to 8kHz", type: "band_pass", targets: { fL: 100, fH: 8000 }, difficulty: "hard", style: "colloquial" },

  // ── zener_regulator ─────────────────────────────────────────────────────────
  { id: "zn1", prompt: "zener regulator 12V to 5V", type: "zener_regulator", targets: { Vin: 12, Vz: 5 }, difficulty: "easy", style: "canonical" },
  { id: "zn2", prompt: "zener diode regulator, 15V input, 5.1V output", type: "zener_regulator", targets: { Vin: 15, Vz: 5.1 }, difficulty: "medium", style: "canonical" },
  { id: "zn3", prompt: "regulate 9V down to 3.3V with a zener", type: "zener_regulator", targets: { Vin: 9, Vz: 3.3 }, difficulty: "medium", style: "colloquial" },

  // ── rc_oscillator ───────────────────────────────────────────────────────────
  { id: "osc1", prompt: "wien bridge oscillator 1kHz", type: "rc_oscillator", targets: { f: 1000 }, difficulty: "easy", style: "canonical" },
  { id: "osc2", prompt: "RC oscillator at 2 kHz", type: "rc_oscillator", targets: { f: 2000 }, difficulty: "medium", style: "canonical" },
  { id: "osc3", prompt: "phase shift oscillator 1kHz", type: "rc_oscillator", targets: { f: 1000 }, difficulty: "medium", style: "canonical" },
  { id: "osc4", prompt: "generate a 500 Hz sine wave", type: "rc_oscillator", targets: { f: 500 }, difficulty: "hard", style: "colloquial" },
];

/** Group the dataset by expected type. */
export function datasetByType() {
  const by = {};
  for (const item of DATASET) (by[item.type] = by[item.type] || []).push(item);
  return by;
}
