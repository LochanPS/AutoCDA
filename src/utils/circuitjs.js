// Generates Falstad CircuitJS URLs for each circuit type.
// Uses LZString.compressToEncodedURIComponent — the exact encoding Falstad expects.
// URL format: https://www.falstad.com/circuit/circuitjs.html?ctz=<compressed>

import LZString from "lz-string";

const HEADER = "$ 1 0.000005 10.20027730826997 50 5 50 5e-11";

function makeURL(circuitText) {
  const compressed = LZString.compressToEncodedURIComponent(circuitText);
  return `https://www.falstad.com/circuit/circuitjs.html?ctz=${compressed}`;
}

function makeEmbed(circuitText) {
  // Returns just the ctz parameter for iframe src
  const compressed = LZString.compressToEncodedURIComponent(circuitText);
  return `ctz=${compressed}`;
}

// ── circuit text generators ───────────────────────────────────────────────────
// Coordinates in Falstad pixel grid (each cell = 16px).
// v = voltage source, r = resistor, c = capacitor, d = diode,
// g = ground, t = BJT transistor, a = op-amp
// Voltage source flags: 0=DC, 1=AC sine, 5=square

function rcLowpassText(R, C) {
  // V(AC) → R1(horizontal) → node → C1(vertical to GND) → Vout at node
  const fc = Math.round(1 / (2 * Math.PI * R * C));
  return [
    HEADER,
    `v 192 352 192 48 0 1 ${fc} 5 0 0 0.5`,   // AC source at cutoff frequency
    `r 192 48 400 48 0 ${R}`,                  // R1 horizontal
    `c 400 48 400 352 0 ${C} 0 0.01`,          // C1 vertical
    `g 192 352 192 400 0 0`,                   // GND left
    `g 400 352 400 400 0 0`,                   // GND right
    `o 1 64 1 4099 5 0.00009765625 0 2 1 3`,   // scope probe at R1-C1 node
  ].join("\n");
}

function rcHighpassText(R, C) {
  // V(AC) → C1(horizontal) → node → R1(vertical to GND) → Vout at node
  const fc = Math.round(1 / (2 * Math.PI * R * C));
  return [
    HEADER,
    `v 192 352 192 48 0 1 ${fc} 5 0 0 0.5`,   // AC source at cutoff frequency
    `c 192 48 400 48 0 ${C} 0 0.01`,           // C1 horizontal
    `r 400 48 400 352 0 ${R}`,                  // R1 vertical
    `g 192 352 192 400 0 0`,
    `g 400 352 400 400 0 0`,
    `o 1 64 1 4099 5 0.00009765625 0 2 1 3`,
  ].join("\n");
}

function voltageDividerText(Vin, R1, R2) {
  // V(DC) → R1(top half vertical) → midpoint → R2(bottom half) → GND
  return [
    HEADER,
    `v 144 352 144 48 0 0 40 ${Vin} 0 0 0.5`,  // DC source
    `r 288 48 288 208 0 ${R1}`,                 // R1 top
    `r 288 208 288 352 0 ${R2}`,                // R2 bottom
    `w 144 48 288 48 0`,                        // wire top
    `w 144 352 288 352 0`,                      // wire bottom
    `g 144 352 144 400 0 0`,
    `o 1 64 1 4099 ${Vin} 0.00009765625 0 2 1 3`, // probe at midpoint
  ].join("\n");
}

function ledLimiterText(Vsupply, R) {
  // V(DC) → R1(horizontal) → LED(vertical) → GND
  return [
    HEADER,
    `v 192 352 192 48 0 0 40 ${Vsupply} 0 0 0.5`,
    `r 192 48 352 48 0 ${R}`,                  // R1
    `d 352 48 352 352 0 1 0.805904783`,         // LED (diode type 1 with Vf~1.8V params)
    `g 192 352 192 400 0 0`,
    `g 352 352 352 400 0 0`,
  ].join("\n");
}

