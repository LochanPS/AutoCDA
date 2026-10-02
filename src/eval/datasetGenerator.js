/**
 * datasetGenerator.js — programmatic expansion of the benchmark corpus.
 *
 * The curated set in benchmarkDataset.js is hand-written and hand-audited. This
 * module deterministically GENERATES many more labelled cases by combining, per
 * circuit type, a pool of realistic target values with a set of phrasing
 * templates tagged by style. Labels are correct BY CONSTRUCTION (the template
 * owns the type and the numeric target), so no manual audit is needed.
 *
 * Deterministic: no randomness, so the dataset is stable across runs/CI. Styles
 * mirror the curated set (canonical / colloquial / unit-variant), and difficulty
 * follows the template class (canonical=easy/medium, colloquial=hard).
 *
 * Used by benchmarkDataset.js:  DATASET = [...CURATED, ...generateDataset()].
 */

// ── value pools (base SI) ─────────────────────────────────────────────────────
const FREQS = [47, 68, 100, 150, 220, 330, 470, 680, 1000, 1500, 2200, 3300, 4700, 6800, 10000, 15000, 22000, 33000, 47000];
const GAINS = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 33, 40, 50, 68, 100];
const DIVIDERS = [[9, 3.3], [12, 5], [12, 3.3], [5, 1.8], [5, 2.5], [24, 12], [24, 5], [15, 5], [15, 3.3], [48, 12], [3.3, 1.65], [3.7, 1.8], [18, 9], [6, 3]];
const LEDS = [[5, 0.02], [5, 0.01], [5, 0.005], [9, 0.02], [12, 0.02], [12, 0.01], [3.3, 0.005], [3.3, 0.01], [24, 0.01], [6, 0.015], [5, 0.025]];
const ZENERS = [[12, 5], [12, 3.3], [15, 5.1], [9, 5.6], [24, 12], [18, 6.2], [20, 9.1], [15, 6.8], [9, 3.3], [12, 6.2]];
const BANDS = [[200, 2000], [300, 3000], [500, 5000], [1000, 10000], [100, 8000], [400, 6000], [250, 2500], [600, 6000], [150, 1500]];

// ── unit-rendering helpers (one value, several realistic spellings) ───────────
function freqStrings(f) {
  const out = [`${f} Hz`, `${f}hz`];
  if (f % 1000 === 0) out.push(`${f / 1000}kHz`, `${f / 1000} kHz`);
  else if (f >= 1000) out.push(`${(f / 1000)}kHz`, `${(f / 1000).toFixed(1)} kHz`);
  return out;
}
const V = (v) => (Number.isInteger(v) ? `${v}V` : `${v}V`);
const mA = (i) => `${Math.round(i * 1000)}mA`;

// pick a deterministic element from arr by index
const pick = (arr, i) => arr[i % arr.length];

// ── per-type generators ───────────────────────────────────────────────────────
// Each template: { t: (valueStrings) => prompt, style, difficulty }
function freqType(type, pool, templates, idPrefix, fieldKey = "fc") {
  const cases = [];
  pool.forEach((f, i) => {
    const fs = freqStrings(f);
    templates.forEach((tpl, j) => {
      const fstr = pick(fs, i + j);
      cases.push({
        id: `${idPrefix}${i}_${j}`,
        prompt: tpl.t(fstr),
        type,
        targets: { [fieldKey]: f },
        difficulty: tpl.difficulty,
        style: tpl.style,
      });
    });
  });
  return cases;
}

function gainType(type, templates, idPrefix) {
  const cases = [];
  GAINS.forEach((g, i) => {
    templates.forEach((tpl, j) => {
      cases.push({
        id: `${idPrefix}${i}_${j}`,
        prompt: tpl.t(g),
        type,
        targets: { Av: g },
        difficulty: tpl.difficulty,
        style: tpl.style,
      });
    });
  });
  return cases;
}

