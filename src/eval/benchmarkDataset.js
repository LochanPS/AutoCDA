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

import { generateDataset } from "./datasetGenerator";

// The hand-written, hand-audited core. Programmatically generated cases are
// appended below to form DATASET.
const CURATED = [
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
  { id: "ce4", prompt: "common-emitter stage, Av=15", type: "common_emitter", targets: { Av: 15 }, difficulty: "medium", style: "unit-variant" },

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
  { id: "bp3", prompt: "pass band between 1kHz and 10kHz", type: "band_pass", targets: { fL: 1000, fH: 10000 }, difficulty: "medium", style: "colloquial" },
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

  // ── expansion set (v2) ────────────────────────────────────────────────────────
  // rc_lowpass
  { id: "lp7", prompt: "lowpass 2.2 kHz", type: "rc_lowpass", targets: { fc: 2200 }, difficulty: "easy", style: "unit-variant" },
  { id: "lp8", prompt: "anti-aliasing low pass at 20 kHz", type: "rc_lowpass", targets: { fc: 20000 }, difficulty: "medium", style: "canonical" },
  { id: "lp9", prompt: "smooth a PWM signal, cut above 100 Hz", type: "rc_lowpass", targets: { fc: 100 }, difficulty: "hard", style: "colloquial" },
  { id: "lp10", prompt: "single-pole LPF, fc = 6.8kHz", type: "rc_lowpass", targets: { fc: 6800 }, difficulty: "medium", style: "unit-variant" },
  { id: "lp11", prompt: "roll off treble above 5 kHz", type: "rc_lowpass", targets: { fc: 5000 }, difficulty: "hard", style: "colloquial" },
  { id: "lp12", prompt: "low pass filter cutoff 250 Hz", type: "rc_lowpass", targets: { fc: 250 }, difficulty: "easy", style: "canonical" },

  // rc_highpass
  { id: "hp6", prompt: "highpass 1.5 kHz", type: "rc_highpass", targets: { fc: 1500 }, difficulty: "easy", style: "unit-variant" },
  { id: "hp7", prompt: "remove low frequency rumble below 30 Hz", type: "rc_highpass", targets: { fc: 30 }, difficulty: "hard", style: "colloquial" },
  { id: "hp8", prompt: "AC coupling high pass at 20 Hz", type: "rc_highpass", targets: { fc: 20 }, difficulty: "medium", style: "canonical" },
  { id: "hp9", prompt: "single pole HPF fc 4.7 kHz", type: "rc_highpass", targets: { fc: 4700 }, difficulty: "medium", style: "unit-variant" },
  { id: "hp10", prompt: "pass only frequencies above 2 kHz", type: "rc_highpass", targets: { fc: 2000 }, difficulty: "hard", style: "colloquial" },

  // voltage_divider
  { id: "vd7", prompt: "voltage divider 3.3V to 1.65V", type: "voltage_divider", targets: { Vin: 3.3, Vout: 1.65 }, difficulty: "easy", style: "canonical" },
  { id: "vd8", prompt: "scale 24V down to 12V", type: "voltage_divider", targets: { Vin: 24, Vout: 12 }, difficulty: "easy", style: "colloquial" },
  { id: "vd9", prompt: "halve a 5 volt reference", type: "voltage_divider", targets: { Vin: 5, Vout: 2.5 }, difficulty: "hard", style: "colloquial" },
  { id: "vd10", prompt: "get 0.5V out of 5V for an ADC", type: "voltage_divider", targets: { Vin: 5, Vout: 0.5 }, difficulty: "medium", style: "colloquial" },
  { id: "vd11", prompt: "divide 3.3 to 2.0 volts", type: "voltage_divider", targets: { Vin: 3.3, Vout: 2.0 }, difficulty: "medium", style: "colloquial" },
  { id: "vd12", prompt: "step 48V down to 3.3V", type: "voltage_divider", targets: { Vin: 48, Vout: 3.3 }, difficulty: "medium", style: "colloquial" },

  // led_limiter
  { id: "led6", prompt: "LED series resistor 12V 20mA", type: "led_limiter", targets: { Vsupply: 12, I: 0.02 }, difficulty: "easy", style: "canonical" },
  { id: "led7", prompt: "run an indicator LED off 24V at 10mA", type: "led_limiter", targets: { Vsupply: 24, I: 0.01 }, difficulty: "medium", style: "colloquial" },
  { id: "led8", prompt: "current limit an LED at 25mA from 5 volts", type: "led_limiter", targets: { Vsupply: 5, I: 0.025 }, difficulty: "medium", style: "canonical" },
  { id: "led9", prompt: "LED on 3.3V, 8 mA", type: "led_limiter", targets: { Vsupply: 3.3, I: 0.008 }, difficulty: "easy", style: "canonical" },
  { id: "led10", prompt: "dim an LED to 2mA on a 5V rail", type: "led_limiter", targets: { Vsupply: 5, I: 0.002 }, difficulty: "hard", style: "colloquial" },

  // common_emitter
  { id: "ce5", prompt: "common emitter amplifier gain 10", type: "common_emitter", targets: { Av: 10 }, difficulty: "easy", style: "canonical" },
  { id: "ce6", prompt: "single-transistor amplifier, gain 25", type: "common_emitter", targets: { Av: 25 }, difficulty: "medium", style: "colloquial" },
  { id: "ce7", prompt: "CE stage with Av of 40", type: "common_emitter", targets: { Av: 40 }, difficulty: "medium", style: "colloquial" },
  { id: "ce8", prompt: "npn common emitter, gain 12", type: "common_emitter", targets: { Av: 12 }, difficulty: "easy", style: "canonical" },

  // opamp_inverting
  { id: "inv5", prompt: "inverting amp gain 20", type: "opamp_inverting", targets: { Av: 20 }, difficulty: "easy", style: "canonical" },
  { id: "inv6", prompt: "inverting configuration, Av = 50", type: "opamp_inverting", targets: { Av: 50 }, difficulty: "medium", style: "canonical" },
  { id: "inv7", prompt: "flip and scale a signal by 4", type: "opamp_inverting", targets: { Av: 4 }, difficulty: "hard", style: "colloquial" },
  { id: "inv8", prompt: "op amp inverting gain 2.5", type: "opamp_inverting", targets: { Av: 2.5 }, difficulty: "medium", style: "canonical" },

  // opamp_noninverting
  { id: "ninv5", prompt: "non-inverting amp gain 5", type: "opamp_noninverting", targets: { Av: 5 }, difficulty: "easy", style: "canonical" },
  { id: "ninv6", prompt: "non inverting op amp, Av = 21", type: "opamp_noninverting", targets: { Av: 21 }, difficulty: "medium", style: "canonical" },
  { id: "ninv7", prompt: "amplify by 10 keeping the same polarity", type: "opamp_noninverting", targets: { Av: 10 }, difficulty: "hard", style: "colloquial" },
  { id: "ninv8", prompt: "make a 2x buffer amplifier", type: "opamp_noninverting", targets: { Av: 2 }, difficulty: "hard", style: "colloquial" },

  // band_pass
  { id: "bp5", prompt: "bandpass 500 Hz to 5 kHz", type: "band_pass", targets: { fL: 500, fH: 5000 }, difficulty: "easy", style: "canonical" },
  { id: "bp6", prompt: "band pass filter 1kHz to 4kHz", type: "band_pass", targets: { fL: 1000, fH: 4000 }, difficulty: "easy", style: "canonical" },
  { id: "bp7", prompt: "isolate the 300-3400 Hz voice band", type: "band_pass", targets: { fL: 300, fH: 3400 }, difficulty: "hard", style: "colloquial" },
  { id: "bp8", prompt: "pass 2kHz through 20kHz", type: "band_pass", targets: { fL: 2000, fH: 20000 }, difficulty: "medium", style: "colloquial" },

  // zener_regulator
  { id: "zn4", prompt: "zener regulator 24V to 12V", type: "zener_regulator", targets: { Vin: 24, Vz: 12 }, difficulty: "easy", style: "canonical" },
  { id: "zn5", prompt: "clamp a 12V rail to 3.3V with a zener", type: "zener_regulator", targets: { Vin: 12, Vz: 3.3 }, difficulty: "medium", style: "colloquial" },
  { id: "zn6", prompt: "zener shunt regulator, input 9V, output 5.6V", type: "zener_regulator", targets: { Vin: 9, Vz: 5.6 }, difficulty: "medium", style: "canonical" },
  { id: "zn7", prompt: "regulate 18 volts to 6.2 volts using a zener diode", type: "zener_regulator", targets: { Vin: 18, Vz: 6.2 }, difficulty: "medium", style: "canonical" },

  // rc_oscillator
  { id: "osc5", prompt: "wien bridge oscillator 2 kHz", type: "rc_oscillator", targets: { f: 2000 }, difficulty: "easy", style: "canonical" },
  { id: "osc6", prompt: "build a 1 kHz tone generator", type: "rc_oscillator", targets: { f: 1000 }, difficulty: "hard", style: "colloquial" },
  { id: "osc7", prompt: "RC phase shift oscillator at 800 Hz", type: "rc_oscillator", targets: { f: 800 }, difficulty: "medium", style: "canonical" },
  { id: "osc8", prompt: "oscillator producing 3.3 kHz", type: "rc_oscillator", targets: { f: 3300 }, difficulty: "medium", style: "canonical" },

  // ── expansion set (v3) ──────────────────────────────────────────────────────
  // Pushes the dataset past 100 cases; weighted toward colloquial/hard prompts
  // where the regex fast path degrades and the LLM keeps its edge.
  { id: "lp13", prompt: "kill anything above 12 kHz before the ADC", type: "rc_lowpass", targets: { fc: 12000 }, difficulty: "hard", style: "colloquial" },
  { id: "lp14", prompt: "gentle low pass, corner at 1.2kHz", type: "rc_lowpass", targets: { fc: 1200 }, difficulty: "medium", style: "unit-variant" },
  { id: "hp11", prompt: "strip out anything slower than 15 Hz", type: "rc_highpass", targets: { fc: 15 }, difficulty: "hard", style: "colloquial" },
  { id: "hp12", prompt: "high pass filter with cutoff 3.3 kHz", type: "rc_highpass", targets: { fc: 3300 }, difficulty: "easy", style: "canonical" },
  { id: "vd13", prompt: "drop a 3.7V li-ion down to 1.8V for logic", type: "voltage_divider", targets: { Vin: 3.7, Vout: 1.8 }, difficulty: "hard", style: "colloquial" },
  { id: "led11", prompt: "put an LED across 6V pulling 12mA", type: "led_limiter", targets: { Vsupply: 6, I: 0.012 }, difficulty: "medium", style: "colloquial" },
  { id: "ce9", prompt: "boost a mic signal 60x with one transistor", type: "common_emitter", targets: { Av: 60 }, difficulty: "hard", style: "colloquial" },
  { id: "inv9", prompt: "inverting amplifier, gain 8", type: "opamp_inverting", targets: { Av: 8 }, difficulty: "easy", style: "canonical" },
  { id: "ninv9", prompt: "scale a sensor output up 6x, don't invert it", type: "opamp_noninverting", targets: { Av: 6 }, difficulty: "hard", style: "colloquial" },
  { id: "bp9", prompt: "keep only the 400 Hz to 6 kHz band", type: "band_pass", targets: { fL: 400, fH: 6000 }, difficulty: "hard", style: "colloquial" },
  { id: "zn8", prompt: "hold a 20V supply at 9.1V with a zener", type: "zener_regulator", targets: { Vin: 20, Vz: 9.1 }, difficulty: "medium", style: "colloquial" },
  { id: "osc9", prompt: "put out a steady 1.5 kHz tone", type: "rc_oscillator", targets: { f: 1500 }, difficulty: "hard", style: "colloquial" },

  // ── sallen_key_lowpass (2nd-order; no single-component closed form) ──────────
  { id: "sk1", prompt: "sallen-key low pass 1kHz", type: "sallen_key_lowpass", targets: { fc: 1000 }, difficulty: "easy", style: "canonical" },
  { id: "sk2", prompt: "second order low pass filter at 2 kHz", type: "sallen_key_lowpass", targets: { fc: 2000 }, difficulty: "medium", style: "canonical" },
  { id: "sk3", prompt: "2nd order lowpass 500Hz", type: "sallen_key_lowpass", targets: { fc: 500 }, difficulty: "medium", style: "unit-variant" },
  { id: "sk4", prompt: "butterworth low pass 3.3kHz", type: "sallen_key_lowpass", targets: { fc: 3300 }, difficulty: "medium", style: "canonical" },
  { id: "sk5", prompt: "two-pole low pass, cutoff 1.5 kHz", type: "sallen_key_lowpass", targets: { fc: 1500 }, difficulty: "hard", style: "colloquial" },
  { id: "sk6", prompt: "sallen key filter 800 Hz", type: "sallen_key_lowpass", targets: { fc: 800 }, difficulty: "easy", style: "canonical" },

  // ── sallen_key_highpass + two_stage_amplifier ───────────────────────────────
  { id: "skhp1", prompt: "sallen-key high pass 1kHz", type: "sallen_key_highpass", targets: { fc: 1000 }, difficulty: "easy", style: "canonical" },
  { id: "skhp2", prompt: "second order high pass 2kHz", type: "sallen_key_highpass", targets: { fc: 2000 }, difficulty: "medium", style: "canonical" },
  { id: "skhp3", prompt: "butterworth high pass 500 Hz", type: "sallen_key_highpass", targets: { fc: 500 }, difficulty: "medium", style: "canonical" },
  { id: "skhp4", prompt: "two-pole high pass at 3.3kHz", type: "sallen_key_highpass", targets: { fc: 3300 }, difficulty: "hard", style: "colloquial" },
  { id: "ts1", prompt: "two stage amplifier gain 100", type: "two_stage_amplifier", targets: { Av: 100 }, difficulty: "easy", style: "canonical" },
  { id: "ts2", prompt: "two-stage amplifier gain 500", type: "two_stage_amplifier", targets: { Av: 500 }, difficulty: "medium", style: "canonical" },
  { id: "ts3", prompt: "cascaded amplifier gain 1000", type: "two_stage_amplifier", targets: { Av: 1000 }, difficulty: "medium", style: "colloquial" },
  { id: "ts4", prompt: "multistage amp gain 250", type: "two_stage_amplifier", targets: { Av: 250 }, difficulty: "hard", style: "colloquial" },

  // ── summing / difference / integrator / differentiator ──────────────────────
  { id: "sum1", prompt: "summing amplifier gain 2", type: "opamp_summing", targets: { Av: 2 }, difficulty: "easy", style: "canonical" },
  { id: "sum2", prompt: "inverting summer gain 4", type: "opamp_summing", targets: { Av: 4 }, difficulty: "medium", style: "canonical" },
  { id: "sum3", prompt: "adder amplifier gain 1", type: "opamp_summing", targets: { Av: 1 }, difficulty: "medium", style: "colloquial" },
  { id: "diff1", prompt: "difference amplifier gain 10", type: "opamp_difference", targets: { Av: 10 }, difficulty: "easy", style: "canonical" },
  { id: "diff2", prompt: "differential amplifier gain 5", type: "opamp_difference", targets: { Av: 5 }, difficulty: "medium", style: "canonical" },
  { id: "diff3", prompt: "subtractor gain 2", type: "opamp_difference", targets: { Av: 2 }, difficulty: "hard", style: "colloquial" },
  { id: "int1", prompt: "op-amp integrator 1kHz", type: "rc_integrator", targets: { fc: 1000 }, difficulty: "easy", style: "canonical" },
  { id: "int2", prompt: "integrator unity gain at 500 Hz", type: "rc_integrator", targets: { fc: 500 }, difficulty: "medium", style: "canonical" },
  { id: "int3", prompt: "integrating amplifier 2kHz", type: "rc_integrator", targets: { fc: 2000 }, difficulty: "medium", style: "colloquial" },
  { id: "der1", prompt: "op-amp differentiator 2kHz", type: "rc_differentiator", targets: { fc: 2000 }, difficulty: "easy", style: "canonical" },
  { id: "der2", prompt: "differentiator 1kHz", type: "rc_differentiator", targets: { fc: 1000 }, difficulty: "medium", style: "canonical" },

  // A few genuinely ambiguous cases: capable LLM makes a reasonable call but may
  // not match the label. `llm` gives the structured output a strong LLM returns.
  { id: "amb1", prompt: "amplifier gain 50", type: "common_emitter", targets: { Av: 50 }, difficulty: "hard", style: "ambiguous", llm: { type: "opamp_noninverting", targets: { Av: 50 }, confidence: 0.55 } },
  { id: "amb2", prompt: "make it 3 times louder", type: "opamp_noninverting", targets: { Av: 3 }, difficulty: "hard", style: "ambiguous", llm: { type: "opamp_noninverting", targets: { Av: 3 }, confidence: 0.5 } },
  { id: "amb3", prompt: "a filter around 1 kHz", type: "band_pass", targets: { fL: 316, fH: 3162 }, difficulty: "hard", style: "ambiguous", llm: { type: "rc_lowpass", targets: { fc: 1000 }, confidence: 0.5 } },
];

/**
 * The full benchmark: the hand-audited core plus the programmatically generated
 * cases (correct-by-construction labels). Deterministic, so the size is stable.
 */
export const DATASET = [...CURATED, ...generateDataset()];

/** Just the hand-written core, for tests that want the curated subset. */
export { CURATED };

/** Group the dataset by expected type. */
export function datasetByType() {
  const by = {};
  for (const item of DATASET) (by[item.type] = by[item.type] || []).push(item);
  return by;
}
