import React, { useState, useEffect } from "react";

/* Inline SVG fallbacks — accurate electronic symbols */
const FALLBACK_SVGS = {
  rc_lowpass: `<svg viewBox="0 0 400 210" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" style="background:transparent;max-height:100%;overflow:visible">
  <defs><style>.lbl{font:12px 'JetBrains Mono',monospace;fill:#c9d1d9}.sym{stroke:#79c0ff;stroke-width:2;fill:none}.wire{stroke:#79c0ff;stroke-width:1.5;fill:none}</style></defs>
  <!-- Voltage source -->
  <circle cx="40" cy="120" r="20" class="sym"/>
  <text x="40" y="115" text-anchor="middle" class="lbl" font-size="10">+</text>
  <text x="40" y="130" text-anchor="middle" class="lbl" font-size="10">Vin</text>
  <!-- Top wire -->
  <line x1="40" y1="100" x2="40" y2="60" class="wire"/>
  <line x1="40" y1="60" x2="140" y2="60" class="wire"/>
  <!-- Resistor R1 zigzag -->
  <polyline points="140,60 148,60 152,44 160,76 168,44 176,76 184,44 192,60 200,60" class="sym"/>
  <text x="165" y="35" text-anchor="middle" class="lbl">R1 1kΩ</text>
  <!-- Wire after R1 -->
  <line x1="200" y1="60" x2="280" y2="60" class="wire"/>
  <!-- Capacitor C1 -->
  <line x1="280" y1="45" x2="280" y2="75" class="sym" stroke-width="3"/>
  <line x1="293" y1="45" x2="293" y2="75" class="sym" stroke-width="3"/>
  <line x1="280" y1="60" x2="240" y2="60" class="wire"/>
  <line x1="293" y1="60" x2="360" y2="60" class="wire"/>
  <text x="286" y="35" text-anchor="middle" class="lbl">C1 159nF</text>
  <!-- C1 to ground -->
  <line x1="286" y1="75" x2="286" y2="140" class="wire"/>
  <line x1="271" y1="140" x2="301" y2="140" class="wire"/>
  <line x1="276" y1="148" x2="296" y2="148" class="wire"/>
  <line x1="281" y1="156" x2="291" y2="156" class="wire"/>
  <!-- Vout label -->
  <circle cx="340" cy="60" r="4" fill="#3fb950"/>
  <text x="355" y="55" class="lbl" fill="#3fb950">Vout</text>
  <!-- Bottom wire -->
  <line x1="40" y1="140" x2="40" y2="170" class="wire"/>
  <line x1="40" y1="170" x2="286" y2="170" class="wire"/>
  <line x1="286" y1="170" x2="286" y2="156" class="wire"/>
</svg>`,

  rc_highpass: `<svg viewBox="0 0 400 200" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" style="background:transparent;max-height:100%;overflow:visible">
  <defs><style>.lbl{font:12px 'JetBrains Mono',monospace;fill:#c9d1d9}.sym{stroke:#79c0ff;stroke-width:2;fill:none}.wire{stroke:#79c0ff;stroke-width:1.5;fill:none}</style></defs>
  <!-- Voltage source -->
  <circle cx="40" cy="120" r="20" class="sym"/>
  <text x="40" y="115" text-anchor="middle" class="lbl" font-size="10">+</text>
  <text x="40" y="130" text-anchor="middle" class="lbl" font-size="10">Vin</text>
  <!-- Top wire -->
  <line x1="40" y1="100" x2="40" y2="60" class="wire"/>
  <line x1="40" y1="60" x2="130" y2="60" class="wire"/>
  <!-- Capacitor C1 in series -->
  <line x1="130" y1="45" x2="130" y2="75" class="sym" stroke-width="3"/>
  <line x1="143" y1="45" x2="143" y2="75" class="sym" stroke-width="3"/>
  <text x="136" y="35" text-anchor="middle" class="lbl">C1 318nF</text>
  <!-- Wire after C1 -->
  <line x1="143" y1="60" x2="220" y2="60" class="wire"/>
  <!-- Resistor R1 to ground (shunt) -->
  <polyline points="220,60 228,60 232,44 240,76 248,44 256,76 264,44 272,60 280,60" class="sym"/>
  <text x="250" y="35" text-anchor="middle" class="lbl">R1 1kΩ</text>
  <!-- R1 down to ground -->
  <line x1="220" y1="60" x2="220" y2="100" class="wire"/>
  <line x1="205" y1="140" x2="235" y2="140" class="wire"/>
  <line x1="210" y1="148" x2="230" y2="148" class="wire"/>
  <line x1="215" y1="156" x2="225" y2="156" class="wire"/>
  <line x1="220" y1="100" x2="220" y2="140" class="wire"/>
  <!-- Vout -->
  <line x1="280" y1="60" x2="350" y2="60" class="wire"/>
  <circle cx="330" cy="60" r="4" fill="#3fb950"/>
  <text x="345" y="55" class="lbl" fill="#3fb950">Vout</text>
  <!-- Bottom wire -->
  <line x1="40" y1="140" x2="40" y2="170" class="wire"/>
  <line x1="40" y1="170" x2="220" y2="170" class="wire"/>
  <line x1="220" y1="170" x2="220" y2="156" class="wire"/>
</svg>`,

  voltage_divider: `<svg viewBox="0 0 300 270" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" style="background:transparent;max-height:100%;overflow:visible">
  <defs><style>.lbl{font:12px 'JetBrains Mono',monospace;fill:#c9d1d9}.sym{stroke:#79c0ff;stroke-width:2;fill:none}.wire{stroke:#79c0ff;stroke-width:1.5;fill:none}</style></defs>
  <!-- Voltage source -->
  <circle cx="50" cy="130" r="22" class="sym"/>
  <text x="50" y="124" text-anchor="middle" class="lbl" font-size="10">12V</text>
  <text x="50" y="138" text-anchor="middle" class="lbl" font-size="10">Vin</text>
  <!-- Top wire -->
  <line x1="50" y1="108" x2="50" y2="50" class="wire"/>
  <line x1="50" y1="50" x2="160" y2="50" class="wire"/>
  <!-- R1 top zigzag -->
  <polyline points="160,50 168,50 172,34 180,66 188,34 196,66 204,34 212,50 220,50" class="sym"/>
  <text x="190" y="25" text-anchor="middle" class="lbl">R1 1.4kΩ</text>
  <!-- Middle node wire -->
  <line x1="220" y1="50" x2="220" y2="130" class="wire"/>
  <!-- R2 bottom zigzag -->
  <polyline points="220,130 228,130 232,114 240,146 248,114 256,146 264,114 272,130 280,130" class="sym"/>
  <text x="250" y="105" text-anchor="middle" class="lbl">R2 1kΩ</text>
  <!-- Ground -->
  <line x1="280" y1="130" x2="280" y2="210" class="wire"/>
  <line x1="265" y1="210" x2="295" y2="210" class="wire"/>
  <line x1="270" y1="218" x2="290" y2="218" class="wire"/>
  <line x1="275" y1="226" x2="285" y2="226" class="wire"/>
  <!-- Vout at middle node -->
  <circle cx="220" cy="130" r="5" fill="#3fb950"/>
  <text x="220" y="155" text-anchor="middle" class="lbl" fill="#3fb950">Vout=5V</text>
  <!-- Bottom wire -->
  <line x1="50" y1="152" x2="50" y2="210" class="wire"/>
  <line x1="50" y1="210" x2="280" y2="210" class="wire"/>
</svg>`,

  led_limiter: `<svg viewBox="0 0 400 200" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" style="background:transparent;max-height:100%;overflow:visible">
  <defs><style>.lbl{font:12px 'JetBrains Mono',monospace;fill:#c9d1d9}.sym{stroke:#79c0ff;stroke-width:2;fill:none}.wire{stroke:#79c0ff;stroke-width:1.5;fill:none}</style></defs>
  <!-- Voltage source -->
  <circle cx="40" cy="110" r="20" class="sym"/>
  <text x="40" y="105" text-anchor="middle" class="lbl" font-size="10">5V</text>
  <text x="40" y="119" text-anchor="middle" class="lbl" font-size="10">Vin</text>
  <!-- Top wire -->
  <line x1="40" y1="90" x2="40" y2="60" class="wire"/>
  <line x1="40" y1="60" x2="120" y2="60" class="wire"/>
  <!-- Resistor R1 zigzag -->
  <polyline points="120,60 128,60 132,44 140,76 148,44 156,76 164,44 172,60 180,60" class="sym"/>
  <text x="150" y="35" text-anchor="middle" class="lbl">R1 160Ω</text>
  <!-- Wire to LED -->
  <line x1="180" y1="60" x2="230" y2="60" class="wire"/>
  <!-- LED symbol: triangle + bar diode -->
  <polygon points="230,44 230,76 262,60" fill="#3fb950" fill-opacity="0.3" stroke="#3fb950" stroke-width="2"/>
  <line x1="262" y1="44" x2="262" y2="76" stroke="#3fb950" stroke-width="2.5"/>
  <text x="246" y="100" text-anchor="middle" class="lbl">D1 Vf=1.8V</text>
  <!-- LED emission arrows -->
  <line x1="270" y1="45" x2="285" y2="30" stroke="#d29922" stroke-width="1.5"/>
  <polygon points="285,30 278,33 282,37" fill="#d29922"/>
  <line x1="278" y1="52" x2="293" y2="37" stroke="#d29922" stroke-width="1.5"/>
  <polygon points="293,37 286,40 290,44" fill="#d29922"/>
  <!-- Wire after LED to ground -->
  <line x1="262" y1="60" x2="340" y2="60" class="wire"/>
  <line x1="340" y1="60" x2="340" y2="150" class="wire"/>
  <line x1="325" y1="150" x2="355" y2="150" class="wire"/>
  <line x1="330" y1="158" x2="350" y2="158" class="wire"/>
  <line x1="335" y1="166" x2="345" y2="166" class="wire"/>
  <!-- Bottom wire -->
  <line x1="40" y1="130" x2="40" y2="170" class="wire"/>
  <line x1="40" y1="170" x2="340" y2="170" class="wire"/>
  <line x1="340" y1="170" x2="340" y2="166" class="wire"/>
</svg>`,

  common_emitter: `<svg viewBox="0 0 420 290" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" style="background:transparent;max-height:100%;overflow:visible">
  <defs><style>.lbl{font:11px 'JetBrains Mono',monospace;fill:#c9d1d9}.sym{stroke:#79c0ff;stroke-width:2;fill:none}.wire{stroke:#79c0ff;stroke-width:1.5;fill:none}</style></defs>
  <!-- VCC rail -->
  <line x1="260" y1="10" x2="260" y2="30" class="wire"/>
  <text x="260" y="8" text-anchor="middle" class="lbl" fill="#d29922">VCC 12V</text>
  <!-- RC collector resistor -->
  <polyline points="260,30 267,30 270,18 276,42 282,18 288,42 294,18 300,30 307,30" class="sym"/>
  <text x="283" y="12" text-anchor="middle" class="lbl">RC 10kΩ</text>
  <!-- Wire from RC to collector -->
  <line x1="260" y1="50" x2="260" y2="80" class="wire"/>
  <!-- BJT NPN symbol -->
  <!-- Base line -->
  <line x1="200" y1="120" x2="240" y2="120" class="wire"/>
  <!-- Vertical bar -->
  <line x1="240" y1="100" x2="240" y2="140" stroke="#79c0ff" stroke-width="3"/>
  <!-- Collector line (angled up) -->
  <line x1="240" y1="107" x2="270" y2="80" class="sym"/>
  <!-- Emitter line (angled down) -->
  <line x1="240" y1="133" x2="270" y2="160" class="sym"/>
  <!-- Emitter arrow -->
  <polygon points="260,157 268,148 272,162" fill="#79c0ff"/>
  <!-- Labels -->
  <text x="290" y="78" class="lbl">C</text>
  <text x="186" y="124" class="lbl">B</text>
  <text x="290" y="170" class="lbl">E</text>
  <text x="245" y="120" class="lbl">Q1 BC547</text>
  <!-- Collector to RC -->
  <line x1="270" y1="80" x2="260" y2="80" class="wire"/>
  <!-- R1 top bias -->
  <line x1="160" y1="10" x2="160" y2="30" class="wire"/>
  <text x="160" y="8" text-anchor="middle" class="lbl" fill="#d29922">VCC</text>
  <polyline points="160,30 168,30 171,18 177,42 183,18 189,42 195,18 201,30 208,30" class="sym"/>
  <text x="180" y="12" text-anchor="middle" class="lbl">R1 100kΩ</text>
  <line x1="160" y1="50" x2="160" y2="120" class="wire"/>
  <line x1="160" y1="120" x2="200" y2="120" class="wire"/>
  <!-- R2 bottom bias -->
  <polyline points="160,120 168,120 171,108 177,132 183,108 189,132 195,108 201,120 208,120" class="sym"/>
  <text x="184" y="104" text-anchor="middle" class="lbl">R2 20kΩ</text>
  <line x1="160" y1="140" x2="160" y2="220" class="wire"/>
  <!-- Ground symbols -->
  <line x1="145" y1="220" x2="175" y2="220" class="wire"/>
  <line x1="150" y1="228" x2="170" y2="228" class="wire"/>
  <line x1="155" y1="236" x2="165" y2="236" class="wire"/>
  <!-- RE emitter resistor -->
  <line x1="270" y1="160" x2="270" y2="175" class="wire"/>
  <polyline points="270,175 278,175 281,163 287,187 293,163 299,187 305,163 311,175 318,175" class="sym"/>
  <text x="294" y="196" text-anchor="middle" class="lbl">RE 500Ω</text>
  <line x1="270" y1="195" x2="270" y2="220" class="wire"/>
  <line x1="255" y1="220" x2="285" y2="220" class="wire"/>
  <line x1="260" y1="228" x2="280" y2="228" class="wire"/>
  <line x1="265" y1="236" x2="275" y2="236" class="wire"/>
  <!-- Input coupling cap C1 -->
  <line x1="80" y1="120" x2="110" y2="120" class="wire"/>
  <line x1="110" y1="107" x2="110" y2="133" stroke="#79c0ff" stroke-width="3"/>
  <line x1="123" y1="107" x2="123" y2="133" stroke="#79c0ff" stroke-width="3"/>
  <line x1="123" y1="120" x2="160" y2="120" class="wire"/>
  <text x="116" y="100" text-anchor="middle" class="lbl">C1 10µF</text>
  <!-- Vin -->
  <line x1="60" y1="120" x2="80" y2="120" class="wire"/>
  <text x="45" y="120" text-anchor="middle" class="lbl" fill="#58a6ff">Vin</text>
  <!-- Vout at collector -->
  <line x1="270" y1="80" x2="360" y2="80" class="wire"/>
  <circle cx="345" cy="80" r="4" fill="#3fb950"/>
  <text x="365" y="84" class="lbl" fill="#3fb950">Vout</text>
</svg>`,

  band_pass: `<svg viewBox="0 0 440 240" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" style="background:transparent;max-height:100%;overflow:visible">
  <defs><style>.lbl{font:11px 'JetBrains Mono',monospace;fill:#c9d1d9}.sym{stroke:#79c0ff;stroke-width:2;fill:none}.wire{stroke:#79c0ff;stroke-width:1.5;fill:none}</style></defs>
  <!-- Voltage source -->
  <circle cx="40" cy="120" r="20" class="sym"/>
  <text x="40" y="116" text-anchor="middle" class="lbl" font-size="10">+</text>
  <text x="40" y="130" text-anchor="middle" class="lbl" font-size="10">Vin</text>
  <line x1="40" y1="100" x2="40" y2="60" class="wire"/>
  <line x1="40" y1="60" x2="90" y2="60" class="wire"/>
  <!-- HP stage: series C1 -->
  <line x1="90" y1="45" x2="90" y2="75" class="sym" stroke-width="3"/>
  <line x1="103" y1="45" x2="103" y2="75" class="sym" stroke-width="3"/>
  <text x="96" y="35" text-anchor="middle" class="lbl">C1</text>
  <text x="96" y="95" text-anchor="middle" class="lbl" fill="#d29922">HP</text>
  <line x1="103" y1="60" x2="150" y2="60" class="wire"/>
  <!-- HP shunt R1 to ground -->
  <circle cx="150" cy="60" r="3" fill="#79c0ff"/>
  <polyline points="150,60 150,68 134,74 166,86 134,98 166,110 150,116 150,124" class="sym"/>
  <text x="122" y="95" text-anchor="middle" class="lbl">R1</text>
  <line x1="150" y1="124" x2="150" y2="150" class="wire"/>
  <line x1="135" y1="150" x2="165" y2="150" class="wire"/>
  <line x1="140" y1="158" x2="160" y2="158" class="wire"/>
  <line x1="145" y1="166" x2="155" y2="166" class="wire"/>
  <!-- LP stage: series R2 -->
  <line x1="150" y1="60" x2="180" y2="60" class="wire"/>
  <polyline points="180,60 188,60 192,44 200,76 208,44 216,76 224,44 232,60 240,60" class="sym"/>
  <text x="210" y="35" text-anchor="middle" class="lbl">R2</text>
  <text x="210" y="95" text-anchor="middle" class="lbl" fill="#d29922">LP</text>
  <line x1="240" y1="60" x2="300" y2="60" class="wire"/>
  <!-- LP shunt C2 to ground -->
  <circle cx="300" cy="60" r="3" fill="#79c0ff"/>
  <line x1="285" y1="75" x2="315" y2="75" class="sym" stroke-width="3"/>
  <line x1="285" y1="88" x2="315" y2="88" class="sym" stroke-width="3"/>
  <text x="322" y="82" class="lbl">C2</text>
  <line x1="300" y1="60" x2="300" y2="75" class="wire"/>
  <line x1="300" y1="88" x2="300" y2="150" class="wire"/>
  <line x1="285" y1="150" x2="315" y2="150" class="wire"/>
  <line x1="290" y1="158" x2="310" y2="158" class="wire"/>
  <line x1="295" y1="166" x2="305" y2="166" class="wire"/>
  <!-- Vout -->
  <line x1="300" y1="60" x2="400" y2="60" class="wire"/>
  <circle cx="375" cy="60" r="4" fill="#3fb950"/>
  <text x="382" y="56" class="lbl" fill="#3fb950">Vout</text>
  <!-- Bottom rail -->
  <line x1="40" y1="140" x2="40" y2="185" class="wire"/>
  <line x1="40" y1="185" x2="300" y2="185" class="wire"/>
  <line x1="150" y1="185" x2="150" y2="166" class="wire"/>
  <line x1="300" y1="185" x2="300" y2="166" class="wire"/>
</svg>`,

  opamp_inverting: `<svg viewBox="0 0 420 240" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" style="background:transparent;max-height:100%;overflow:visible">
  <defs><style>.lbl{font:11px 'JetBrains Mono',monospace;fill:#c9d1d9}.sym{stroke:#79c0ff;stroke-width:2;fill:none}.wire{stroke:#79c0ff;stroke-width:1.5;fill:none}</style></defs>
  <!-- Vin through input resistor R1 to inverting input -->
  <text x="18" y="114" class="lbl" fill="#58a6ff">Vin</text>
  <line x1="35" y1="110" x2="60" y2="110" class="wire"/>
  <polyline points="60,110 68,110 72,94 80,126 88,94 96,126 104,94 112,126 120,110 128,110" class="sym"/>
  <text x="94" y="86" text-anchor="middle" class="lbl">R1 (Rin)</text>
  <line x1="128" y1="110" x2="190" y2="110" class="wire"/>
  <circle cx="170" cy="110" r="3" fill="#79c0ff"/>
  <!-- Op-amp -->
  <polygon points="190,80 190,180 290,130" class="sym"/>
  <text x="200" y="114" class="lbl">−</text>
  <text x="200" y="160" class="lbl">+</text>
  <text x="212" y="134" class="lbl">U1</text>
  <!-- Feedback Rf: inv node up and across to output -->
  <line x1="170" y1="110" x2="170" y2="50" class="wire"/>
  <polyline points="170,50 178,50 182,34 190,66 198,34 206,66 214,34 222,66 230,50 238,50" class="sym"/>
  <text x="204" y="26" text-anchor="middle" class="lbl">Rf</text>
  <line x1="238" y1="50" x2="330" y2="50" class="wire"/>
  <line x1="330" y1="50" x2="330" y2="130" class="wire"/>
  <!-- + input to ground -->
  <line x1="190" y1="150" x2="150" y2="150" class="wire"/>
  <line x1="150" y1="150" x2="150" y2="195" class="wire"/>
  <line x1="135" y1="195" x2="165" y2="195" class="wire"/>
  <line x1="140" y1="203" x2="160" y2="203" class="wire"/>
  <line x1="145" y1="211" x2="155" y2="211" class="wire"/>
  <!-- Output -->
  <line x1="290" y1="130" x2="390" y2="130" class="wire"/>
  <circle cx="330" cy="130" r="3" fill="#79c0ff"/>
  <circle cx="365" cy="130" r="4" fill="#3fb950"/>
  <text x="372" y="126" class="lbl" fill="#3fb950">Vout</text>
</svg>`,

  opamp_noninverting: `<svg viewBox="0 0 420 250" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" style="background:transparent;max-height:100%;overflow:visible">
  <defs><style>.lbl{font:11px 'JetBrains Mono',monospace;fill:#c9d1d9}.sym{stroke:#79c0ff;stroke-width:2;fill:none}.wire{stroke:#79c0ff;stroke-width:1.5;fill:none}</style></defs>
  <!-- Vin to non-inverting (+) input -->
  <text x="18" y="154" class="lbl" fill="#58a6ff">Vin</text>
  <line x1="35" y1="150" x2="190" y2="150" class="wire"/>
  <!-- Op-amp -->
  <polygon points="190,80 190,180 290,130" class="sym"/>
  <text x="200" y="114" class="lbl">−</text>
  <text x="200" y="160" class="lbl">+</text>
  <text x="212" y="134" class="lbl">U1</text>
  <!-- Inverting node -->
  <line x1="190" y1="110" x2="160" y2="110" class="wire"/>
  <circle cx="160" cy="110" r="3" fill="#79c0ff"/>
  <!-- Rg (R1) from inv node to ground (vertical) -->
  <polyline points="160,110 160,118 144,124 176,136 144,148 176,160 160,166 160,174" class="sym"/>
  <text x="132" y="145" text-anchor="middle" class="lbl">R1 (Rg)</text>
  <line x1="160" y1="174" x2="160" y2="200" class="wire"/>
  <line x1="145" y1="200" x2="175" y2="200" class="wire"/>
  <line x1="150" y1="208" x2="170" y2="208" class="wire"/>
  <line x1="155" y1="216" x2="165" y2="216" class="wire"/>
  <!-- Rf feedback: inv node up and across to output -->
  <line x1="160" y1="110" x2="160" y2="50" class="wire"/>
  <polyline points="160,50 168,50 172,34 180,66 188,34 196,66 204,34 212,66 220,50 228,50" class="sym"/>
  <text x="194" y="26" text-anchor="middle" class="lbl">Rf</text>
  <line x1="228" y1="50" x2="330" y2="50" class="wire"/>
  <line x1="330" y1="50" x2="330" y2="130" class="wire"/>
  <!-- Output -->
  <line x1="290" y1="130" x2="390" y2="130" class="wire"/>
  <circle cx="330" cy="130" r="3" fill="#79c0ff"/>
  <circle cx="365" cy="130" r="4" fill="#3fb950"/>
  <text x="372" y="126" class="lbl" fill="#3fb950">Vout</text>
</svg>`,

  zener_regulator: `<svg viewBox="0 0 400 220" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" style="background:transparent;max-height:100%;overflow:visible">
  <defs><style>.lbl{font:11px 'JetBrains Mono',monospace;fill:#c9d1d9}.sym{stroke:#79c0ff;stroke-width:2;fill:none}.wire{stroke:#79c0ff;stroke-width:1.5;fill:none}</style></defs>
  <!-- Vin source -->
  <circle cx="40" cy="115" r="20" class="sym"/>
  <text x="40" y="111" text-anchor="middle" class="lbl" font-size="10">Vin</text>
  <text x="40" y="125" text-anchor="middle" class="lbl" font-size="10">12V</text>
  <line x1="40" y1="95" x2="40" y2="55" class="wire"/>
  <line x1="40" y1="55" x2="120" y2="55" class="wire"/>
  <!-- Series resistor R1 -->
  <polyline points="120,55 128,55 132,39 140,71 148,39 156,71 164,39 172,55 180,55" class="sym"/>
  <text x="150" y="31" text-anchor="middle" class="lbl">R1</text>
  <line x1="180" y1="55" x2="260" y2="55" class="wire"/>
  <!-- Output node -->
  <circle cx="260" cy="55" r="3" fill="#79c0ff"/>
  <!-- Zener diode: cathode (top) to node, anode (bottom) to ground, reverse-biased -->
  <line x1="260" y1="55" x2="260" y2="84" class="wire"/>
  <polygon points="244,110 276,110 260,84" class="sym"/>
  <line x1="244" y1="84" x2="276" y2="84" class="sym"/>
  <line x1="244" y1="84" x2="237" y2="77" class="sym"/>
  <line x1="276" y1="84" x2="283" y2="91" class="sym"/>
  <text x="294" y="100" class="lbl">Dz 5V</text>
  <line x1="260" y1="110" x2="260" y2="150" class="wire"/>
  <line x1="245" y1="150" x2="275" y2="150" class="wire"/>
  <line x1="250" y1="158" x2="270" y2="158" class="wire"/>
  <line x1="255" y1="166" x2="265" y2="166" class="wire"/>
  <!-- Vout -->
  <line x1="260" y1="55" x2="350" y2="55" class="wire"/>
  <circle cx="330" cy="55" r="4" fill="#3fb950"/>
  <text x="337" y="51" class="lbl" fill="#3fb950">Vout</text>
  <!-- Source bottom to ground rail -->
  <line x1="40" y1="135" x2="40" y2="185" class="wire"/>
  <line x1="40" y1="185" x2="260" y2="185" class="wire"/>
  <line x1="260" y1="185" x2="260" y2="166" class="wire"/>
</svg>`,

  rc_oscillator: `<svg viewBox="0 0 480 280" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" style="background:transparent;max-height:100%;overflow:visible">
  <defs><style>.lbl{font:11px 'JetBrains Mono',monospace;fill:#c9d1d9}.sym{stroke:#79c0ff;stroke-width:2;fill:none}.wire{stroke:#79c0ff;stroke-width:1.5;fill:none}</style></defs>
  <text x="240" y="16" text-anchor="middle" class="lbl" fill="#d29922">Wien-Bridge Oscillator</text>
  <!-- Op-amp -->
  <polygon points="240,80 240,180 340,130" class="sym"/>
  <text x="252" y="114" class="lbl">−</text>
  <text x="252" y="160" class="lbl">+</text>
  <text x="262" y="135" class="lbl">U1</text>
  <!-- Output -->
  <line x1="340" y1="130" x2="450" y2="130" class="wire"/>
  <circle cx="420" cy="130" r="4" fill="#3fb950"/>
  <text x="427" y="126" class="lbl" fill="#3fb950">Vout</text>
  <circle cx="370" cy="130" r="3" fill="#79c0ff"/>
  <!-- Negative feedback: Rf output->inv (top) -->
  <line x1="210" y1="110" x2="210" y2="45" class="wire"/>
  <polyline points="210,45 218,45 222,29 230,61 238,29 246,61 254,29 262,61 270,45 278,45" class="sym"/>
  <text x="244" y="21" text-anchor="middle" class="lbl">Rf</text>
  <line x1="278" y1="45" x2="370" y2="45" class="wire"/>
  <line x1="370" y1="45" x2="370" y2="130" class="wire"/>
  <!-- Inverting input + gain resistor R2 to ground -->
  <line x1="210" y1="110" x2="240" y2="110" class="wire"/>
  <circle cx="210" cy="110" r="3" fill="#79c0ff"/>
  <polyline points="210,110 210,116 194,122 226,132 194,142 226,152 210,158 210,164" class="sym"/>
  <text x="182" y="140" text-anchor="middle" class="lbl">R2</text>
  <line x1="210" y1="164" x2="210" y2="185" class="wire"/>
  <line x1="195" y1="185" x2="225" y2="185" class="wire"/>
  <line x1="200" y1="193" x2="220" y2="193" class="wire"/>
  <line x1="205" y1="201" x2="215" y2="201" class="wire"/>
  <!-- Non-inverting (+) node fed by Wien network -->
  <line x1="240" y1="150" x2="150" y2="150" class="wire"/>
  <circle cx="150" cy="150" r="3" fill="#79c0ff"/>
  <!-- Series arm: output tap -> R (series) -> C (series) -> + node -->
  <line x1="370" y1="130" x2="370" y2="245" class="wire"/>
  <polyline points="370,245 362,245 358,229 350,261 342,229 334,261 326,229 318,245 310,245" class="sym"/>
  <text x="344" y="275" text-anchor="middle" class="lbl">Rs</text>
  <line x1="310" y1="245" x2="278" y2="245" class="wire"/>
  <line x1="278" y1="230" x2="278" y2="260" class="sym" stroke-width="3"/>
  <line x1="265" y1="230" x2="265" y2="260" class="sym" stroke-width="3"/>
  <text x="272" y="275" text-anchor="middle" class="lbl">Cs</text>
  <line x1="265" y1="245" x2="150" y2="245" class="wire"/>
  <line x1="150" y1="245" x2="150" y2="150" class="wire"/>
  <!-- Parallel arm: + node -> R || C -> ground -->
  <line x1="150" y1="150" x2="90" y2="150" class="wire"/>
  <circle cx="90" cy="150" r="3" fill="#79c0ff"/>
  <!-- parallel R (vertical) -->
  <line x1="90" y1="150" x2="65" y2="150" class="wire"/>
  <polyline points="65,150 65,156 49,162 81,172 49,182 81,192 65,198 65,204" class="sym"/>
  <text x="40" y="180" text-anchor="middle" class="lbl">Rp</text>
  <line x1="65" y1="204" x2="65" y2="222" class="wire"/>
  <!-- parallel C (vertical) -->
  <line x1="90" y1="150" x2="120" y2="150" class="wire"/>
  <line x1="105" y1="168" x2="135" y2="168" class="sym" stroke-width="3"/>
  <line x1="105" y1="181" x2="135" y2="181" class="sym" stroke-width="3"/>
  <text x="142" y="178" class="lbl">Cp</text>
  <line x1="120" y1="150" x2="120" y2="168" class="wire"/>
  <line x1="120" y1="181" x2="120" y2="222" class="wire"/>
  <!-- ground for parallel arm -->
  <line x1="65" y1="222" x2="120" y2="222" class="wire"/>
  <line x1="92" y1="222" x2="92" y2="229" class="wire"/>
  <line x1="77" y1="229" x2="107" y2="229" class="wire"/>
  <line x1="82" y1="237" x2="102" y2="237" class="wire"/>
  <line x1="87" y1="245" x2="97" y2="245" class="wire"/>
</svg>`,
};