export function generateDataset() {
  const cases = [];

  // rc_lowpass
  cases.push(...freqType("rc_lowpass", FREQS, [
    { t: (f) => `low pass filter ${f}`, style: "canonical", difficulty: "easy" },
    { t: (f) => `lpf ${f}`, style: "unit-variant", difficulty: "medium" },
    { t: (f) => `cut everything above ${f}`, style: "colloquial", difficulty: "hard" },
  ], "glp"));

  // rc_highpass
  cases.push(...freqType("rc_highpass", FREQS, [
    { t: (f) => `high pass filter ${f}`, style: "canonical", difficulty: "easy" },
    { t: (f) => `hpf ${f}`, style: "unit-variant", difficulty: "medium" },
    { t: (f) => `block everything below ${f}`, style: "colloquial", difficulty: "hard" },
  ], "ghp"));

  // sallen_key_lowpass
  cases.push(...freqType("sallen_key_lowpass", FREQS, [
    { t: (f) => `sallen-key low pass ${f}`, style: "canonical", difficulty: "medium" },
    { t: (f) => `second order low pass ${f}`, style: "canonical", difficulty: "medium" },
    { t: (f) => `two-pole lowpass at ${f}`, style: "colloquial", difficulty: "hard" },
  ], "gsk"));

  // rc_oscillator
  cases.push(...freqType("rc_oscillator", FREQS.slice(0, 12), [
    { t: (f) => `wien bridge oscillator ${f}`, style: "canonical", difficulty: "easy" },
    { t: (f) => `generate a ${f} sine wave`, style: "colloquial", difficulty: "hard" },
  ], "gosc", "f"));

  // common_emitter
  cases.push(...gainType("common_emitter", [
    { t: (g) => `common emitter amplifier gain ${g}`, style: "canonical", difficulty: "easy" },
    { t: (g) => `transistor amp gain of ${g}`, style: "colloquial", difficulty: "medium" },
  ], "gce"));

  // opamp_inverting
  cases.push(...gainType("opamp_inverting", [
    { t: (g) => `inverting amplifier gain ${g}`, style: "canonical", difficulty: "easy" },
    { t: (g) => `invert and amplify by ${g}`, style: "colloquial", difficulty: "hard" },
  ], "ginv"));

  // opamp_noninverting
  cases.push(...gainType("opamp_noninverting", [
    { t: (g) => `non-inverting amplifier gain ${g}`, style: "canonical", difficulty: "easy" },
    { t: (g) => `amplify by ${g} without inverting`, style: "colloquial", difficulty: "hard" },
  ], "gninv"));

  // voltage_divider
  DIVIDERS.forEach(([Vin, Vout], i) => {
    const tpls = [
      { t: () => `voltage divider ${V(Vin)} to ${V(Vout)}`, style: "canonical", difficulty: "easy" },
      { t: () => `step down ${V(Vin)} to ${V(Vout)}`, style: "colloquial", difficulty: "medium" },
      { t: () => `scale ${V(Vin)} down to ${V(Vout)}`, style: "colloquial", difficulty: "hard" },
    ];
    tpls.forEach((tpl, j) => cases.push({ id: `gvd${i}_${j}`, prompt: tpl.t(), type: "voltage_divider", targets: { Vin, Vout }, difficulty: tpl.difficulty, style: tpl.style }));
  });

  // led_limiter
  LEDS.forEach(([Vsupply, I], i) => {
    const tpls = [
      { t: () => `LED current limiter ${V(Vsupply)} ${mA(I)}`, style: "canonical", difficulty: "easy" },
      { t: () => `drive an LED from ${V(Vsupply)} at ${mA(I)}`, style: "colloquial", difficulty: "medium" },
      { t: () => `limit an LED to ${mA(I)} off ${V(Vsupply)}`, style: "colloquial", difficulty: "hard" },
    ];
    tpls.forEach((tpl, j) => cases.push({ id: `gled${i}_${j}`, prompt: tpl.t(), type: "led_limiter", targets: { Vsupply, I }, difficulty: tpl.difficulty, style: tpl.style }));
  });

  // zener_regulator
  ZENERS.forEach(([Vin, Vz], i) => {
    const tpls = [
      { t: () => `zener regulator ${V(Vin)} to ${V(Vz)}`, style: "canonical", difficulty: "easy" },
      { t: () => `regulate ${V(Vin)} down to ${V(Vz)} with a zener`, style: "colloquial", difficulty: "medium" },
    ];
    tpls.forEach((tpl, j) => cases.push({ id: `gzn${i}_${j}`, prompt: tpl.t(), type: "zener_regulator", targets: { Vin, Vz }, difficulty: tpl.difficulty, style: tpl.style }));
  });

  // band_pass
  BANDS.forEach(([fL, fH], i) => {
    const tpls = [
      { t: () => `band pass filter ${fL}Hz to ${fH}Hz`, style: "canonical", difficulty: "easy" },
      { t: () => `pass only ${fL} to ${fH} Hz`, style: "colloquial", difficulty: "hard" },
      { t: () => `bandpass ${fL} to ${fH} Hz`, style: "canonical", difficulty: "medium" },
    ];
    tpls.forEach((tpl, j) => cases.push({ id: `gbp${i}_${j}`, prompt: tpl.t(), type: "band_pass", targets: { fL, fH }, difficulty: tpl.difficulty, style: tpl.style }));
  });

  return cases;
}
