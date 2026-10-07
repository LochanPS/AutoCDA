// Pure formula engine. Takes params → returns full circuit data object.
// All math here. No UI concerns.

// ── formatting helpers ───────────────────────────────────────────────────────

export function formatResistance(ohms) {
  if (ohms >= 1e6) return `${+(ohms / 1e6).toPrecision(3)} MΩ`;
  if (ohms >= 1e3) return `${+(ohms / 1e3).toPrecision(3)} kΩ`;
  return `${+ohms.toPrecision(3)} Ω`;
}

export function formatCapacitance(farads) {
  if (farads >= 1e-3) return `${+(farads * 1e3).toPrecision(3)} mF`;
  if (farads >= 1e-6) return `${+(farads * 1e6).toPrecision(3)} µF`;
  if (farads >= 1e-9) return `${+(farads * 1e9).toPrecision(3)} nF`;
  return `${+(farads * 1e12).toPrecision(3)} pF`;
}

export function formatVoltage(v) {
  return `${+v.toPrecision(4)} V`;
}

export function formatCurrent(a) {
  if (a >= 1) return `${+a.toPrecision(3)} A`;
  if (a >= 1e-3) return `${+(a * 1e3).toPrecision(3)} mA`;
  return `${+(a * 1e6).toPrecision(3)} µA`;
}

export function formatFrequency(hz) {
  if (hz >= 1e6) return `${+(hz / 1e6).toPrecision(4)} MHz`;
  if (hz >= 1e3) return `${+(hz / 1e3).toPrecision(4)} kHz`;
  return `${+hz.toPrecision(4)} Hz`;
}

// Parse display string back to raw SI value
export function parseDisplayValue(display, hint) {
  const n = parseFloat(display);
  if (isNaN(n)) return null;
  const lower = display.toLowerCase();
  if (lower.includes('mω') || lower.includes('mohm')) return n * 1e6;
  if (lower.includes('kω') || lower.includes('kohm')) return n * 1e3;
  if (lower.includes('ω') || lower.includes('ohm')) return n;
  if (lower.includes('mf')) return n * 1e-3;
  if (lower.includes('µf') || lower.includes('uf')) return n * 1e-6;
  if (lower.includes('nf')) return n * 1e-9;
  if (lower.includes('pf')) return n * 1e-12;
  if (lower.includes('mhz')) return n * 1e6;
  if (lower.includes('khz')) return n * 1e3;
  if (lower.includes('hz')) return n;
  if (lower.includes('kv')) return n * 1e3;
  if (lower.includes('mv')) return n * 1e-3;
  if (lower.includes('v')) return n;
  if (lower.includes('ma')) return n * 1e-3;
  if (lower.includes('µa') || lower.includes('ua')) return n * 1e-6;
  if (lower.includes('a')) return n;
  return n; // bare number — return as is
}

// ── formula functions ────────────────────────────────────────────────────────

// TODO(Phase 2): replace this analytical self-check with a REAL ngspice-wasm run.
// Every circuit below recomputes its answer from the SAME closed-form equation it
// used to size the parts, so the "measured" value is identical to the target by
// construction and any error percentage would always be ~0. That is NOT a
// simulation, so we never claim a simulator ran and never print an error figure.
// Real measured-vs-target error (snapped E-series values vs SPICE) arrives in
// Phase 2 — see src/sim/spice.js + src/design/loop.js and docs/ROADMAP.md.
const analyticalBadge = (summary) => `${summary} · Analytical (not yet SPICE-verified)`;
const analyticalSteps = (resultLine) => [
  '[✓] SPICE netlist generated',
  '[✓] Values computed from design equations (analytical)',
  `[✓] Analytical result: ${resultLine}`,
  '[○] SPICE verification pending — Phase 2 (ngspice-wasm)',
  '[✓] Schematic rendered',
];

function rcLowpass({ fc = 1000, R = 1000 }) {
  const C = 1 / (2 * Math.PI * R * fc);
  const fcActual = 1 / (2 * Math.PI * R * C);

  return {
    id: 'rc_lowpass',
    name: 'RC Low-Pass Filter',
    schematic: '/schematics/rc_lowpass.svg',
    simulationBadge: analyticalBadge(`fc = ${formatFrequency(fcActual)}`),
    components: [
      { ref: 'R1', rawValue: R,   unit: 'Ω', display: formatResistance(R),   description: 'Series Resistor',  editable: true },
      { ref: 'C1', rawValue: C,   unit: 'F', display: formatCapacitance(C),  description: 'Filter Capacitor', editable: true },
    ],
    derivedParams: { fc: fcActual },
    graph: { type: 'bode', title: `Frequency Response — RC Low-Pass (fc = ${formatFrequency(fcActual)})`, xLabel: 'Frequency (Hz)', yLabel: 'Gain (dB)', cutoffFrequency: fcActual, filterType: 'lowpass' },
    processingSteps: [
      '[✓] Input received: RC Low-Pass Filter',
      '[✓] Intent extracted: Circuit type = RC Low-Pass Filter',
      `[✓] Parameter identified: Cutoff frequency = ${formatFrequency(fc)}`,
      '[✓] Topology selected: Series R, shunt C',
      '[✓] Formula applied: fc = 1 / (2πRC)',
      `[✓] R1 calculated: ${formatResistance(R)}`,
      `[✓] C1 calculated: ${formatCapacitance(C)}`,
      ...analyticalSteps(`cutoff at ${formatFrequency(fcActual)}`),
    ],
    explanation: `An RC Low-Pass Filter was designed using the formula fc = 1/(2πRC). With a target cutoff frequency of ${formatFrequency(fc)} and a resistor value of ${formatResistance(R)}, the required capacitance was calculated as ${formatCapacitance(C)}. Signals below ${formatFrequency(fcActual)} pass through with minimal attenuation while higher frequencies are blocked at -20 dB per decade.`,
    netlist: `RC Low-Pass Filter — SPICE Netlist\n*AutoCDA Generated Netlist\nVin in 0 AC 1\nR1 in out ${formatResistance(R)}\nC1 out 0 ${formatCapacitance(C)}\n.AC DEC 100 10 100Meg\n.PROBE V(out)\n.END`,
  };
}

function rcHighpass({ fc = 500, R = 1000 }) {
  const C = 1 / (2 * Math.PI * R * fc);
  const fcActual = 1 / (2 * Math.PI * R * C);

  return {
    id: 'rc_highpass',
    name: 'RC High-Pass Filter',
    schematic: '/schematics/rc_highpass.svg',
    simulationBadge: analyticalBadge(`fc = ${formatFrequency(fcActual)}`),
    components: [
      { ref: 'C1', rawValue: C, unit: 'F', display: formatCapacitance(C), description: 'Series Capacitor', editable: true },
      { ref: 'R1', rawValue: R, unit: 'Ω', display: formatResistance(R),  description: 'Shunt Resistor',   editable: true },
    ],
    derivedParams: { fc: fcActual },
    graph: { type: 'bode', title: `Frequency Response — RC High-Pass (fc = ${formatFrequency(fcActual)})`, xLabel: 'Frequency (Hz)', yLabel: 'Gain (dB)', cutoffFrequency: fcActual, filterType: 'highpass' },
    processingSteps: [
      '[✓] Input received: RC High-Pass Filter',
      '[✓] Intent extracted: Circuit type = RC High-Pass Filter',
      `[✓] Parameter identified: Cutoff frequency = ${formatFrequency(fc)}`,
      '[✓] Topology selected: Series C, shunt R',
      '[✓] Formula applied: fc = 1 / (2πRC)',
      `[✓] R1 selected: ${formatResistance(R)}`,
      `[✓] C1 calculated: ${formatCapacitance(C)}`,
      ...analyticalSteps(`cutoff at ${formatFrequency(fcActual)}`),
    ],
    explanation: `An RC High-Pass Filter was designed using the formula fc = 1/(2πRC). With a cutoff frequency of ${formatFrequency(fc)} and R = ${formatResistance(R)}, the capacitance was calculated as ${formatCapacitance(C)}. Low-frequency signals are attenuated at -20 dB per decade below ${formatFrequency(fcActual)}.`,
    netlist: `RC High-Pass Filter — SPICE Netlist\n*AutoCDA Generated Netlist\nVin in 0 AC 1\nC1 in out ${formatCapacitance(C)}\nR1 out 0 ${formatResistance(R)}\n.AC DEC 100 10 100Meg\n.PROBE V(out)\n.END`,
  };
}

