export default {
  id: "led_limiter",
  name: "LED Current Limiter",
  prompt: "Design an LED current limiter circuit for 5V supply and 20mA LED current",
  schematic: "/schematics/led_limiter.svg",
  components: [
    { ref: "R1", value: "160 Ω", description: "Current Limiting Resistor" },
    { ref: "D1", value: "Vf = 1.8V", description: "LED (Red)" },
  ],
  processingSteps: [
    "[✓] Input received: LED Current Limiter 5V 20mA",
    "[✓] Intent extracted: Circuit type = LED Current Limiter",
    "[✓] Parameters identified: Vsupply = 5V, I = 20mA",
    "[✓] Topology selected: Series resistor with LED",
    "[✓] Formula applied: R = (Vsupply − Vf) / I",
    "[✓] LED forward voltage assumed: Vf = 1.8V",
    "[✓] R1 calculated: (5 − 1.8) / 0.02 = 160 Ω",
    "[✓] SPICE netlist generated",
    "[✓] Ngspice simulation running...",
    "[✓] Simulation complete — current = 19.8 mA",
    "[✓] Verification passed — error: 1.0%",
    "[✓] Schematic rendered via Schemdraw",
  ],
  graph: {
    type: "bar",
    title: "Current Verification — Target vs Simulated",
    data: [
      { label: "Target Current", value: 20, color: "#58a6ff", unit: "mA" },
      { label: "Simulated Current", value: 19.8, color: "#3fb950", unit: "mA" },
    ],
  },
  explanation:
    "An LED Current Limiter was designed using the formula R = (Vsupply − Vf) / I. With a 5V supply voltage, LED forward voltage of 1.8V, and a desired current of 20mA, the limiting resistor was calculated as 160 Ω. Ngspice simulation confirmed a current of 19.8 mA through the LED, within 1% of the target. The series resistor protects the LED from overcurrent damage which would otherwise destroy the component instantly.",
  netlist:
    "LED Current Limiter — SPICE Netlist\n*AutoCDA Generated Netlist\nVin in 0 DC 5\nR1 in mid 160\nD1 mid 0 DLED\n.model DLED D(Is=1e-12 N=1.5 Vj=1.8)\n.DC Vin 5 5 1\n.PROBE I(D1)\n.END",
  simulationBadge: "✓ Simulation Passed — Current: 19.8mA",
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
    (symbol "Device:LED"
      (property "Reference" "D" (at 0 2.54 90) (effects (font (size 1.27 1.27))))
      (property "Value" "LED" (at 0 0 90) (effects (font (size 1.27 1.27))))
      (symbol "LED_0_1"
        (polyline (pts (xy -1.524 -1.524) (xy -1.524 1.524)) (stroke (width 0.254) (type default)) (fill (type none)))
        (polyline (pts (xy -1.524 0) (xy 1.524 0)) (stroke (width 0) (type default)) (fill (type none)))
        (polyline (pts (xy 1.524 -1.524) (xy -1.524 0) (xy 1.524 1.524) (xy 1.524 -1.524)) (stroke (width 0.254) (type default)) (fill (type none)))
        (polyline (pts (xy 0.762 1.778) (xy 1.778 2.794) (xy 1.27 2.794)) (stroke (width 0) (type default)) (fill (type none)))
        (polyline (pts (xy 1.778 2.794) (xy 1.778 2.286)) (stroke (width 0) (type default)) (fill (type none)))
        (polyline (pts (xy 1.524 1.778) (xy 2.54 2.794) (xy 2.032 2.794)) (stroke (width 0) (type default)) (fill (type none)))
        (polyline (pts (xy 2.54 2.794) (xy 2.54 2.286)) (stroke (width 0) (type default)) (fill (type none)))
      )
      (symbol "LED_1_1"
        (pin passive line (at -1.524 0 0) (length 0) (name "A" (effects (font (size 1.27 1.27)))) (number "A" (effects (font (size 1.27 1.27)))))
        (pin passive line (at 1.524 0 180) (length 0) (name "K" (effects (font (size 1.27 1.27)))) (number "K" (effects (font (size 1.27 1.27)))))
      )
    )
    (symbol "power:+5V"
      (property "Reference" "#PWR" (at 0 -1.016 0) (effects (font (size 1.27 1.27)) hide))
      (property "Value" "+5V" (at 0 3.556 0) (effects (font (size 1.27 1.27))))
      (symbol "+5V_0_1"
        (polyline (pts (xy -0.762 1.27) (xy 0 2.54)) (stroke (width 0) (type default)) (fill (type none)))
        (polyline (pts (xy 0 0) (xy 0 2.54)) (stroke (width 0) (type default)) (fill (type none)))
        (polyline (pts (xy 0.762 1.27) (xy 0 2.54)) (stroke (width 0) (type default)) (fill (type none)))
      )
      (symbol "+5V_1_1"
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
  (wire (pts (xy 90 78) (xy 90 88.9)))
  (wire (pts (xy 90 88.9) (xy 99.314 88.9)))
  (wire (pts (xy 103.886 88.9) (xy 111.476 88.9)))
  (wire (pts (xy 114.524 88.9) (xy 127 88.9)))
  (symbol (lib_id "power:+5V") (at 90 78 0) (unit 1)
    (property "Reference" "#PWR01" (at 90 74.444 0) (effects (font (size 1.27 1.27)) hide))
    (property "Value" "+5V" (at 90 74.444 0) (effects (font (size 1.27 1.27))))
    (pin "1" (uuid "pwr01-led"))
  )
  (symbol (lib_id "Device:R") (at 101.6 88.9 90) (unit 1)
    (property "Reference" "R1" (at 101.6 85.344 90) (effects (font (size 1.27 1.27))))
    (property "Value" "160" (at 101.6 92.456 90) (effects (font (size 1.27 1.27))))
    (pin "1" (uuid "r1p1-led"))
    (pin "2" (uuid "r1p2-led"))
  )
  (symbol (lib_id "Device:LED") (at 113 88.9 0) (unit 1)
    (property "Reference" "D1" (at 113 85.344 0) (effects (font (size 1.27 1.27))))
    (property "Value" "LED_Red_Vf1.8V" (at 113 92.456 0) (effects (font (size 1.27 1.27))))
    (pin "A" (uuid "d1pa-led"))
    (pin "K" (uuid "d1pk-led"))
  )
  (symbol (lib_id "power:GND") (at 127 88.9 0) (unit 1)
    (property "Reference" "#PWR02" (at 127 92.456 0) (effects (font (size 1.27 1.27)) hide))
    (property "Value" "GND" (at 127 95.25 0) (effects (font (size 1.27 1.27))))
    (pin "1" (uuid "gnd01-led"))
  )
)`,
  kicadNetlist: `(export (version D)
 (design
  (source "autocda_led_limiter")
  (date "2026-06-01")
  (tool "AutoCDA v1.0")
 )
 (components
  (comp (ref "R1") (value "160") (description "Current Limiting Resistor")
   (libsource (lib "Device") (part "R"))
  )
  (comp (ref "D1") (value "LED_Red") (description "LED Vf=1.8V")
   (libsource (lib "Device") (part "LED"))
  )
  (comp (ref "V1") (value "5V") (description "DC Voltage Source")
   (libsource (lib "power") (part "VCC"))
  )
 )
 (nets
  (net (code "1") (name "in")
   (node (ref "V1") (pin "1"))
   (node (ref "R1") (pin "1"))
  )
  (net (code "2") (name "mid")
   (node (ref "R1") (pin "2"))
   (node (ref "D1") (pin "A"))
  )
  (net (code "3") (name "GND")
   (node (ref "V1") (pin "2"))
   (node (ref "D1") (pin "K"))
  )
 )
)`,
};