export default function SchematicPanel({ circuit, visible }) {
  const [imgError, setImgError] = useState(false);
  const [key, setKey] = useState(0);

  useEffect(() => {
    setImgError(false);
    setKey((k) => k + 1);
  }, [circuit]);

  if (!circuit) {
    return (
      <div style={panelStyle}>
        <PanelHeader title="CIRCUIT SCHEMATIC" />
        <div style={emptyStyle}>Select a circuit to view schematic</div>
      </div>
    );
  }

  const fallbackSvg = FALLBACK_SVGS[circuit.id];

  return (
    <div style={{ ...panelStyle, opacity: visible ? 1 : 0, transition: "opacity 0.4s ease" }}>
      <PanelHeader title="CIRCUIT SCHEMATIC" />
      <div style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "12px 16px",
        minHeight: 0,
        overflow: "hidden",
      }}>
        {!imgError ? (
          <img
            key={key}
            src={circuit.schematic}
            alt={circuit.name}
            onError={() => setImgError(true)}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
          />
        ) : fallbackSvg ? (
          <div
            style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
            dangerouslySetInnerHTML={{ __html: fallbackSvg }}
          />
        ) : (
          <div style={emptyStyle}>Schematic unavailable</div>
        )}
      </div>
      <div style={{
        padding: "12px 16px 16px",
        display: "flex",
        justifyContent: "center",
        borderTop: "1px solid #30363d",
        background: "#0d1117",
        flexShrink: 0,
      }}>
        <span style={{
          background: visible ? "#1a3a1a" : "transparent",
          border: `1px solid ${visible ? "#3fb950" : "#30363d"}`,
          borderRadius: "20px",
          padding: "5px 16px",
          color: visible ? "#3fb950" : "#484f58",
          fontSize: "12px",
          fontFamily: "'JetBrains Mono', monospace",
          transition: "all 0.4s ease",
          whiteSpace: "nowrap",
        }}>
          {visible ? circuit.simulationBadge : "Awaiting simulation..."}
        </span>
      </div>
    </div>
  );
}

function PanelHeader({ title }) {
  return (
    <div style={{
      padding: "12px 16px 8px",
      fontSize: "10px",
      letterSpacing: "0.08em",
      color: "#8b949e",
      fontFamily: "'JetBrains Mono', monospace",
      fontWeight: 600,
      borderBottom: "1px solid #30363d",
      flexShrink: 0,
    }}>
      {title}
    </div>
  );
}

const panelStyle = {
  background: "#161b22",
  border: "1px solid #30363d",
  borderRadius: "8px",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  height: "100%",
};

const emptyStyle = {
  color: "#484f58",
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: "13px",
  padding: "20px",
  textAlign: "center",
};