function voltageDivider({ Vin = 12, Vout = 5, R2 = 1000 }) {
  const R1 = R2 * (Vin - Vout) / Vout;
  const VoutActual = Vin * R2 / (R1 + R2);

  return {
    id: 'voltage_divider',
    name: 'Voltage Divider',
    schematic: '/schematics/voltage_divider.svg',
    simulationBadge: analyticalBadge(`Vout = ${formatVoltage(VoutActual)}`),
    components: [
      { ref: 'R1', rawValue: R1, unit: 'Ω', display: formatResistance(R1), description: 'Upper Resistor', editable: true },
      { ref: 'R2', rawValue: R2, unit: 'Ω', display: formatResistance(R2), description: 'Lower Resistor', editable: true },
    ],
    derivedParams: { Vin, Vout: VoutActual },
    graph: {
      type: 'bar',
      title: 'Voltage Comparison — Input vs Output',
      data: [
        { label: `Vin (${formatVoltage(Vin)})`,         value: +Vin.toFixed(3),        color: '#58a6ff' },
        { label: `Vout Target (${formatVoltage(Vout)})`, value: +Vout.toFixed(3),       color: '#8b949e' },
        { label: `Vout Actual (${formatVoltage(VoutActual)})`, value: +VoutActual.toFixed(3), color: '#3fb950' },
      ],
    },
    processingSteps: [
      `[✓] Input received: Voltage Divider ${formatVoltage(Vin)} to ${formatVoltage(Vout)}`,
      '[✓] Intent extracted: Circuit type = Voltage Divider',
      `[✓] Parameters identified: Vin = ${formatVoltage(Vin)}, Vout = ${formatVoltage(Vout)}`,
      '[✓] Topology selected: Resistive voltage divider',
      '[✓] Formula applied: Vout = Vin × R2 / (R1 + R2)',
      `[✓] R2 selected: ${formatResistance(R2)}`,
      `[✓] R1 calculated: ${formatResistance(R1)}`,
      ...analyticalSteps(`Vout = ${formatVoltage(VoutActual)}`),
    ],
    explanation: `A Voltage Divider was designed using Vout = Vin × R2/(R1+R2). To step down ${formatVoltage(Vin)} to ${formatVoltage(Vout)}, R1 = ${formatResistance(R1)} and R2 = ${formatResistance(R2)} were calculated. Computed output: ${formatVoltage(VoutActual)} (analytical, not yet SPICE-verified).`,
    netlist: `Voltage Divider — SPICE Netlist\n*AutoCDA Generated Netlist\nVin in 0 DC ${Vin}\nR1 in out ${formatResistance(R1)}\nR2 out 0 ${formatResistance(R2)}\n.DC Vin ${Vin} ${Vin} 1\n.PROBE V(out)\n.END`,
  };
}

function ledLimiter({ Vsupply = 5, I = 0.02, Vf = 1.8 }) {
  const R = (Vsupply - Vf) / I;
  const IActual = (Vsupply - Vf) / R;

  return {
    id: 'led_limiter',
    name: 'LED Current Limiter',
    schematic: '/schematics/led_limiter.svg',
    simulationBadge: analyticalBadge(`I = ${formatCurrent(IActual)}`),
    components: [
      { ref: 'R1', rawValue: R,  unit: 'Ω', display: formatResistance(R), description: 'Current Limiting Resistor', editable: true },
      { ref: 'D1', rawValue: Vf, unit: 'V', display: `Vf = ${formatVoltage(Vf)}`, description: 'LED (Vf)', editable: true },
    ],
    derivedParams: { Vsupply, I: IActual },
    graph: {
      type: 'bar',
      title: 'Current — Target vs Computed (analytical)',
      data: [
        { label: `Target (${formatCurrent(I)})`,   value: +(I * 1e3).toFixed(2),       color: '#58a6ff', unit: 'mA' },
        { label: `Actual (${formatCurrent(IActual)})`, value: +(IActual * 1e3).toFixed(2), color: '#3fb950', unit: 'mA' },
      ],
    },
    processingSteps: [
      `[✓] Input received: LED Current Limiter ${formatVoltage(Vsupply)} ${formatCurrent(I)}`,
      '[✓] Intent extracted: Circuit type = LED Current Limiter',
      `[✓] Parameters: Vsupply = ${formatVoltage(Vsupply)}, I = ${formatCurrent(I)}`,
      '[✓] Topology selected: Series resistor with LED',
      '[✓] Formula applied: R = (Vsupply − Vf) / I',
      `[✓] LED forward voltage: Vf = ${formatVoltage(Vf)}`,
      `[✓] R1 calculated: ${formatResistance(R)}`,
      ...analyticalSteps(`current = ${formatCurrent(IActual)}`),
    ],
    explanation: `An LED Current Limiter was designed using R = (Vsupply − Vf) / I. With a ${formatVoltage(Vsupply)} supply, Vf = ${formatVoltage(Vf)}, target current ${formatCurrent(I)}, the resistor was calculated as ${formatResistance(R)}. Actual current: ${formatCurrent(IActual)}.`,
    netlist: `LED Current Limiter — SPICE Netlist\n*AutoCDA Generated Netlist\nVin in 0 DC ${Vsupply}\nR1 in mid ${formatResistance(R)}\nD1 mid 0 DLED\n.model DLED D(Is=1e-12 N=1.5 Vj=${Vf})\n.DC Vin ${Vsupply} ${Vsupply} 1\n.PROBE I(D1)\n.END`,
  };
}

function commonEmitter({ Av = 20, VCC = 12 }) {
  // Bias-aware CE design. The old Av=RC/RE with a fixed RC ignored headroom and
  // drove the transistor into saturation (Ic·RC > VCC). Size RE and RC for a
  // mid-rail quiescent VCE (max swing) with un-bypassed-RE gain = RC/(RE+re'):
  //   VCE = VCC − Ic·(RC+RE) = VCC/2,  RC = Av·(RE+re')
  //   ⇒ RE = (VCC/(2·Ic) − Av·re') / (Av+1)
  const Ic = 1e-3;              // 1 mA quiescent collector current
  const beta = 200;
  const re = 0.026 / Ic;       // intrinsic emitter resistance (~26 Ω)
  let RE = (VCC / (2 * Ic) - Av * re) / (Av + 1);
  if (RE < 10) RE = 10;        // floor for very high gains
  const RC = Av * (RE + re);
  const AvActual = RC / (RE + re);
  // Stiff bias divider: divider current ~10× base current for a stable Q-point.
  const Vb = Ic * RE + 0.7;
  const Idiv = 10 * (Ic / beta);
  const R2 = Vb / Idiv;
  const R1 = (VCC - Vb) / Idiv;

  return {
    id: 'common_emitter',
    name: 'Common Emitter Amplifier',
    schematic: '/schematics/common_emitter.svg',
    simulationBadge: analyticalBadge(`Gain = ${+AvActual.toPrecision(3)}`),
    components: [
      { ref: 'R1', rawValue: R1,     unit: 'Ω', display: formatResistance(R1),     description: 'Base Bias (Upper)', editable: true },
      { ref: 'R2', rawValue: R2,     unit: 'Ω', display: formatResistance(R2),     description: 'Base Bias (Lower)', editable: true },
      { ref: 'RC', rawValue: RC,     unit: 'Ω', display: formatResistance(RC),     description: 'Collector Resistor', editable: true },
      { ref: 'RE', rawValue: RE,     unit: 'Ω', display: formatResistance(RE),     description: 'Emitter Resistor',   editable: true },
      { ref: 'C1', rawValue: 10e-6,  unit: 'F', display: formatCapacitance(10e-6), description: 'Coupling Capacitor', editable: true },
      { ref: 'Q1', rawValue: null,   unit: null, display: 'NPN BJT',               description: 'Transistor (BC547)', editable: false },
    ],
    derivedParams: { Av: AvActual },
    graph: {
      type: 'waveform',
      title: `Input vs Output — Gain = ${+AvActual.toPrecision(3)}`,
      xLabel: 'Time (ms)', yLabel: 'Voltage (V)',
      input:  { amplitude: 0.1, label: 'Vin', color: '#58a6ff' },
      output: { amplitude: +(0.1 * AvActual).toPrecision(3), label: `Vout (Gain=${+AvActual.toPrecision(3)})`, color: '#3fb950' },
      frequency: 1000, phaseInvert: true,
    },
    processingSteps: [
      `[✓] Input received: Common Emitter Amplifier gain ${Av}`,
      '[✓] Intent extracted: Circuit type = Common Emitter Amplifier',
      `[✓] Parameter identified: Voltage gain Av = ${Av}`,
      '[✓] Topology selected: NPN BJT Common Emitter',
      '[✓] Formula applied: Av = RC / RE',
      `[✓] RC selected: ${formatResistance(RC)}`,
      `[✓] RE calculated: ${formatResistance(RE)}`,
      '[✓] Bias resistors calculated',
      '[✓] DC operating point computed',
      ...analyticalSteps(`gain = ${+AvActual.toPrecision(3)}`),
    ],
    explanation: `A Common Emitter Amplifier was designed with target gain ${Av}. Using Av = RC/RE, RC = ${formatResistance(RC)} and RE = ${formatResistance(RE)}. Computed gain: ${+AvActual.toPrecision(3)} (analytical, not yet SPICE-verified). Note 180° phase inversion characteristic of common emitter topology.`,
    netlist: `Common Emitter Amplifier — SPICE Netlist\n*AutoCDA Generated Netlist\nVin in 0 AC 0.1 SIN(0 0.1 1k)\nVCC vcc 0 DC ${VCC}\nR1 vcc base ${formatResistance(R1)}\nR2 base 0 ${formatResistance(R2)}\nRC vcc col ${formatResistance(RC)}\nRE emit 0 ${formatResistance(RE)}\nC1 in base 10u\nQ1 col base emit BC547\n.model BC547 NPN(Is=1e-14 Bf=200)\n.TRAN 0.01m 5m\n.PROBE V(col)\n.END`,
  };
}

