/**
 * measure.js — pure analyzers over a parsed SPICE result.
 *
 * No dependency on the wasm engine, so agents and tests can import these without
 * pulling in eecircuit-engine. spice.js re-exports them for convenience.
 */

// ── node lookup (tolerant of case and the v()/i() wrapper) ───────────────────

export function findNodeKey(result, name) {
  if (!name) return null;
  const keys = Object.keys(result.nodes);
  const want = name.toLowerCase();
  const bare = want.replace(/^[vi]\((.*)\)$/, "$1");
  return (
    keys.find((k) => k.toLowerCase() === want) ||
    keys.find((k) => k.toLowerCase().replace(/^[vi]\((.*)\)$/, "$1") === bare) ||
    null
  );
}

/** Magnitude array for a node, or null if not found. */
export function nodeMag(result, name) {
  const key = findNodeKey(result, name);
  return key ? result.nodes[key] : null;
}

// ── analyzers ────────────────────────────────────────────────────────────────

/**
 * -3 dB frequency from an AC sweep. Uses the passband peak as the 0 dB
 * reference and linearly interpolates (in log-frequency) the crossing of
 * peak/√2. Works for low-pass and high-pass; for band-pass returns the first
 * crossing. Pass a node name, or the last output node is used by default.
 * @returns {number|null} frequency in Hz
 */
export function measureCutoff(result, node) {
  const mag =
    (node && nodeMag(result, node)) ||
    result.nodes[Object.keys(result.nodes).pop()];
  const freq = result.sweep;
  if (!mag || mag.length < 2 || !freq) return null;

  const peak = Math.max(...mag);
  if (peak <= 0) return null;
  const target = peak / Math.SQRT2;

  for (let i = 1; i < mag.length; i++) {
    const a = mag[i - 1];
    const b = mag[i];
    if ((a >= target && b < target) || (a < target && b >= target)) {
      // Linear interpolation in log10(freq) for accuracy across decades.
      const f0 = freq[i - 1];
      const f1 = freq[i];
      if (a === b) return f1;
      const t = (target - a) / (b - a);
      const logF = Math.log10(f0) + t * (Math.log10(f1) - Math.log10(f0));
      return Math.pow(10, logF);
    }
  }
  return null;
}

/**
 * Mid-band gain = |outNode| / |inNode|, evaluated where |outNode| peaks.
 * If inNode is omitted (or the source is a unit AC source), |in| defaults to 1.
 * @returns {number|null}
 */
export function measureGain(result, inNode, outNode) {
  const out = nodeMag(result, outNode);
  if (!out || !out.length) return null;

  let idx = 0;
  for (let i = 1; i < out.length; i++) if (out[i] > out[idx]) idx = i;

  const inMag = inNode ? nodeMag(result, inNode) : null;
  const denom = inMag && inMag[idx] ? inMag[idx] : 1;
  return out[idx] / denom;
}

/**
 * Unity-gain (0 dB) frequency: the frequency where |outNode/inNode| crosses 1.
 * For integrators (falling) and differentiators (rising) this is the 1/(2πRC)
 * corner. Interpolated in log-frequency. Returns the first crossing, or null.
 * @returns {number|null} frequency in Hz
 */
export function measureUnityGainFreq(result, inNode, outNode) {
  const out = nodeMag(result, outNode);
  const freq = result.sweep;
  if (!out || out.length < 2 || !freq) return null;
  const inMag = inNode ? nodeMag(result, inNode) : null;
  const gain = out.map((v, i) => v / ((inMag && inMag[i]) || 1));
  for (let i = 1; i < gain.length; i++) {
    const a = gain[i - 1];
    const b = gain[i];
    if ((a <= 1 && b >= 1) || (a >= 1 && b <= 1)) {
      if (a === b) return freq[i];
      const t = (1 - a) / (b - a);
      const logF = Math.log10(freq[i - 1]) + t * (Math.log10(freq[i]) - Math.log10(freq[i - 1]));
      return Math.pow(10, logF);
    }
  }
  return null;
}

/**
 * DC node value — the value at the last swept point (a single-point .dc or .op
 * yields one point).
 * @returns {number|null}
 */
export function measureDC(result, node) {
  const mag = nodeMag(result, node);
  if (!mag || !mag.length) return null;
  return mag[mag.length - 1];
}