function commonEmitterText(RC, RE) {
  // Full common emitter with bias divider.
  // VCC=12V, R1=100k, R2=20k bias, RC collector, RE emitter, coupling cap.
  //
  // Node geometry (all junctions land on shared element POSTS — Falstad only
  // connects where posts coincide, never mid-element or mid-wire):
  //   BJT `t 368 256 448 256` → base=(368,256), collector=(448,240),
  //   emitter=(448,272)  [Falstad transistor leads are ±16px from the body].
  //   RC bottom post = collector post (448,240); RE top post = emitter post
  //   (448,272). Bias divider node = base level (256,256): R1 bottom, R2 top,
  //   coupling cap and the base wire all meet there.
  //   The VCC rail is split at x=256 so R1's top post shares a wire endpoint.
  return [
    HEADER,
    // VCC supply (DC 12V), left side
    `v 96 448 96 48 0 0 40 12 0 0 0.5`,
    // Top VCC rail, split so junctions are at wire endpoints (256,48) & (448,48)
    `w 96 48 256 48 0`,
    `w 256 48 448 48 0`,
    // Collector resistor RC: rail(448,48) → collector post(448,240)
    `r 448 48 448 240 0 ${RC}`,
    // BJT NPN: base(368,256), collector(448,240), emitter(448,272)
    `t 368 256 448 256 0 1 100 0.02 1`,
    // Emitter resistor RE: emitter post(448,272) → gnd node(448,448)
    `r 448 272 448 448 0 ${RE}`,
    // Grounds
    `g 96 448 96 496 0 0`,
    `g 448 448 448 496 0 0`,
    // Bias divider: R1 rail→base node, R2 base node→bottom rail
    `r 256 48 256 256 0 100000`,
    `r 256 256 256 448 0 20000`,
    // Bottom rail: R2 bottom(256,448) → VCC bottom / gnd(96,448)
    `w 256 448 96 448 0`,
    // Base node(256,256) → base terminal(368,256)
    `w 256 256 368 256 0`,
    // Coupling cap: AC input(160,256) → base node(256,256)
    `c 160 256 256 256 0 1e-5 0 0.01`,
    // AC input source
    `v 96 304 96 256 0 1 1000 0.1 0 0 0.5`,
    `w 96 256 160 256 0`,
    `g 96 304 96 352 0 0`,
    // Output probe at collector
    `o 2 64 2 4099 10 0.00009765625 0 2 2 3`,
  ].join("\n");
}

function bandPassText(R, C1, C2) {
  const fH = 1 / (2 * Math.PI * R * C1);
  const fL = 1 / (2 * Math.PI * R * C2);
  const fc = Math.round(Math.sqrt(fH * fL));
  return [
    HEADER,
    `v 96 352 96 48 0 1 ${fc} 5 0 0 0.5`,     // AC source at center frequency
    `c 96 48 256 48 0 ${C1} 0 0.01`,    // HP cap
    `r 256 48 256 352 0 ${R}`,           // HP shunt R
    `r 256 48 400 48 0 ${R}`,            // LP series R (reuse same node)
    `c 400 48 400 352 0 ${C2} 0 0.01`,  // LP cap
    `g 96 352 96 400 0 0`,
    `g 256 352 256 400 0 0`,
    `g 400 352 400 400 0 0`,
    `o 3 64 3 4099 5 0.00009765625 0 2 3 3`,
  ].join("\n");
}

function opampInvertingText(R1, Rf) {
  const testFreq = 1000; // 1 kHz test frequency
  return [
    HEADER,
    `v 96 352 96 48 0 1 ${testFreq} 0.1 0 0 0.5`,    // AC input at test frequency
    `r 96 176 256 176 0 ${R1}`,                        // R1 input resistor
    `r 256 80 400 80 0 ${Rf}`,                         // Rf feedback
    `a 256 160 400 160 8 15 -15 1000000 0`,            // op-amp (inverting)
    `w 256 176 256 160 0`,
    `w 96 352 96 400 0`,
    `g 96 400 96 448 0 0`,
    `g 400 160 400 208 0 0`,
    `o 3 64 3 4099 1 0.00009765625 0 2 3 3`,
  ].join("\n");
}

function opampNoninvertingText(R1, Rf) {
  const testFreq = 1000; // 1 kHz test frequency
  return [
    HEADER,
    `v 96 352 96 192 0 1 ${testFreq} 0.1 0 0 0.5`,   // AC input at test frequency
    `r 256 240 256 352 0 ${R1}`,                      // R1 to ground
    `r 256 240 400 240 0 ${Rf}`,                      // Rf feedback
    `a 256 224 400 224 8 15 -15 1000000 0`,           // op-amp
    `w 96 192 256 192 0`,
    `w 256 192 256 224 0`,                            // to non-inv input
    `g 96 352 96 400 0 0`,
    `g 256 352 256 400 0 0`,
    `o 3 64 3 4099 1 0.00009765625 0 2 3 3`,
  ].join("\n");
}