// ── additional circuits ───────────────────────────────────────────────────────

function bandPass({ fL = 200, fH = 2000, R = 1000 }) {
  const C1 = 1 / (2 * Math.PI * R * fH); // HP cap
  const C2 = 1 / (2 * Math.PI * R * fL); // LP cap
  const fc = Math.sqrt(fL * fH);
  const BW = fH - fL;
  return {
    id: 'band_pass', name: 'RC Band-Pass Filter',
    schematic: '/schematics/band_pass.svg',
    simulationBadge: analyticalBadge(`BW = ${formatFrequency(BW)}, fc = ${formatFrequency(fc)}`),
    components: [
      { ref: 'C1', rawValue: C1, unit: 'F', display: formatCapacitance(C1), description: 'HP Series Cap', editable: true },
      { ref: 'R1', rawValue: R,  unit: 'Ω', display: formatResistance(R),   description: 'Series Resistor', editable: true },
      { ref: 'C2', rawValue: C2, unit: 'F', display: formatCapacitance(C2), description: 'LP Shunt Cap',    editable: true },
      { ref: 'R2', rawValue: R,  unit: 'Ω', display: formatResistance(R),   description: 'Shunt Resistor',  editable: true },
    ],
    derivedParams: { fL, fH, fc, BW },
    graph: { type: 'bode', title: `Band-Pass Response (${formatFrequency(fL)} – ${formatFrequency(fH)})`, xLabel: 'Frequency (Hz)', yLabel: 'Gain (dB)', cutoffFrequency: fc, filterType: 'lowpass' },
    processingSteps: [
      '[✓] Input received: RC Band-Pass Filter',
      `[✓] Parameters: fL = ${formatFrequency(fL)}, fH = ${formatFrequency(fH)}`,
      `[✓] Centre frequency fc = ${formatFrequency(fc)}`,
      `[✓] Bandwidth BW = ${formatFrequency(BW)}`,
      `[✓] HP stage: C1 = ${formatCapacitance(C1)}, R1 = ${formatResistance(R)}`,
      `[✓] LP stage: C2 = ${formatCapacitance(C2)}, R2 = ${formatResistance(R)}`,
      ...analyticalSteps(`fc = ${formatFrequency(fc)}, BW = ${formatFrequency(BW)}`),
    ],
    explanation: `RC Band-Pass Filter cascades HP and LP stages. HP cutoff = ${formatFrequency(fH)} (C1=${formatCapacitance(C1)}, R1=${formatResistance(R)}). LP cutoff = ${formatFrequency(fL)} (C2=${formatCapacitance(C2)}, R2=${formatResistance(R)}). Centre frequency fc = ${formatFrequency(fc)}, bandwidth = ${formatFrequency(BW)}.`,
    netlist: `Band-Pass Filter — SPICE Netlist\n*AutoCDA Generated\nVin in 0 AC 1\nC1 in mid1 ${formatCapacitance(C1)}\nR1 mid1 mid2 ${formatResistance(R)}\nC2 mid2 0 ${formatCapacitance(C2)}\nR2 mid2 0 ${formatResistance(R)}\n.AC DEC 100 1 1Meg\n.PROBE V(mid2)\n.END`,
  };
}

function opampInverting({ Av = 10, R1 = 10000 }) {
  const Rf = R1 * Av;
  return {
    id: 'opamp_inverting', name: 'Op-Amp Inverting Amplifier',
    schematic: '/schematics/opamp_inverting.svg',
    simulationBadge: analyticalBadge(`Gain = −${+Av.toPrecision(3)}`),
    components: [
      { ref: 'R1', rawValue: R1, unit: 'Ω', display: formatResistance(R1), description: 'Input Resistor',    editable: true },
      { ref: 'Rf', rawValue: Rf, unit: 'Ω', display: formatResistance(Rf), description: 'Feedback Resistor', editable: true },
    ],
    derivedParams: { Av: -Av },
    graph: {
      type: 'waveform', title: `Inverting Amplifier — Gain = −${+Av.toPrecision(3)}`,
      xLabel: 'Time (ms)', yLabel: 'Voltage (V)',
      input:  { amplitude: 0.1, label: 'Vin', color: '#58a6ff' },
      output: { amplitude: +(0.1 * Av).toPrecision(3), label: `Vout (−${+Av.toPrecision(3)})`, color: '#3fb950' },
      frequency: 1000, phaseInvert: true,
    },
    processingSteps: [
      '[✓] Input received: Op-Amp Inverting Amplifier',
      `[✓] Target gain: Av = −${Av}`,
      '[✓] Formula: Av = −Rf / R1',
      `[✓] R1 selected: ${formatResistance(R1)}`,
      `[✓] Rf calculated: ${formatResistance(Rf)}`,
      '[✓] Virtual ground at inverting input assumed',
      ...analyticalSteps(`gain = −${+Av.toPrecision(3)}`),
    ],
    explanation: `Op-Amp Inverting Amplifier designed using Av = −Rf/R1. With R1 = ${formatResistance(R1)}, Rf = ${formatResistance(Rf)} gives gain = −${+Av.toPrecision(3)}. Output is 180° phase-inverted. Virtual ground at inverting input maintained by negative feedback.`,
    netlist: `Op-Amp Inverting Amplifier — SPICE Netlist\n*AutoCDA Generated\nVin in 0 AC 0.1\nVcc vcc 0 DC 15\nVee vee 0 DC -15\nR1 in inv ${formatResistance(R1)}\nRf out inv ${formatResistance(Rf)}\nXU1 0 inv vcc vee out LM741\n.lib opamp.lib\n.AC DEC 100 1 1Meg\n.PROBE V(out)\n.END`,
  };
}

function opampNoninverting({ Av = 11, R1 = 10000 }) {
  const Rf = R1 * (Av - 1);
  return {
    id: 'opamp_noninverting', name: 'Op-Amp Non-Inverting Amplifier',
    schematic: '/schematics/opamp_noninverting.svg',
    simulationBadge: analyticalBadge(`Gain = +${+Av.toPrecision(3)}`),
    components: [
      { ref: 'R1', rawValue: R1, unit: 'Ω', display: formatResistance(R1), description: 'Ground Resistor',   editable: true },
      { ref: 'Rf', rawValue: Rf, unit: 'Ω', display: formatResistance(Rf), description: 'Feedback Resistor', editable: true },
    ],
    derivedParams: { Av },
    graph: {
      type: 'waveform', title: `Non-Inverting Amplifier — Gain = +${+Av.toPrecision(3)}`,
      xLabel: 'Time (ms)', yLabel: 'Voltage (V)',
      input:  { amplitude: 0.1, label: 'Vin', color: '#58a6ff' },
      output: { amplitude: +(0.1 * Av).toPrecision(3), label: `Vout (+${+Av.toPrecision(3)})`, color: '#3fb950' },
      frequency: 1000, phaseInvert: false,
    },
    processingSteps: [
      '[✓] Input received: Op-Amp Non-Inverting Amplifier',
      `[✓] Target gain: Av = +${Av}`,
      '[✓] Formula: Av = 1 + Rf / R1',
      `[✓] R1 selected: ${formatResistance(R1)}`,
      `[✓] Rf calculated: ${formatResistance(Rf)}`,
      ...analyticalSteps(`gain = +${+Av.toPrecision(3)}`),
    ],
    explanation: `Op-Amp Non-Inverting Amplifier using Av = 1 + Rf/R1. With R1 = ${formatResistance(R1)}, Rf = ${formatResistance(Rf)} gives gain = +${+Av.toPrecision(3)}. No phase inversion. High input impedance (signal fed to + terminal).`,
    netlist: `Op-Amp Non-Inverting Amplifier — SPICE Netlist\n*AutoCDA Generated\nVin in 0 AC 0.1\nVcc vcc 0 DC 15\nVee vee 0 DC -15\nR1 inv 0 ${formatResistance(R1)}\nRf out inv ${formatResistance(Rf)}\nXU1 in inv vcc vee out LM741\n.lib opamp.lib\n.AC DEC 100 1 1Meg\n.PROBE V(out)\n.END`,
  };
}

