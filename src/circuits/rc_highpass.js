export default {
  id: "rc_highpass",
  name: "RC High-Pass Filter",
  prompt: "Design a high-pass RC filter with cutoff frequency 500 Hz",
  schematic: "/schematics/rc_highpass.svg",
  components: [
    { ref: "C1", value: "318 nF", description: "Series Capacitor" },
    { ref: "R1", value: "1 kΩ", description: "Shunt Resistor" },
  ],
  processingSteps: [
    "[✓] Input received: RC High-Pass Filter",
    "[✓] Intent extracted: Circuit type = RC High-Pass Filter",
    "[✓] Parameter identified: Cutoff frequency = 500 Hz",
    "[✓] Topology selected: Series C, shunt R",
    "[✓] Formula applied: fc = 1 / (2πRC)",
    "[✓] R1 selected: 1 kΩ (standard value)",
    "[✓] C1 calculated: 318 nF",
    "[✓] SPICE netlist generated",
    "[✓] Ngspice simulation running...",
    "[✓] Simulation complete — cutoff at 503 Hz",
    "[✓] Verification passed — error: 0.6%",
    "[✓] Schematic rendered via Schemdraw",
  ],
  graph: {
    type: "bode",
    title: "Frequency Response — RC High-Pass Filter",
    xLabel: "Frequency (Hz)",
    yLabel: "Gain (dB)",
    cutoffFrequency: 500,
    filterType: "highpass",
  },
  explanation:
    "An RC High-Pass Filter was designed using the formula fc = 1/(2πRC). With a cutoff frequency of 500 Hz and R = 1 kΩ, the capacitance was calculated as 318 nF. Simulation verified a cutoff at 503 Hz, within 0.6% of the target. Low-frequency signals are attenuated at -20 dB per decade below 500 Hz while frequencies above pass through to the output with full amplitude.",
  netlist:
    "RC High-Pass Filter — SPICE Netlist\n*AutoCDA Generated Netlist\nVin in 0 AC 1\nC1 in out 318n\nR1 out 0 1k\n.AC DEC 100 10 100k\n.PROBE V(out)\n.END",
  simulationBadge: "✓ Simulation Passed — Error: 0.6%",
  kicadSchematic: `(kicad_sch (version 20231120) (generator "AutoCDA_v1.0")
  (paper "A4")
  (lib_symbols
    (symbol "Device:R"
      (property "Reference" "R" (at 2.032 0 90) (effects (font (size 1.27 1.27))))
      (property "Value" "R" (at 0 0 90) (effects (font (size 1.27 1.27))))
      (symbol "R_0_1"
        (polyline (pts (xy 0 -2.286) (xy 0 -1.778)) (stroke (width 0) (type default)) (fill (type none)))
        (polyline (pts (xy 0 1.778) (xy 0 2.286)) (stroke (width 0) (type default)) (fill (type none)))
        (rectangle (start -1.016 -1.778) (end 1.016 1.778) (stroke (width 0.254) (type default)) (fill (type none)))
      )
      (symbol "R_1_1"
        (pin passive line (at 0 2.286 270) (length 0) (name "~" (effects (font (size 1.27 1.27)))) (number "1" (effects (font (size 1.27 1.27)))))
        (pin passive line (at 0 -2.286 90) (length 0) (name "~" (effects (font (size 1.27 1.27)))) (number "2" (effects (font (size 1.27 1.27)))))
      )
    )
    (symbol "Device:C"
      (property "Reference" "C" (at 0.635 0 90) (effects (font (size 1.27 1.27))))
      (property "Value" "C" (at 0 -2.54 0) (effects (font (size 1.27 1.27))))
      (symbol "C_0_1"
        (polyline (pts (xy -2.286 -0.508) (xy 2.286 -0.508)) (stroke (width 0.508) (type default)) (fill (type none)))
        (polyline (pts (xy -2.286 0.508) (xy 2.286 0.508)) (stroke (width 0.508) (type default)) (fill (type none)))
      )
      (symbol "C_1_1"
        (pin passive line (at 0 2.286 270) (length 1.778) (name "~" (effects (font (size 1.27 1.27)))) (number "1" (effects (font (size 1.27 1.27)))))
        (pin passive line (at 0 -2.286 90) (length 1.778) (name "~" (effects (font (size 1.27 1.27)))) (number "2" (effects (font (size 1.27 1.27)))))
      )
    )
    (symbol "power:VCC"
      (property "Reference" "#PWR" (at 0 -1.016 0) (effects (font (size 1.27 1.27)) hide))
      (property "Value" "VCC" (at 0 3.556 0) (effects (font (size 1.27 1.27))))
      (symbol "VCC_0_1"
        (polyline (pts (xy -0.762 1.27) (xy 0 2.54)) (stroke (width 0) (type default)) (fill (type none)))
        (polyline (pts (xy 0 0) (xy 0 2.54)) (stroke (width 0) (type default)) (fill (type none)))
        (polyline (pts (xy 0.762 1.27) (xy 0 2.54)) (stroke (width 0) (type default)) (fill (type none)))
      )
      (symbol "VCC_1_1"
        (pin power_in line (at 0 0 270) (length 0) (name "~" (effects (font (size 1.27 1.27)))) (number "1" (effects (font (size 1.27 1.27)))))
      )
    )
    (symbol "power:GND"
      (property "Reference" "#PWR" (at 0 -1.778 0) (effects (font (size 1.27 1.27)) hide))
      (property "Value" "GND" (at 0 -3.556 0) (effects (font (size 1.27 1.27))))
      (symbol "GND_0_1"
        (polyline (pts (xy 0 0) (xy 0 -1.27)) (stroke (width 0) (type default)) (fill (type none)))
        (polyline (pts (xy 1.27 -1.27) (xy -1.27 -1.27)) (stroke (width 0) (type default)) (fill (type none)))
        (polyline (pts (xy 0.762 -1.778) (xy -0.762 -1.778)) (stroke (width 0) (type default)) (fill (type none)))
        (polyline (pts (xy 0.254 -2.286) (xy -0.254 -2.286)) (stroke (width 0) (type default)) (fill (type none)))
      )
      (symbol "GND_1_1"
        (pin power_in line (at 0 0 90) (length 0) (name "~" (effects (font (size 1.27 1.27)))) (number "1" (effects (font (size 1.27 1.27)))))
      )
    )
  )
  (wire (pts (xy 88.9 78) (xy 88.9 88.9)))
  (wire (pts (xy 88.9 88.9) (xy 97.524 88.9)))
  (wire (pts (xy 102.336 88.9) (xy 110.236 88.9)))
  (wire (pts (xy 114.808 88.9) (xy 127 88.9)))
  (wire (pts (xy 110.236 88.9) (xy 110.236 103.9)))
  (symbol (lib_id "power:VCC") (at 88.9 78 0) (unit 1)
    (property "Reference" "#PWR01" (at 88.9 74.444 0) (effects (font (size 1.27 1.27)) hide))
    (property "Value" "Vin_AC" (at 88.9 74.444 0) (effects (font (size 1.27 1.27))))
    (pin "1" (uuid "pwr01-hp"))
  )
  (symbol (lib_id "Device:C") (at 99.93 88.9 90) (unit 1)
    (property "Reference" "C1" (at 99.93 85.344 90) (effects (font (size 1.27 1.27))))
    (property "Value" "318nF" (at 99.93 92.456 90) (effects (font (size 1.27 1.27))))
    (pin "1" (uuid "c1p1-hp"))
    (pin "2" (uuid "c1p2-hp"))
  )
  (symbol (lib_id "Device:R") (at 112.522 88.9 0) (unit 1)
    (property "Reference" "R1" (at 112.522 85.344 0) (effects (font (size 1.27 1.27))))
    (property "Value" "1k" (at 112.522 92.456 0) (effects (font (size 1.27 1.27))))
    (pin "1" (uuid "r1p1-hp"))
    (pin "2" (uuid "r1p2-hp"))
  )
  (symbol (lib_id "power:GND") (at 110.236 103.9 0) (unit 1)
    (property "Reference" "#PWR02" (at 110.236 107.456 0) (effects (font (size 1.27 1.27)) hide))
    (property "Value" "GND" (at 110.236 110.25 0) (effects (font (size 1.27 1.27))))
    (pin "1" (uuid "gnd01-hp"))
  )
  (label "Vout" (at 127 88.9 0) (effects (font (size 1.27 1.27)) (justify right)))
)`,
  kicadNetlist: `(export (version D)
 (design
  (source "autocda_rc_highpass")
  (date "2026-06-01")
  (tool "AutoCDA v1.0")
 )
 (components
  (comp (ref "C1") (value "318n") (description "Series Capacitor")
   (libsource (lib "Device") (part "C"))
  )
  (comp (ref "R1") (value "1k") (description "Shunt Resistor")
   (libsource (lib "Device") (part "R"))
  )
  (comp (ref "V1") (value "Vin") (description "AC Voltage Source")
   (libsource (lib "power") (part "VCC"))
  )
 )
 (nets
  (net (code "1") (name "in")
   (node (ref "V1") (pin "1"))
   (node (ref "C1") (pin "1"))
  )
  (net (code "2") (name "out")
   (node (ref "C1") (pin "2"))
   (node (ref "R1") (pin "1"))
  )
  (net (code "3") (name "GND")
   (node (ref "V1") (pin "2"))
   (node (ref "R1") (pin "2"))
  )
 )
)`,
};