function zenerText(Vin, R, Vz) {
  return [
    HEADER,
    `v 192 352 192 48 0 0 40 ${Vin} 0 0 0.5`,
    `r 192 48 352 48 0 ${R}`,
    `z 352 352 352 48 0 ${Vz} 0.805904783`,   // Zener diode (reversed)
    `g 192 352 192 400 0 0`,
    `g 352 352 352 400 0 0`,
  ].join("\n");
}

function wienBridgeText(R, C) {
  const f_osc = Math.round(1 / (2 * Math.PI * R * C));
  return [
    HEADER,
    // Simplified Wien bridge (approximation in CircuitJS)
    `v 96 352 96 48 0 0 40 15 0 0 0.5`,
    `v 96 448 96 400 0 0 40 15 0 0 0.5`,   // negative supply
    `r 240 160 368 160 0 ${R}`,
    `c 368 160 368 288 0 ${C} 0 0.01`,
    `r 240 288 368 288 0 ${R}`,
    `c 240 160 240 288 0 ${C} 0 0.01`,
    `a 240 256 400 256 8 15 -15 1000000 0`,
    `r 400 256 400 352 0 10000`,
    `r 400 352 240 352 0 20000`,
    `g 96 352 96 500 0 0`,
    `g 96 448 96 500 0 0`,
  ].join("\n");
}

// ── public API ────────────────────────────────────────────────────────────────

export function getCircuitJSUrl(circuit) {
  if (!circuit) return null;
  const c = circuit.components;
  const get = (ref) => c.find(x => x.ref === ref)?.rawValue;

  switch (circuit.id) {
    case "rc_lowpass":
      return makeURL(rcLowpassText(get("R1"), get("C1")));

    case "rc_highpass":
      return makeURL(rcHighpassText(get("R1"), get("C1")));

    case "voltage_divider":
      return makeURL(voltageDividerText(
        circuit.derivedParams?.Vin || 12,
        get("R1"),
        get("R2")
      ));

    case "led_limiter":
      return makeURL(ledLimiterText(
        circuit.derivedParams?.Vsupply || 5,
        get("R1")
      ));

    case "common_emitter":
      return makeURL(commonEmitterText(get("RC"), get("RE")));

    case "band_pass":
      return makeURL(bandPassText(get("R1"), get("C1"), get("C2")));

    case "opamp_inverting":
      return makeURL(opampInvertingText(get("R1"), get("Rf")));

    case "opamp_noninverting":
      return makeURL(opampNoninvertingText(get("R1"), get("Rf")));

    case "zener_regulator":
      return makeURL(zenerText(
        circuit.derivedParams?.Vin || 12,
        get("R1"),
        circuit.derivedParams?.Vz || 5
      ));

    case "rc_oscillator":
      return makeURL(wienBridgeText(get("R1"), get("C1")));

    default:
      return null;
  }
}

export function getCircuitJSEmbed(circuit) {
  if (!circuit) return null;
  const c = circuit.components;
  const get = (ref) => c.find(x => x.ref === ref)?.rawValue;

  let text = null;

  switch (circuit.id) {
    case "rc_lowpass":
      text = rcLowpassText(get("R1"), get("C1"));
      break;
    case "rc_highpass":
      text = rcHighpassText(get("R1"), get("C1"));
      break;
    case "voltage_divider":
      text = voltageDividerText(circuit.derivedParams?.Vin || 12, get("R1"), get("R2"));
      break;
    case "led_limiter":
      text = ledLimiterText(circuit.derivedParams?.Vsupply || 5, get("R1"));
      break;
    case "common_emitter":
      text = commonEmitterText(get("RC"), get("RE"));
      break;
    case "band_pass":
      text = bandPassText(get("R1"), get("C1"), get("C2"));
      break;
    case "opamp_inverting":
      text = opampInvertingText(get("R1"), get("Rf"));
      break;
    case "opamp_noninverting":
      text = opampNoninvertingText(get("R1"), get("Rf"));
      break;
    case "zener_regulator":
      text = zenerText(circuit.derivedParams?.Vin || 12, get("R1"), circuit.derivedParams?.Vz || 5);
      break;
    case "rc_oscillator":
      text = wienBridgeText(get("R1"), get("C1"));
      break;
  }

  return text ? makeEmbed(text) : null;
}