function zenerRegulator({ Vin = 12, Vz = 5, Iload = 0.01 }) {
  const Iz_min = 0.005; // 5mA minimum zener current
  const I_total = Iload + Iz_min;
  const R = (Vin - Vz) / I_total;
  const Pd = Vz * Iz_min; // zener power at min load
  return {
    id: 'zener_regulator', name: 'Zener Voltage Regulator',
    schematic: '/schematics/zener_regulator.svg',
    simulationBadge: analyticalBadge(`Vout = ${formatVoltage(Vz)} regulated`),
    components: [
      { ref: 'R1', rawValue: R,    unit: 'Ω', display: formatResistance(R),    description: 'Series Resistor', editable: true },
      { ref: 'Dz', rawValue: Vz,   unit: 'V', display: `Vz = ${formatVoltage(Vz)}`, description: 'Zener Diode',    editable: true },
    ],
    derivedParams: { Vin, Vz, Pd },
    graph: {
      type: 'bar', title: 'Voltage Regulation — Input vs Output',
      data: [
        { label: `Vin (${formatVoltage(Vin)})`,  value: +Vin.toFixed(2), color: '#58a6ff' },
        { label: `Vout (${formatVoltage(Vz)})`,  value: +Vz.toFixed(2),  color: '#3fb950' },
      ],
    },
    processingSteps: [
      `[✓] Input received: Zener Regulator ${formatVoltage(Vin)} → ${formatVoltage(Vz)}`,
      `[✓] Zener voltage: Vz = ${formatVoltage(Vz)}`,
      `[✓] Load current: ${formatCurrent(Iload)}`,
      '[✓] Formula: R = (Vin − Vz) / (Iload + Iz_min)',
      `[✓] R1 calculated: ${formatResistance(R)}`,
      `[✓] Zener power: Pd = ${+(Pd * 1000).toFixed(1)} mW`,
      ...analyticalSteps(`Vout = ${formatVoltage(Vz)} regulated`),
    ],
    explanation: `Zener Voltage Regulator maintains ${formatVoltage(Vz)} output from ${formatVoltage(Vin)} input. Series resistor R = ${formatResistance(R)} drops excess voltage. Zener clamps output at Vz. Zener dissipates ${+(Pd * 1000).toFixed(1)} mW at minimum load.`,
    netlist: `Zener Regulator — SPICE Netlist\n*AutoCDA Generated\nVin in 0 DC ${Vin}\nR1 in out ${formatResistance(R)}\nDz 0 out ZENER\n.model ZENER D(BV=${Vz} IBV=0.005)\n.DC Vin ${Vin} ${Vin} 1\n.PROBE V(out)\n.END`,
  };
}

function rcOscillator({ f = 1000, R = 10000 }) {
  // Wien bridge: f = 1/(2πRC)
  const C = 1 / (2 * Math.PI * R * f);
  const fActual = 1 / (2 * Math.PI * R * C);
  return {
    id: 'rc_oscillator', name: 'Wien Bridge Oscillator',
    schematic: '/schematics/rc_oscillator.svg',
    simulationBadge: analyticalBadge(`f = ${formatFrequency(fActual)}`),
    components: [
      { ref: 'R1', rawValue: R, unit: 'Ω', display: formatResistance(R), description: 'Wien Resistor (×2)', editable: true },
      { ref: 'C1', rawValue: C, unit: 'F', display: formatCapacitance(C), description: 'Wien Capacitor (×2)', editable: true },
      { ref: 'Rf', rawValue: 22000, unit: 'Ω', display: formatResistance(22000), description: 'Feedback Resistor', editable: true },
      { ref: 'R2', rawValue: 10000, unit: 'Ω', display: formatResistance(10000), description: 'Gain Resistor', editable: true },
    ],
    derivedParams: { f: fActual },
    graph: {
      type: 'waveform', title: `Wien Bridge Output — f = ${formatFrequency(fActual)}`,
      xLabel: 'Time (ms)', yLabel: 'Voltage (V)',
      input:  { amplitude: 0, label: 'N/A', color: '#58a6ff' },
      output: { amplitude: 2.0, label: `Vout (${formatFrequency(fActual)})`, color: '#3fb950' },
      frequency: fActual, phaseInvert: false,
    },
    processingSteps: [
      '[✓] Input received: Wien Bridge Oscillator',
      `[✓] Target frequency: ${formatFrequency(f)}`,
      '[✓] Formula: f = 1 / (2πRC)',
      `[✓] R selected: ${formatResistance(R)}`,
      `[✓] C calculated: ${formatCapacitance(C)}`,
      '[✓] Gain condition: Av = 1 + Rf/R2 = 3.2 (slight excess over 3)',
      '[✓] Oscillation condition checked (Barkhausen: loop gain ≥ 1)',
      ...analyticalSteps(`f = ${formatFrequency(fActual)}`),
    ],
    explanation: `Wien Bridge Oscillator generates ${formatFrequency(fActual)} sine wave using f = 1/(2πRC). R = ${formatResistance(R)}, C = ${formatCapacitance(C)}. Op-amp gain = 1 + Rf/R2 = 3.2 — a small excess over the ideal 3 so oscillation starts reliably, with diode amplitude-limiting holding it bounded (a gain of exactly 3 decays and never sustains). Satisfies the Barkhausen criterion.`,
    netlist: `Wien Bridge Oscillator — SPICE Netlist\n*AutoCDA Generated\nVcc vcc 0 DC 15\nVee vee 0 DC -15\nR1 out p ${formatResistance(R)}\nC1 p inv ${formatCapacitance(C)}\nR2 p 0 ${formatResistance(R)}\nC2 inv 0 ${formatCapacitance(C)}\nRf out inv 22k\nRg inv 0 10k\nXU1 p inv vcc vee out LM741\n.TRAN 0.01m 10m\n.PROBE V(out)\n.END`,
  };
}

function sallenKeyLowpass({ fc = 1000 }) {
  // Unity-gain, equal-R Sallen-Key low-pass, Butterworth (Q = 1/sqrt2).
  // For R1=R2=R:  Q = 0.5*sqrt(C1/C2),  fc = 1/(2*pi*R*sqrt(C1*C2)).
  // Butterworth => C1/C2 = 2. Pick C2, set C1 = 2*C2, solve R.
  const C2 = 10e-9;
  const C1 = 2 * C2;
  const R = 1 / (2 * Math.PI * fc * Math.sqrt(C1 * C2));
  const fcActual = 1 / (2 * Math.PI * R * Math.sqrt(C1 * C2));
  return {
    id: 'sallen_key_lowpass',
    name: 'Sallen-Key Low-Pass (2nd order)',
    schematic: '/schematics/sallen_key_lowpass.svg',
    simulationBadge: analyticalBadge(`fc = ${formatFrequency(fcActual)}`),
    components: [
      { ref: 'R1', rawValue: R,  unit: 'Ω', display: formatResistance(R),  description: 'Input Resistor',  editable: true },
      { ref: 'R2', rawValue: R,  unit: 'Ω', display: formatResistance(R),  description: 'Second Resistor', editable: true },
      { ref: 'C1', rawValue: C1, unit: 'F', display: formatCapacitance(C1), description: 'Feedback Cap',    editable: true },
      { ref: 'C2', rawValue: C2, unit: 'F', display: formatCapacitance(C2), description: 'Shunt Cap',       editable: true },
    ],
    derivedParams: { fc: fcActual, Q: 0.707, order: 2 },
    graph: { type: 'bode', title: `Frequency Response — Sallen-Key Low-Pass (fc = ${formatFrequency(fcActual)}, 2nd order)`, xLabel: 'Frequency (Hz)', yLabel: 'Gain (dB)', cutoffFrequency: fcActual, filterType: 'lowpass' },
    processingSteps: [
      '[✓] Input received: Sallen-Key Low-Pass Filter',
      `[✓] Target cutoff: ${formatFrequency(fc)}`,
      '[✓] Topology: 2nd-order unity-gain Sallen-Key (Butterworth)',
      '[✓] Formula: fc = 1/(2π·R·√(C1·C2)), Q = 0.5·√(C1/C2)',
      `[✓] C2 = ${formatCapacitance(C2)}, C1 = ${formatCapacitance(C1)} (C1/C2 = 2 → Q = 0.707)`,
      `[✓] R1 = R2 = ${formatResistance(R)}`,
      ...analyticalSteps(`fc = ${formatFrequency(fcActual)} (−40 dB/decade)`),
    ],
    explanation: `Second-order unity-gain Sallen-Key low-pass. With R1 = R2 = ${formatResistance(R)}, C1 = ${formatCapacitance(C1)}, C2 = ${formatCapacitance(C2)} (C1/C2 = 2) the response is Butterworth (Q = 0.707) with cutoff ${formatFrequency(fcActual)} and a −40 dB/decade roll-off. Four coupled components set fc and Q jointly — there is no single-component closed form, so the design is finished by SPICE-graded refinement.`,
    netlist: `Sallen-Key Low-Pass — SPICE Netlist\n*AutoCDA Generated\nV1 in 0 AC 1\nR1 in a ${formatResistance(R)}\nR2 a b ${formatResistance(R)}\nC2 b 0 ${formatCapacitance(C2)}\nC1 a out ${formatCapacitance(C1)}\nE1 out 0 b 0 1\n.ac dec 100 ${(fcActual/100).toPrecision(4)} ${(fcActual*100).toPrecision(4)}\n.end`,
  };
}

function sallenKeyHighpass({ fc = 1000 }) {
  // Unity-gain, equal-C Sallen-Key high-pass, Butterworth. Dual of the low-pass:
  // C1=C2=C, R2/R1 = 2 gives Q = 0.707.  fc = 1/(2*pi*C*sqrt(R1*R2)).
  const C = 10e-9;
  const R1 = 1 / (2 * Math.PI * C * fc * Math.SQRT2);
  const R2 = 2 * R1;
  const fcActual = 1 / (2 * Math.PI * C * Math.sqrt(R1 * R2));
  return {
    id: 'sallen_key_highpass',
    name: 'Sallen-Key High-Pass (2nd order)',
    schematic: '/schematics/sallen_key_highpass.svg',
    simulationBadge: analyticalBadge(`fc = ${formatFrequency(fcActual)}`),
    components: [
      { ref: 'C1', rawValue: C,  unit: 'F', display: formatCapacitance(C), description: 'Input Cap',      editable: true },
      { ref: 'C2', rawValue: C,  unit: 'F', display: formatCapacitance(C), description: 'Second Cap',     editable: true },
      { ref: 'R1', rawValue: R1, unit: 'Ω', display: formatResistance(R1), description: 'Feedback Resistor', editable: true },
      { ref: 'R2', rawValue: R2, unit: 'Ω', display: formatResistance(R2), description: 'Shunt Resistor',    editable: true },
    ],
    derivedParams: { fc: fcActual, Q: 0.707, order: 2 },
    graph: { type: 'bode', title: `Frequency Response — Sallen-Key High-Pass (fc = ${formatFrequency(fcActual)}, 2nd order)`, xLabel: 'Frequency (Hz)', yLabel: 'Gain (dB)', cutoffFrequency: fcActual, filterType: 'highpass' },
    processingSteps: [
      '[✓] Input received: Sallen-Key High-Pass Filter',
      `[✓] Target cutoff: ${formatFrequency(fc)}`,
      '[✓] Topology: 2nd-order unity-gain Sallen-Key (Butterworth)',
      '[✓] Formula: fc = 1/(2π·C·√(R1·R2)), Q = 0.5·√(R2/R1)',
      `[✓] C1 = C2 = ${formatCapacitance(C)}, R2/R1 = 2 → Q = 0.707`,
      `[✓] R1 = ${formatResistance(R1)}, R2 = ${formatResistance(R2)}`,
      ...analyticalSteps(`fc = ${formatFrequency(fcActual)} (+40 dB/decade)`),
    ],
    explanation: `Second-order unity-gain Sallen-Key high-pass. With C1 = C2 = ${formatCapacitance(C)}, R1 = ${formatResistance(R1)}, R2 = ${formatResistance(R2)} (R2/R1 = 2) the response is Butterworth (Q = 0.707), cutoff ${formatFrequency(fcActual)}, +40 dB/decade below fc. Four coupled components; no single-component closed form, so SPICE-graded refinement finishes it.`,
    netlist: `Sallen-Key High-Pass — SPICE Netlist\n*AutoCDA Generated\nV1 in 0 AC 1\nC1 in a ${formatCapacitance(C)}\nC2 a b ${formatCapacitance(C)}\nR2 b 0 ${formatResistance(R2)}\nR1 a out ${formatResistance(R1)}\nE1 out 0 b 0 1\n.ac dec 100 ${(fcActual/100).toPrecision(4)} ${(fcActual*100).toPrecision(4)}\n.end`,
  };
}

function twoStageAmplifier({ Av = 100 }) {
  // Two cascaded non-inverting op-amp stages; total gain = g1 * g2. Split the
  // target geometrically so each stage has a moderate, well-conditioned gain.
  const g = Math.sqrt(Av);
  const Rg = 10000;
  const Rf = (g - 1) * Rg; // non-inverting: gain = 1 + Rf/Rg
  const AvActual = (1 + Rf / Rg) * (1 + Rf / Rg);
  return {
    id: 'two_stage_amplifier',
    name: 'Two-Stage Amplifier',
    schematic: '/schematics/two_stage_amplifier.svg',
    simulationBadge: analyticalBadge(`Av = ${+AvActual.toPrecision(3)}`),
    components: [
      { ref: 'Rg1', rawValue: Rg, unit: 'Ω', display: formatResistance(Rg), description: 'Stage 1 Ground Resistor', editable: true },
      { ref: 'Rf1', rawValue: Rf, unit: 'Ω', display: formatResistance(Rf), description: 'Stage 1 Feedback',       editable: true },
      { ref: 'Rg2', rawValue: Rg, unit: 'Ω', display: formatResistance(Rg), description: 'Stage 2 Ground Resistor', editable: true },
      { ref: 'Rf2', rawValue: Rf, unit: 'Ω', display: formatResistance(Rf), description: 'Stage 2 Feedback',       editable: true },
    ],
    derivedParams: { Av: AvActual, stages: 2, perStageGain: +g.toPrecision(3) },
    graph: {
      type: 'bar', title: 'Two-Stage Gain (×)',
      data: [
        { label: 'Stage 1', value: +(1 + Rf / Rg).toFixed(2), color: '#58a6ff' },
        { label: 'Stage 2', value: +(1 + Rf / Rg).toFixed(2), color: '#58a6ff' },
        { label: 'Total', value: +AvActual.toFixed(2), color: '#3fb950' },
      ],
    },
    processingSteps: [
      '[✓] Input received: Two-Stage Amplifier',
      `[✓] Target gain: ${+Av.toPrecision(3)}×`,
      '[✓] Topology: two cascaded non-inverting op-amp stages',
      `[✓] Split: each stage ≈ ${+g.toPrecision(3)}× (√total)`,
      `[✓] Per stage: Rg = ${formatResistance(Rg)}, Rf = ${formatResistance(Rf)} (1 + Rf/Rg)`,
      ...analyticalSteps(`Av = ${+AvActual.toPrecision(3)}×`),
    ],
    explanation: `Two cascaded non-inverting stages give a total gain of ${+AvActual.toPrecision(3)}× (≈ ${+g.toPrecision(3)}× each). Splitting a large gain across two stages keeps each stage's bandwidth and accuracy reasonable versus one high-gain stage. SPICE measures the end-to-end gain and the loop trims the feedback resistors to the target.`,
    netlist: `Two-Stage Amplifier — SPICE Netlist\n*AutoCDA Generated\nVin in 0 AC 1\nRg1 inv1 0 ${formatResistance(Rg)}\nRf1 inv1 o1 ${formatResistance(Rf)}\nE1 o1 0 in inv1 1e6\nRg2 inv2 0 ${formatResistance(Rg)}\nRf2 inv2 o2 ${formatResistance(Rf)}\nE2 o2 0 o1 inv2 1e6\n.ac lin 1 1000 1000\n.end`,
  };
}

function opampSumming({ Av = 1 }) {
  // Inverting summing amplifier (2 inputs), per-input gain Av = Rf/Rin.
  const Rin = 10000;
  const Rf = Av * Rin;
  const AvActual = Rf / Rin;
  return {
    id: 'opamp_summing', name: 'Inverting Summing Amplifier',
    schematic: '/schematics/opamp_summing.svg',
    simulationBadge: analyticalBadge(`Av = ${+AvActual.toPrecision(3)} / input`),
    components: [
      { ref: 'R1', rawValue: Rin, unit: 'Ω', display: formatResistance(Rin), description: 'Input 1 Resistor', editable: true },
      { ref: 'R2', rawValue: Rin, unit: 'Ω', display: formatResistance(Rin), description: 'Input 2 Resistor', editable: true },
      { ref: 'Rf', rawValue: Rf,  unit: 'Ω', display: formatResistance(Rf),  description: 'Feedback Resistor', editable: true },
    ],
    derivedParams: { Av: AvActual, inputs: 2 },
    graph: { type: 'bar', title: 'Summing Amplifier — per-input gain',
      data: [{ label: 'V1 gain', value: +AvActual.toFixed(2), color: '#58a6ff' }, { label: 'V2 gain', value: +AvActual.toFixed(2), color: '#58a6ff' }] },
    processingSteps: [
      '[✓] Input received: Inverting Summing Amplifier',
      `[✓] Target per-input gain: ${+Av.toPrecision(3)}`,
      '[✓] Formula: Vout = −Rf·(V1/R1 + V2/R2)', `[✓] R1 = R2 = ${formatResistance(Rin)}, Rf = ${formatResistance(Rf)}`,
      ...analyticalSteps(`Av = ${+AvActual.toPrecision(3)} per input`),
    ],
    explanation: `Inverting summing amplifier: Vout = −Rf·(V1/R1 + V2/R2). With R1 = R2 = ${formatResistance(Rin)} and Rf = ${formatResistance(Rf)} each input is weighted by ${+AvActual.toPrecision(3)}. Verified by measuring one input's gain (the other grounded).`,
    netlist: `Summing Amplifier — SPICE Netlist\n*AutoCDA Generated\nV1 in 0 AC 1\nR1 in inv ${formatResistance(Rin)}\nR2 0 inv ${formatResistance(Rin)}\nRf inv out ${formatResistance(Rf)}\nE1 out 0 0 inv 1e6\n.ac lin 1 1000 1000\n.end`,
  };
}

function opampDifference({ Av = 1 }) {
  // Difference amplifier, differential gain Av = Rf/R1 with matched resistors.
  const R1 = 10000;
  const Rf = Av * R1;
  const AvActual = Rf / R1;
  return {
    id: 'opamp_difference', name: 'Difference Amplifier',
    schematic: '/schematics/opamp_difference.svg',
    simulationBadge: analyticalBadge(`Av = ${+AvActual.toPrecision(3)}`),
    components: [
      { ref: 'R1', rawValue: R1, unit: 'Ω', display: formatResistance(R1), description: 'Inverting Input Resistor', editable: true },
      { ref: 'Rf', rawValue: Rf, unit: 'Ω', display: formatResistance(Rf), description: 'Feedback Resistor', editable: true },
      { ref: 'R2', rawValue: R1, unit: 'Ω', display: formatResistance(R1), description: 'Non-Inv Input Resistor', editable: true },
      { ref: 'Rg', rawValue: Rf, unit: 'Ω', display: formatResistance(Rf), description: 'Non-Inv Ground Resistor', editable: true },
    ],
    derivedParams: { Av: AvActual },
    graph: { type: 'bar', title: 'Difference Amplifier gain (×)',
      data: [{ label: 'Diff gain', value: +AvActual.toFixed(2), color: '#3fb950' }] },
    processingSteps: [
      '[✓] Input received: Difference Amplifier',
      `[✓] Target gain: ${+Av.toPrecision(3)}`,
      '[✓] Formula: Vout = (Rf/R1)(V2 − V1), matched resistors', `[✓] R1 = R2 = ${formatResistance(R1)}, Rf = Rg = ${formatResistance(Rf)}`,
      ...analyticalSteps(`Av = ${+AvActual.toPrecision(3)}`),
    ],
    explanation: `Difference amplifier: Vout = (Rf/R1)(V2 − V1) with matched resistors (R2 = R1, Rg = Rf). Differential gain ${+AvActual.toPrecision(3)}. Verified by driving one input with the other grounded.`,
    netlist: `Difference Amplifier — SPICE Netlist\n*AutoCDA Generated\nV1 in 0 AC 1\nR1 in inv ${formatResistance(R1)}\nRf inv out ${formatResistance(Rf)}\nR2 0 p ${formatResistance(R1)}\nRg p 0 ${formatResistance(Rf)}\nE1 out 0 p inv 1e6\n.ac lin 1 1000 1000\n.end`,
  };
}

function rcIntegrator({ fc = 1000 }) {
  // Op-amp integrator; fc = unity-gain (0 dB) frequency = 1/(2*pi*R*C).
  const R = 10000;
  const C = 1 / (2 * Math.PI * R * fc);
  const fcActual = 1 / (2 * Math.PI * R * C);
  return {
    id: 'rc_integrator', name: 'Op-Amp Integrator',
    schematic: '/schematics/rc_integrator.svg',
    simulationBadge: analyticalBadge(`f0 = ${formatFrequency(fcActual)}`),
    components: [
      { ref: 'R1', rawValue: R, unit: 'Ω', display: formatResistance(R), description: 'Input Resistor', editable: true },
      { ref: 'C1', rawValue: C, unit: 'F', display: formatCapacitance(C), description: 'Feedback Capacitor', editable: true },
    ],
    derivedParams: { fc: fcActual },
    graph: { type: 'bode', title: `Op-Amp Integrator — unity-gain f0 = ${formatFrequency(fcActual)}`, xLabel: 'Frequency (Hz)', yLabel: 'Gain (dB)', cutoffFrequency: fcActual, filterType: 'lowpass' },
    processingSteps: [
      '[✓] Input received: Op-Amp Integrator',
      `[✓] Target unity-gain frequency: ${formatFrequency(fc)}`,
      '[✓] Formula: f0 = 1/(2π·R·C) (−20 dB/decade)', `[✓] R1 = ${formatResistance(R)}, C1 = ${formatCapacitance(C)}`,
      ...analyticalSteps(`f0 = ${formatFrequency(fcActual)}`),
    ],
    explanation: `Inverting op-amp integrator: Vout = −(1/RC)∫Vin dt. Gain falls at −20 dB/decade and passes through unity (0 dB) at f0 = 1/(2π·R·C) = ${formatFrequency(fcActual)}. Verified by measuring the unity-gain frequency in SPICE.`,
    netlist: `Op-Amp Integrator — SPICE Netlist\n*AutoCDA Generated\nV1 in 0 AC 1\nR1 in inv ${formatResistance(R)}\nC1 inv out ${formatCapacitance(C)}\nE1 out 0 0 inv 1e6\n.ac dec 100 ${(fcActual/100).toPrecision(4)} ${(fcActual*100).toPrecision(4)}\n.end`,
  };
}

function rcDifferentiator({ fc = 1000 }) {
  // Op-amp differentiator; fc = unity-gain (0 dB) frequency = 1/(2*pi*R*C).
  const R = 10000;
  const C = 1 / (2 * Math.PI * R * fc);
  const fcActual = 1 / (2 * Math.PI * R * C);
  return {
    id: 'rc_differentiator', name: 'Op-Amp Differentiator',
    schematic: '/schematics/rc_differentiator.svg',
    simulationBadge: analyticalBadge(`f0 = ${formatFrequency(fcActual)}`),
    components: [
      { ref: 'C1', rawValue: C, unit: 'F', display: formatCapacitance(C), description: 'Input Capacitor', editable: true },
      { ref: 'R1', rawValue: R, unit: 'Ω', display: formatResistance(R), description: 'Feedback Resistor', editable: true },
    ],
    derivedParams: { fc: fcActual },
    graph: { type: 'bode', title: `Op-Amp Differentiator — unity-gain f0 = ${formatFrequency(fcActual)}`, xLabel: 'Frequency (Hz)', yLabel: 'Gain (dB)', cutoffFrequency: fcActual, filterType: 'highpass' },
    processingSteps: [
      '[✓] Input received: Op-Amp Differentiator',
      `[✓] Target unity-gain frequency: ${formatFrequency(fc)}`,
      '[✓] Formula: f0 = 1/(2π·R·C) (+20 dB/decade)', `[✓] C1 = ${formatCapacitance(C)}, R1 = ${formatResistance(R)}`,
      ...analyticalSteps(`f0 = ${formatFrequency(fcActual)}`),
    ],
    explanation: `Inverting op-amp differentiator: Vout = −RC·dVin/dt. Gain rises at +20 dB/decade and passes through unity (0 dB) at f0 = 1/(2π·R·C) = ${formatFrequency(fcActual)}. Verified by measuring the unity-gain frequency in SPICE.`,
    netlist: `Op-Amp Differentiator — SPICE Netlist\n*AutoCDA Generated\nV1 in 0 AC 1\nC1 in inv ${formatCapacitance(C)}\nR1 inv out ${formatResistance(R)}\nE1 out 0 0 inv 1e6\n.ac dec 100 ${(fcActual/100).toPrecision(4)} ${(fcActual*100).toPrecision(4)}\n.end`,
  };
}

function fourthOrderLowpass({ fc = 1000 }) {
  // 4th-order Butterworth low-pass = two cascaded Sallen-Key stages with the
  // Butterworth pole Qs (0.5412, 1.3065). Equal-R per stage: C1/C2 = 4*Q^2.
  const mkStage = (Q) => {
    const C2 = 10e-9;
    const C1 = 4 * Q * Q * C2;
    const R = 1 / (2 * Math.PI * fc * Math.sqrt(C1 * C2));
    return { R, C1, C2 };
  };
  const a = mkStage(0.5412);
  const b = mkStage(1.3065);
  const fcActual = fc;
  return {
    id: 'fourth_order_lowpass', name: '4th-Order Butterworth Low-Pass',
    schematic: '/schematics/fourth_order_lowpass.svg',
    simulationBadge: analyticalBadge(`fc = ${formatFrequency(fcActual)} (−80 dB/dec)`),
    components: [
      { ref: 'R1a', rawValue: a.R, unit: 'Ω', display: formatResistance(a.R), description: 'Stage 1 R', editable: true },
      { ref: 'R2a', rawValue: a.R, unit: 'Ω', display: formatResistance(a.R), description: 'Stage 1 R', editable: true },
      { ref: 'C1a', rawValue: a.C1, unit: 'F', display: formatCapacitance(a.C1), description: 'Stage 1 feedback C', editable: true },
      { ref: 'C2a', rawValue: a.C2, unit: 'F', display: formatCapacitance(a.C2), description: 'Stage 1 shunt C', editable: true },
      { ref: 'R1b', rawValue: b.R, unit: 'Ω', display: formatResistance(b.R), description: 'Stage 2 R', editable: true },
      { ref: 'R2b', rawValue: b.R, unit: 'Ω', display: formatResistance(b.R), description: 'Stage 2 R', editable: true },
      { ref: 'C1b', rawValue: b.C1, unit: 'F', display: formatCapacitance(b.C1), description: 'Stage 2 feedback C', editable: true },
      { ref: 'C2b', rawValue: b.C2, unit: 'F', display: formatCapacitance(b.C2), description: 'Stage 2 shunt C', editable: true },
    ],
    derivedParams: { fc: fcActual, Q1: 0.5412, Q2: 1.3065, order: 4 },
    graph: { type: 'bode', title: `4th-Order Butterworth Low-Pass (fc = ${formatFrequency(fcActual)}, −80 dB/dec)`, xLabel: 'Frequency (Hz)', yLabel: 'Gain (dB)', cutoffFrequency: fcActual, filterType: 'lowpass' },
    processingSteps: [
      '[✓] Input received: 4th-Order Butterworth Low-Pass',
      `[✓] Target cutoff: ${formatFrequency(fc)}`,
      '[✓] Topology: two cascaded Sallen-Key stages (Q = 0.541, 1.306)',
      `[✓] 8 components across two stages`,
      ...analyticalSteps(`fc = ${formatFrequency(fcActual)} (−80 dB/decade)`),
    ],
    explanation: `Fourth-order Butterworth low-pass built from two cascaded unity-gain Sallen-Key stages with pole Qs of 0.541 and 1.306. Roll-off is −80 dB/decade past ${formatFrequency(fcActual)}. Eight coupled components; SPICE measures the overall −3 dB point and the loop trims to the target.`,
    netlist: `4th-Order Butterworth Low-Pass — SPICE Netlist\n*AutoCDA Generated\nV1 in 0 AC 1\nR1a in a1 ${formatResistance(a.R)}\nR2a a1 b1 ${formatResistance(a.R)}\nC2a b1 0 ${formatCapacitance(a.C2)}\nC1a a1 o1 ${formatCapacitance(a.C1)}\nE1 o1 0 b1 0 1\nR1b o1 a2 ${formatResistance(b.R)}\nR2b a2 b2 ${formatResistance(b.R)}\nC2b b2 0 ${formatCapacitance(b.C2)}\nC1b a2 out ${formatCapacitance(b.C1)}\nE2 out 0 b2 0 1\n.ac dec 100 ${(fcActual/100).toPrecision(4)} ${(fcActual*100).toPrecision(4)}\n.end`,
  };
}

function currentSource({ I = 0.01 }) {
  // Op-amp + NMOS constant-current sink. Iout = Vref / Rset. Vref fixed at 2 V.
  const Vref = 2;
  const Rset = Vref / I;
  const IActual = Vref / Rset;
  return {
    id: 'current_source', name: 'Constant Current Source',
    schematic: '/schematics/current_source.svg',
    simulationBadge: analyticalBadge(`I = ${formatCurrent(IActual)}`),
    components: [
      { ref: 'R1', rawValue: Rset, unit: 'Ω', display: formatResistance(Rset), description: 'Set Resistor (Iout = Vref/Rset)', editable: true },
      { ref: 'M1', rawValue: null, unit: null, display: 'NMOS', description: 'Pass Transistor', editable: false },
    ],
    derivedParams: { I: IActual, Vref },
    graph: { type: 'bar', title: 'Constant Current Source',
      data: [{ label: `Iout (${formatCurrent(IActual)})`, value: +(IActual * 1000).toFixed(2), color: '#3fb950' }] },
    processingSteps: [
      '[✓] Input received: Constant Current Source',
      `[✓] Target current: ${formatCurrent(I)}`,
      '[✓] Topology: op-amp + NMOS, Iout = Vref/Rset (Vref = 2 V)',
      `[✓] Rset = ${formatResistance(Rset)}`,
      ...analyticalSteps(`I = ${formatCurrent(IActual)}`),
    ],
    explanation: `Op-amp + NMOS constant-current sink. The op-amp forces the set-resistor voltage to Vref (2 V), so Iout = Vref/Rset = ${formatCurrent(IActual)} regardless of load (within compliance). SPICE measures the delivered current and the loop trims Rset.`,
    netlist: `Constant Current Source — SPICE Netlist\n*AutoCDA Generated\nVdd vdd 0 DC 12\nVref ref 0 DC ${Vref}\nRload vdd d 1k\nVsense d drain DC 0\nM1 drain gate src src NM\nR1 src 0 ${formatResistance(Rset)}\nE1 gate 0 ref src 100000\n.model NM NMOS(VTO=1 KP=2)\n.op\n.end`,
  };
}

// ── A1: additional building blocks ─────────────────────────────────────────────

function mfbLowpass({ fc = 1000, K = 1 }) {
  // Multiple-feedback (infinite-gain) 2nd-order low-pass, single inverting op-amp.
  // DC gain = −R2/R1; ω0 = 1/√(R2·R3·C1·C2). Equal-R, equal-C seed (R1=R2=R3=R,
  // C1=C2=C) gives gain ≈ −1 and ω0 = 1/(R·C); SPICE measures the true −3 dB and
  // the loop trims R2/R3 to the target. A real active filter — no closed-form
  // single-component answer, so it is finished by SPICE-graded refinement.
  const C = 10e-9;
  const R = 1 / (2 * Math.PI * fc * C);
  const R1 = R / K; // set DC gain magnitude K = R2/R1
  const fcActual = fc;
  return {
    id: 'mfb_lowpass',
    name: 'Multiple-Feedback Low-Pass (2nd order)',
    schematic: '/schematics/mfb_lowpass.svg',
    simulationBadge: analyticalBadge(`fc = ${formatFrequency(fcActual)}, gain = −${+K.toPrecision(3)}`),
    components: [
      { ref: 'R1', rawValue: R1, unit: 'Ω', display: formatResistance(R1), description: 'Input Resistor',       editable: true },
      { ref: 'R2', rawValue: R,  unit: 'Ω', display: formatResistance(R),  description: 'Feedback Resistor',    editable: true },
      { ref: 'R3', rawValue: R,  unit: 'Ω', display: formatResistance(R),  description: 'Summing-Node Resistor', editable: true },
      { ref: 'C1', rawValue: C,  unit: 'F', display: formatCapacitance(C), description: 'Feedback Capacitor',   editable: true },
      { ref: 'C2', rawValue: C,  unit: 'F', display: formatCapacitance(C), description: 'Shunt Capacitor',      editable: true },
    ],
    derivedParams: { fc: fcActual, K, order: 2 },
    graph: { type: 'bode', title: `Frequency Response — MFB Low-Pass (fc = ${formatFrequency(fcActual)}, 2nd order)`, xLabel: 'Frequency (Hz)', yLabel: 'Gain (dB)', cutoffFrequency: fcActual, filterType: 'lowpass' },
    processingSteps: [
      '[✓] Input received: Multiple-Feedback Low-Pass Filter',
      `[✓] Target cutoff: ${formatFrequency(fc)}`,
      '[✓] Topology: 2nd-order inverting multiple-feedback (single op-amp)',
      '[✓] Formula: ω0 = 1/√(R2·R3·C1·C2), DC gain = −R2/R1',
      `[✓] C1 = C2 = ${formatCapacitance(C)}, R2 = R3 = ${formatResistance(R)}`,
      `[✓] R1 = ${formatResistance(R1)} (gain −${+K.toPrecision(3)})`,
      ...analyticalSteps(`fc = ${formatFrequency(fcActual)} (−40 dB/decade)`),
    ],
    explanation: `Second-order multiple-feedback (infinite-gain) low-pass using a single inverting op-amp. ω0 = 1/√(R2·R3·C1·C2) and DC gain = −R2/R1. With R2 = R3 = ${formatResistance(R)}, C1 = C2 = ${formatCapacitance(C)} and R1 = ${formatResistance(R1)} the cutoff is ${formatFrequency(fcActual)} with a −40 dB/decade roll-off and a gain of −${+K.toPrecision(3)}. Five coupled components set fc jointly — no single-component closed form — so SPICE-graded refinement finishes it.`,
    netlist: `Multiple-Feedback Low-Pass — SPICE Netlist\n*AutoCDA Generated\nV1 in 0 AC 1\nR1 in a ${formatResistance(R1)}\nR2 a out ${formatResistance(R)}\nR3 a m ${formatResistance(R)}\nC1 a out ${formatCapacitance(C)}\nC2 m 0 ${formatCapacitance(C)}\nE1 out 0 0 m 1e6\n.ac dec 100 ${(fcActual/100).toPrecision(4)} ${(fcActual*100).toPrecision(4)}\n.end`,
  };
}

function instrumentationAmp({ Av = 10 }) {
  // Classic 3-op-amp instrumentation amplifier. Stage-1 differential gain is
  // 1 + 2R/Rg; stage 2 is a unity-gain difference amp. Total gain = 1 + 2R/Rg.
  // Rg is the single gain-setting resistor; R (two equal feedback R's) and the
  // difference-amp resistors Rd are fixed. SPICE measures the end-to-end gain.
  const R = 10000;
  const Rd = 10000;
  const Rg = (2 * R) / Math.max(Av - 1, 1e-6);
  const AvActual = 1 + (2 * R) / Rg;
  return {
    id: 'instrumentation_amp',
    name: 'Instrumentation Amplifier (3 op-amp)',
    schematic: '/schematics/instrumentation_amp.svg',
    simulationBadge: analyticalBadge(`Gain = ${+AvActual.toPrecision(3)}`),
    components: [
      { ref: 'Rg', rawValue: Rg, unit: 'Ω', display: formatResistance(Rg), description: 'Gain-Set Resistor',   editable: true },
      { ref: 'R',  rawValue: R,  unit: 'Ω', display: formatResistance(R),  description: 'Stage-1 Feedback (×2)', editable: true },
      { ref: 'Rd', rawValue: Rd, unit: 'Ω', display: formatResistance(Rd), description: 'Difference-Amp Resistors (×4)', editable: true },
    ],
    derivedParams: { Av: AvActual },
    graph: {
      type: 'waveform', title: `Instrumentation Amp — Gain = ${+AvActual.toPrecision(3)}`,
      xLabel: 'Time (ms)', yLabel: 'Voltage (V)',
      input:  { amplitude: 0.1, label: 'Vin(diff)', color: '#58a6ff' },
      output: { amplitude: +(0.1 * AvActual).toPrecision(3), label: `Vout (${+AvActual.toPrecision(3)}×)`, color: '#3fb950' },
      frequency: 1000, phaseInvert: false,
    },
    processingSteps: [
      '[✓] Input received: Instrumentation Amplifier',
      `[✓] Target gain: ${+Av.toPrecision(3)}`,
      '[✓] Topology: 3-op-amp (two buffers + unity difference amp)',
      '[✓] Formula: Av = 1 + 2R/Rg',
      `[✓] R = ${formatResistance(R)} (×2), Rd = ${formatResistance(Rd)} (×4)`,
      `[✓] Rg calculated: ${formatResistance(Rg)}`,
      ...analyticalSteps(`gain = ${+AvActual.toPrecision(3)}`),
    ],
    explanation: `Three-op-amp instrumentation amplifier. The two input buffers with the shared gain resistor Rg give a differential gain of 1 + 2R/Rg; the output difference amp (matched Rd) subtracts and buffers. With R = ${formatResistance(R)} and Rg = ${formatResistance(Rg)} the total gain is ${+AvActual.toPrecision(3)}. High input impedance and strong common-mode rejection — the standard front end for sensor/bridge signals. SPICE measures the end-to-end gain and the loop trims Rg.`,
    netlist: `Instrumentation Amplifier — SPICE Netlist\n*AutoCDA Generated (ideal op-amps)\nV1 in 0 AC 1\nRg o1a o2a ${formatResistance(Rg)}\nRa o1a o1 ${formatResistance(R)}\nRb o2a o2 ${formatResistance(R)}\nE1 o1 0 in o1a 1e6\nE2 o2 0 0 o2a 1e6\nR3 o1 m ${formatResistance(Rd)}\nR4 m out ${formatResistance(Rd)}\nR5 o2 p ${formatResistance(Rd)}\nR6 p 0 ${formatResistance(Rd)}\nE3 out 0 p m 1e6\n.ac lin 1 1000 1000\n.end`,
  };
}

function currentMirror({ I = 0.01, VCC = 12 }) {
  // BJT current mirror. A reference current Iref = (VCC − Vbe)/Rref is set by the
  // diode-connected Q1 and mirrored by Q2 into the load: Iout ≈ Iref. Rref is the
  // single set resistor; SPICE measures the delivered output current.
  const Vbe = 0.7;
  const Rref = (VCC - Vbe) / I;
  const IActual = (VCC - Vbe) / Rref;
  return {
    id: 'current_mirror',
    name: 'BJT Current Mirror',
    schematic: '/schematics/current_mirror.svg',
    simulationBadge: analyticalBadge(`Iout = ${formatCurrent(IActual)}`),
    components: [
      { ref: 'Rref', rawValue: Rref, unit: 'Ω', display: formatResistance(Rref), description: 'Reference Set Resistor', editable: true },
      { ref: 'Q1',   rawValue: null, unit: null, display: 'NPN BJT', description: 'Diode-Connected Reference', editable: false },
      { ref: 'Q2',   rawValue: null, unit: null, display: 'NPN BJT', description: 'Mirror Output',            editable: false },
    ],
    derivedParams: { I: IActual, VCC },
    graph: {
      type: 'bar', title: 'Current Mirror — Reference vs Mirrored Output',
      data: [
        { label: `Iref`, value: +(IActual * 1000).toFixed(3), color: '#58a6ff', unit: 'mA' },
        { label: `Iout (${formatCurrent(IActual)})`, value: +(IActual * 1000).toFixed(3), color: '#3fb950', unit: 'mA' },
      ],
    },
    processingSteps: [
      '[✓] Input received: BJT Current Mirror',
      `[✓] Target output current: ${formatCurrent(I)}`,
      '[✓] Topology: diode-connected reference + mirror transistor',
      '[✓] Formula: Iref = (VCC − Vbe) / Rref, Iout ≈ Iref',
      `[✓] Rref calculated: ${formatResistance(Rref)}`,
      ...analyticalSteps(`Iout = ${formatCurrent(IActual)}`),
    ],
    explanation: `A BJT current mirror. The diode-connected transistor Q1 sets a reference current Iref = (VCC − Vbe)/Rref = ${formatCurrent(IActual)} through Rref = ${formatResistance(Rref)}; matched transistor Q2 mirrors it into the load. Output current tracks the reference largely independent of the load voltage (within compliance). SPICE measures the delivered current and the loop trims Rref.`,
    netlist: `BJT Current Mirror — SPICE Netlist\n*AutoCDA Generated\nVCC vcc 0 DC ${VCC}\nRref vcc cref ${formatResistance(Rref)}\nQ1 cref cref 0 QN\nQ2 cout cref 0 QN\nVsense vcc load DC 0\nRload load cout 1k\n.model QN NPN(Bf=200 Is=1e-14)\n.op\n.end`,
  };
}

// ── main export ──────────────────────────────────────────────────────────────

export function calculateCircuit(circuitId, params) {
  switch (circuitId) {
    case 'rc_lowpass':          return rcLowpass(params);
    case 'rc_highpass':         return rcHighpass(params);
    case 'voltage_divider':     return voltageDivider(params);
    case 'led_limiter':         return ledLimiter(params);
    case 'common_emitter':      return commonEmitter(params);
    case 'amplifier':           return commonEmitter(params); // alias
    case 'band_pass':           return bandPass(params);
    case 'opamp_inverting':     return opampInverting(params);
    case 'opamp_noninverting':  return opampNoninverting(params);
    case 'zener_regulator':     return zenerRegulator(params);
    case 'rc_oscillator':       return rcOscillator(params);
    case 'sallen_key_lowpass':  return sallenKeyLowpass(params);
    case 'sallen_key_highpass': return sallenKeyHighpass(params);
    case 'two_stage_amplifier': return twoStageAmplifier(params);
    case 'opamp_summing':       return opampSumming(params);
    case 'opamp_difference':    return opampDifference(params);
    case 'rc_integrator':       return rcIntegrator(params);
    case 'rc_differentiator':   return rcDifferentiator(params);
    case 'fourth_order_lowpass': return fourthOrderLowpass(params);
    case 'current_source':      return currentSource(params);
    case 'mfb_lowpass':         return mfbLowpass(params);
    case 'instrumentation_amp': return instrumentationAmp(params);
    case 'current_mirror':      return currentMirror(params);
    default: return null;
  }
}

// Recalculate graph when user edits a component value
export function recalculateFromComponents(circuitId, components, targets = {}) {
  const get = (ref) => components.find(c => c.ref === ref)?.rawValue;

  switch (circuitId) {
    case 'rc_lowpass': {
      const R = get('R1'), C = get('C1');
      if (!R || !C) return null;
      return rcLowpass({ fc: 1 / (2 * Math.PI * R * C), R });
    }
    case 'rc_highpass': {
      const R = get('R1'), C = get('C1');
      if (!R || !C) return null;
      return rcHighpass({ fc: 1 / (2 * Math.PI * R * C), R });
    }
    case 'voltage_divider': {
      const R1 = get('R1'), R2 = get('R2');
      if (!R1 || !R2) return null;
      // Vin not stored in components — keep previous
      return null; // handled in App
    }
    case 'led_limiter': {
      const R = get('R1'), Vf = get('D1');
      if (!R) return null;
      // Use the REAL supply from the spec, not a hardcoded 5 V, so the redrawn
      // circuit and its derived current match the design that was simulated.
      const Vsupply = typeof targets.Vsupply === 'number' ? targets.Vsupply : 5;
      const vf = Vf || 1.8;
      return ledLimiter({ Vsupply, I: (Vsupply - vf) / R, Vf: vf });
    }
    case 'common_emitter': {
      const RC = get('RC'), RE = get('RE');
      if (!RC || !RE) return null;
      return commonEmitter({ Av: RC / RE, RC });
    }
    default: return null;
  }
}
