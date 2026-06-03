// KiCad 8/10 simulation-ready schematic generator
//
// RELIABILITY RULES (from KiCad forum + ngspice docs):
// 1. V1 source connects via NET LABELS — never long wires (alignment fails silently)
// 2. GND symbol placed DIRECTLY at V1− pin — no wire gap
// 3. Value="AC 1" kept on VSOURCE as fallback for KiCad versions where Sim.Params bugs out
// 4. power:GND → ngspice node "0" automatically — always use it for ground
// 5. Sim.Device="V" + Sim.Params needed for KiCad 8+ ngspice engine
//
// Pin endpoints (length=0 → endpoint = anchor):
//   R/C  (cx,cy) rot  0°: pin1(bot)=(cx,cy+2.286)  pin2(top)=(cx,cy-2.286)
//   R/C  (cx,cy) rot 90°: pin1(R)  =(cx+2.286,cy)  pin2(L)  =(cx-2.286,cy)
//   VSRC (cx,cy) rot  0°: +(top)   =(cx,cy-2.54)   -(bot)   =(cx,cy+2.54)
//   LED  (cx,cy) rot  0°: A(L)     =(cx-2.286,cy)  K(R)     =(cx+2.286,cy)
//   GND  (cx,cy): pin connects AT (cx,cy)

function w(id, x1, y1, x2, y2) {
  return `  (wire (pts (xy ${x1} ${y1}) (xy ${x2} ${y2})) (stroke (width 0) (type default)) (uuid "${id}"))`;
}
function junc(id, x, y) {
  return `  (junction (at ${x} ${y}) (diameter 0) (color 0 0 0 0) (uuid "${id}"))`;
}
function netlabel(id, text, x, y, angle) {
  return `  (label "${text}" (at ${x} ${y} ${angle}) (fields_autoplaced yes) (effects (font (size 1.27 1.27)) (justify left)) (uuid "${id}"))`;
}
function simText(id, directive, x, y) {
  return `  (text "${directive}" (at ${x} ${y} 0) (effects (font (size 1.27 1.27)) (justify left)) (uuid "${id}"))`;
}

// ── lib symbols ──────────────────────────────────────────────────────────────

const LIB_R = `    (symbol "Device:R"
      (pin_numbers (hide yes)) (pin_names (offset 0))
      (exclude_from_sim no) (in_bom yes) (on_board yes)
      (property "Reference" "R" (at 2.032 0 90) (effects (font (size 1.27 1.27))))
      (property "Value" "R" (at 0 0 90) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "~" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "R_0_1"
        (polyline (pts (xy 0 -2.286) (xy 0 -1.778)) (stroke (width 0) (type default)) (fill (type none)))
        (polyline (pts (xy 0  1.778) (xy 0  2.286)) (stroke (width 0) (type default)) (fill (type none)))
        (rectangle (start -1.016 -1.778) (end 1.016 1.778) (stroke (width 0.254) (type default)) (fill (type none)))
      )
      (symbol "R_1_1"
        (pin passive line (at 0  2.286 270) (length 0) (name "~" (effects (font (size 1.27 1.27)))) (number "1" (effects (font (size 1.27 1.27)))))
        (pin passive line (at 0 -2.286  90) (length 0) (name "~" (effects (font (size 1.27 1.27)))) (number "2" (effects (font (size 1.27 1.27)))))
      )
    )`;

const LIB_C = `    (symbol "Device:C"
      (pin_numbers (hide yes)) (pin_names (offset 0.254))
      (exclude_from_sim no) (in_bom yes) (on_board yes)
      (property "Reference" "C" (at 0.635 0 90) (effects (font (size 1.27 1.27))))
      (property "Value" "C" (at 0 0 90) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "~" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "C_0_1"
        (polyline (pts (xy -2.032 -0.508) (xy 2.032 -0.508)) (stroke (width 0.508) (type default)) (fill (type none)))
        (polyline (pts (xy -2.032  0.508) (xy 2.032  0.508)) (stroke (width 0.508) (type default)) (fill (type none)))
        (polyline (pts (xy 0 -0.508) (xy 0 -2.286)) (stroke (width 0) (type default)) (fill (type none)))
        (polyline (pts (xy 0  0.508) (xy 0  2.286)) (stroke (width 0) (type default)) (fill (type none)))
      )
      (symbol "C_1_1"
        (pin passive line (at 0  2.286 270) (length 0) (name "~" (effects (font (size 1.27 1.27)))) (number "1" (effects (font (size 1.27 1.27)))))
        (pin passive line (at 0 -2.286  90) (length 0) (name "~" (effects (font (size 1.27 1.27)))) (number "2" (effects (font (size 1.27 1.27)))))
      )
    )`;

// Both old (Spice_Primitive) and new (Sim.Device) properties included.
// Value="AC 1" is the critical fallback — ngspice reads it directly
// if Sim.Params has the known KiCad parsing bug.
const LIB_VSOURCE = `    (symbol "Simulation_SPICE:VSOURCE"
      (pin_numbers (hide yes)) (pin_names (offset 0) (hide yes))
      (exclude_from_sim no) (in_bom no) (on_board no)
      (property "Reference" "V" (at 1.27 1.905 0) (effects (font (size 1.27 1.27))))
      (property "Value" "AC 1" (at 1.27 -1.905 0) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Sim.Device" "V" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Sim.Type" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Sim.Params" "ac=1 dc=0" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Spice_Primitive" "V" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Spice_Netlist_Enabled" "Y" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "VSOURCE_0_1"
        (circle (center 0 0) (radius 1.27) (stroke (width 0.254) (type default)) (fill (type none)))
        (polyline (pts (xy 0 -1.27) (xy 0 -2.54)) (stroke (width 0) (type default)) (fill (type none)))
        (polyline (pts (xy 0  1.27) (xy 0  2.54)) (stroke (width 0) (type default)) (fill (type none)))
        (polyline (pts (xy -0.508  0.508) (xy 0.508  0.508)) (stroke (width 0) (type default)) (fill (type none)))
        (polyline (pts (xy 0       0.254) (xy 0       1.016)) (stroke (width 0) (type default)) (fill (type none)))
        (polyline (pts (xy -0.508 -0.508) (xy 0.508 -0.508)) (stroke (width 0) (type default)) (fill (type none)))
      )
      (symbol "VSOURCE_1_1"
        (pin passive line (at 0 -2.54  90) (length 0) (name "+" (effects (font (size 1.27 1.27)))) (number "P" (effects (font (size 1.27 1.27)))))
        (pin passive line (at 0  2.54 270) (length 0) (name "-" (effects (font (size 1.27 1.27)))) (number "N" (effects (font (size 1.27 1.27)))))
      )
    )`;

const LIB_LED = `    (symbol "Device:LED"
      (pin_numbers (hide yes)) (pin_names (offset 0))
      (exclude_from_sim no) (in_bom yes) (on_board yes)
      (property "Reference" "D" (at 0 2.54 90) (effects (font (size 1.27 1.27))))
      (property "Value" "LED" (at 0 0 90) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "~" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "LED_0_1"
        (polyline (pts (xy -1.27 -1.27) (xy -1.27 1.27) (xy 1.27 0) (xy -1.27 -1.27)) (stroke (width 0.254) (type default)) (fill (type none)))
        (polyline (pts (xy 1.27 -1.27) (xy 1.27 1.27)) (stroke (width 0.254) (type default)) (fill (type none)))
        (polyline (pts (xy -2.286 0) (xy -1.27 0)) (stroke (width 0) (type default)) (fill (type none)))
        (polyline (pts (xy  1.27 0) (xy  2.286 0)) (stroke (width 0) (type default)) (fill (type none)))
        (polyline (pts (xy 0.508 1.016) (xy 1.524 2.032) (xy 1.016 2.032)) (stroke (width 0) (type default)) (fill (type none)))
        (polyline (pts (xy 1.524 2.032) (xy 1.524 1.524)) (stroke (width 0) (type default)) (fill (type none)))
      )
      (symbol "LED_1_1"
        (pin passive line (at -2.286 0   0) (length 0) (name "A" (effects (font (size 1.27 1.27)))) (number "A" (effects (font (size 1.27 1.27)))))
        (pin passive line (at  2.286 0 180) (length 0) (name "K" (effects (font (size 1.27 1.27)))) (number "K" (effects (font (size 1.27 1.27)))))
      )
    )`;

const LIB_BJT = `    (symbol "Device:Q_NPN_BCE"
      (pin_names (offset 1.016))
      (exclude_from_sim no) (in_bom yes) (on_board yes)
      (property "Reference" "Q" (at 5.08 0 0) (effects (font (size 1.27 1.27))))
      (property "Value" "Q_NPN_BCE" (at 5.08 -2.54 0) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "~" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "Q_NPN_BCE_0_1"
        (polyline (pts (xy 0.508 0) (xy 0.508 -1.016) (xy 2.54 -2.54)) (stroke (width 0.254) (type default)) (fill (type none)))
        (polyline (pts (xy 0.508 0) (xy 0.508  1.016) (xy 2.54  2.54)) (stroke (width 0.254) (type default)) (fill (type none)))
        (polyline (pts (xy 2.54 2.54) (xy 2.54 1.778) (xy 1.016 1.016)) (stroke (width 0.254) (type default)) (fill (type filled)))
        (polyline (pts (xy -1.27 0) (xy 0.508 0)) (stroke (width 0.254) (type default)) (fill (type none)))
        (circle (center 1.27 0) (radius 2.794) (stroke (width 0.254) (type default)) (fill (type none)))
      )
      (symbol "Q_NPN_BCE_1_1"
        (pin input   line (at -3.81  0     0) (length 2.54) (name "B" (effects (font (size 1.27 1.27)))) (number "B" (effects (font (size 1.27 1.27)))))
        (pin passive line (at  3.81 -3.81 90) (length 1.27) (name "E" (effects (font (size 1.27 1.27)))) (number "E" (effects (font (size 1.27 1.27)))))
        (pin passive line (at  3.81  3.81 270) (length 1.27) (name "C" (effects (font (size 1.27 1.27)))) (number "C" (effects (font (size 1.27 1.27)))))
      )
    )`;

const LIB_GND = `    (symbol "power:GND"
      (pin_numbers (hide yes)) (pin_names (offset 0) (hide yes))
      (exclude_from_sim no) (in_bom yes) (on_board yes)
      (property "Reference" "#PWR" (at 0 -1.778 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Value" "GND" (at 0 -3.556 0) (effects (font (size 1.27 1.27))))
      (property "Footprint" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (property "Datasheet" "" (at 0 0 0) (effects (font (size 1.27 1.27)) (hide yes)))
      (symbol "GND_0_1"
        (polyline (pts (xy 0 0) (xy 0 -1.27)) (stroke (width 0) (type default)) (fill (type none)))
        (polyline (pts (xy 1.27 -1.27) (xy -1.27 -1.27)) (stroke (width 0) (type default)) (fill (type none)))
        (polyline (pts (xy 0.762 -1.778) (xy -0.762 -1.778)) (stroke (width 0) (type default)) (fill (type none)))
        (polyline (pts (xy 0.254 -2.286) (xy -0.254 -2.286)) (stroke (width 0) (type default)) (fill (type none)))
      )
      (symbol "GND_1_1"
        (pin power_in line (at 0 0 90) (length 0) (name "~" (effects (font (size 1.27 1.27)))) (number "1" (effects (font (size 1.27 1.27)))))
      )
    )`;

// ── instance helpers ─────────────────────────────────────────────────────────

function rInst(id, cx, cy, rot, ref, val) {
  const lx = rot === 90 ? cx : cx + 2.286;
  const ly = rot === 90 ? cy - 3.2 : cy;
  return `  (symbol (lib_id "Device:R") (at ${cx} ${cy} ${rot}) (unit 1)
    (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no) (uuid "${id}")
    (property "Reference" "${ref}" (at ${lx} ${ly} ${rot}) (effects (font (size 1.27 1.27))))
    (property "Value" "${val}" (at ${lx} ${ly + 2.54} ${rot}) (effects (font (size 1.27 1.27))))
    (property "Footprint" "" (at ${cx} ${cy} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Datasheet" "~" (at ${cx} ${cy} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (pin "1" (uuid "r1${id}")) (pin "2" (uuid "r2${id}"))
  )`;
}

function cInst(id, cx, cy, rot, ref, val) {
  return `  (symbol (lib_id "Device:C") (at ${cx} ${cy} ${rot}) (unit 1)
    (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no) (uuid "${id}")
    (property "Reference" "${ref}" (at ${cx + 1.524} ${cy - 1.524} ${rot}) (effects (font (size 1.27 1.27))))
    (property "Value" "${val}" (at ${cx + 1.524} ${cy + 1.524} ${rot}) (effects (font (size 1.27 1.27))))
    (property "Footprint" "" (at ${cx} ${cy} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Datasheet" "~" (at ${cx} ${cy} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (pin "1" (uuid "c1${id}")) (pin "2" (uuid "c2${id}"))
  )`;
}

// vsrcInst: place V1 body at (cx,cy). + pin at (cx,cy-2.54). − pin at (cx,cy+2.54).
// Caller must place GND directly at (cx,cy+2.54) AND a netlabel at (cx,cy-2.54).
function vsrcInst(id, cx, cy, ref, val, simParams) {
  return `  (symbol (lib_id "Simulation_SPICE:VSOURCE") (at ${cx} ${cy} 0) (unit 1)
    (exclude_from_sim no) (in_bom no) (on_board no) (dnp no) (uuid "${id}")
    (property "Reference" "${ref}" (at ${cx + 1.27} ${cy + 1.905} 0) (effects (font (size 1.27 1.27))))
    (property "Value" "${val}" (at ${cx + 1.27} ${cy - 1.905} 0) (effects (font (size 1.27 1.27))))
    (property "Footprint" "" (at ${cx} ${cy} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Datasheet" "" (at ${cx} ${cy} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Sim.Device" "V" (at ${cx} ${cy} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Sim.Type" "" (at ${cx} ${cy} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Sim.Params" "${simParams}" (at ${cx} ${cy} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Spice_Primitive" "V" (at ${cx} ${cy} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Spice_Netlist_Enabled" "Y" (at ${cx} ${cy} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (pin "P" (uuid "vp${id}")) (pin "N" (uuid "vn${id}"))
  )`;
}

function ledInst(id, cx, cy, ref, val) {
  return `  (symbol (lib_id "Device:LED") (at ${cx} ${cy} 0) (unit 1)
    (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no) (uuid "${id}")
    (property "Reference" "${ref}" (at ${cx} ${cy - 3.556} 0) (effects (font (size 1.27 1.27))))
    (property "Value" "${val}" (at ${cx} ${cy + 3.556} 0) (effects (font (size 1.27 1.27))))
    (property "Footprint" "" (at ${cx} ${cy} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Datasheet" "~" (at ${cx} ${cy} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (pin "A" (uuid "la${id}")) (pin "K" (uuid "lk${id}"))
  )`;
}

function bjtInst(id, cx, cy, ref, val) {
  return `  (symbol (lib_id "Device:Q_NPN_BCE") (at ${cx} ${cy} 0) (unit 1)
    (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no) (uuid "${id}")
    (property "Reference" "${ref}" (at ${cx + 5.08} ${cy} 0) (effects (font (size 1.27 1.27))))
    (property "Value" "${val}" (at ${cx + 5.08} ${cy - 2.54} 0) (effects (font (size 1.27 1.27))))
    (property "Footprint" "" (at ${cx} ${cy} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Datasheet" "~" (at ${cx} ${cy} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (pin "B" (uuid "qb${id}")) (pin "C" (uuid "qc${id}")) (pin "E" (uuid "qe${id}"))
  )`;
}

function gndInst(id, cx, cy) {
  return `  (symbol (lib_id "power:GND") (at ${cx} ${cy} 0) (unit 1)
    (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no) (uuid "${id}")
    (property "Reference" "#PWR" (at ${cx} ${cy + 1} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Value" "GND" (at ${cx} ${cy + 3.556} 0) (effects (font (size 1.27 1.27))))
    (property "Footprint" "" (at ${cx} ${cy} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (property "Datasheet" "" (at ${cx} ${cy} 0) (effects (font (size 1.27 1.27)) (hide yes)))
    (pin "1" (uuid "gp${id}"))
  )`;
}

function symInstances(entries) {
  return `  (symbol_instances\n${entries.map(([u, r, n, v]) =>
    `  (path "/${u}"\n    (reference "${r}") (unit ${n}) (value "${v}") (footprint "")\n  )`
  ).join('\n')}\n  )`;
}

function sch(uuid, libs, body, insts) {
  return `(kicad_sch (version 20231120) (generator "eeschema") (generator_version "8.0")
  (uuid "${uuid}")
  (paper "A4")
  (lib_symbols
${libs.join('\n')}
  )
${body.join('\n')}
${symInstances(insts)}
)`;
}

// ── NETLABEL CONNECTION STRATEGY ─────────────────────────────────────────────
//
// V1 body at (V1x, V1y).
// V1+ pin at (V1x, V1y-2.54) → netlabel "Vin" placed HERE (angle 90° = pointing up)
// V1− pin at (V1x, V1y+2.54) → GND symbol placed HERE (no wire, direct pin contact)
//
// At circuit input: netlabel "Vin" placed at component input pin position.
// Same label name = same net. KiCad connects them regardless of physical distance.
// This is 100% reliable — no wire alignment issues possible.

function rcLowpass() {
  // V1 at (60, 101.6): + at (60,99.06)  − at (60,104.14)
  // netlabel "Vin" at (60,99.06) AND at R1 pin2 (99.314,88.9)
  // R1(101.6,88.9 rot90): pin2(L)=99.314  pin1(R)=103.886
  // C1(127,101.6  rot 0): pin2(top)=99.314  pin1(bot)=103.886  at x=127
  const V1x=60, V1y=101.6, Vplus=[60,99.06], Vminus=[60,104.14];
  return sch("lp-aaaa-0000-0000-000000000001",
    [LIB_R, LIB_C, LIB_VSOURCE, LIB_GND],
    [
      // V1 source connections — netlabel at + pin, GND directly at − pin
      netlabel("lp-nv1", "Vin", Vplus[0],  Vplus[1],  90),
      netlabel("lp-nv2", "Vin", 99.314,    88.9,      180),  // at R1 pin2(L)

      // Circuit wiring (no source wire needed)
      w("lp-w1", 103.886, 88.9, 127,     88.9),   // R1 pin1 → junction
      w("lp-w2", 127,     88.9, 127,    99.314),  // junction → C1 pin2
      w("lp-w3", 127,   103.886, 127,   116),     // C1 pin1 → GND
      w("lp-w4", 127,     88.9, 144,    88.9),    // junction → Vout
      junc("lp-j1", 127, 88.9),
      netlabel("lp-vo", "Vout", 144, 88.9, 0),
      simText("lp-sim", ".ac dec 100 10 100k", 60, 125),

      vsrcInst("lp-v1", V1x, V1y, "V1", "AC 1", "ac=1 dc=0"),
      gndInst("lp-gv", Vminus[0], Vminus[1]),   // direct on V1−
      rInst("lp-r1", 101.6, 88.9, 90, "R1", "1k"),
      cInst("lp-c1", 127, 101.6, 0, "C1", "159nF"),
      gndInst("lp-gc", 127, 116),               // C1 bottom
    ],
    [
      ["lp-v1","V1",1,"AC 1"],["lp-r1","R1",1,"1k"],
      ["lp-c1","C1",1,"159nF"],["lp-gv","#PWR01",1,"GND"],["lp-gc","#PWR02",1,"GND"],
    ]
  );
}

function rcHighpass() {
  // C1(101.6,88.9 rot90): pin2(L)=99.314  pin1(R)=103.886
  // R1(127,101.6  rot 0): pin2(top)=99.314  pin1(bot)=103.886  at x=127
  const V1x=60, V1y=101.6, Vplus=[60,99.06], Vminus=[60,104.14];
  return sch("hp-bbbb-0000-0000-000000000002",
    [LIB_R, LIB_C, LIB_VSOURCE, LIB_GND],
    [
      netlabel("hp-nv1", "Vin", Vplus[0], Vplus[1], 90),
      netlabel("hp-nv2", "Vin", 99.314,  88.9,     180),   // at C1 pin2(L)

      w("hp-w1", 103.886, 88.9, 127,     88.9),
      w("hp-w2", 127,     88.9, 127,    99.314),
      w("hp-w3", 127,   103.886, 127,   116),
      w("hp-w4", 127,     88.9, 144,    88.9),
      junc("hp-j1", 127, 88.9),
      netlabel("hp-vo", "Vout", 144, 88.9, 0),
      simText("hp-sim", ".ac dec 100 10 100k", 60, 125),

      vsrcInst("hp-v1", V1x, V1y, "V1", "AC 1", "ac=1 dc=0"),
      gndInst("hp-gv", Vminus[0], Vminus[1]),
      cInst("hp-c1", 101.6, 88.9, 90, "C1", "318nF"),
      rInst("hp-r1", 127, 101.6, 0, "R1", "1k"),
      gndInst("hp-gr", 127, 116),
    ],
    [
      ["hp-v1","V1",1,"AC 1"],["hp-c1","C1",1,"318nF"],
      ["hp-r1","R1",1,"1k"],["hp-gv","#PWR01",1,"GND"],["hp-gr","#PWR02",1,"GND"],
    ]
  );
}

function voltageDivider() {
  // V1 at (60,95): + at (60,92.46)  − at (60,97.54)
  // R1(101.6,88.9 rot0): pin2(top)=(101.6,86.614)  pin1(bot)=(101.6,91.186)
  // R2(101.6,105.6 rot0): pin2(top)=(101.6,103.314) pin1(bot)=(101.6,107.886)
  // Junction (Vout) at (101.6,97.25) between R1-bot and R2-top
  const V1x=60, V1y=95, Vplus=[60,92.46], Vminus=[60,97.54];
  return sch("vd-cccc-0000-0000-000000000003",
    [LIB_R, LIB_VSOURCE, LIB_GND],
    [
      netlabel("vd-nv1", "V12", Vplus[0],  Vplus[1],  90),
      netlabel("vd-nv2", "V12", 101.6,     86.614,    90),  // at R1 pin2 top

      w("vd-w1", 101.6, 91.186, 101.6, 103.314),  // R1 bot → R2 top
      w("vd-w2", 101.6, 107.886, 101.6, 120),     // R2 bot → GND
      w("vd-w3", 101.6, 97.25,  122,   97.25),    // junction → Vout
      junc("vd-j1", 101.6, 97.25),
      netlabel("vd-vo", "Vout_5V", 122, 97.25, 0),
      simText("vd-sim", ".op", 60, 130),

      vsrcInst("vd-v1", V1x, V1y, "V1", "DC 12", "dc=12 ac=0"),
      gndInst("vd-gv", Vminus[0], Vminus[1]),
      rInst("vd-r1", 101.6, 88.9,  0, "R1", "1.4k"),
      rInst("vd-r2", 101.6, 105.6, 0, "R2", "1k"),
      gndInst("vd-gr", 101.6, 120),
    ],
    [
      ["vd-v1","V1",1,"DC 12"],["vd-r1","R1",1,"1.4k"],
      ["vd-r2","R2",1,"1k"],["vd-gv","#PWR01",1,"GND"],["vd-gr","#PWR02",1,"GND"],
    ]
  );
}

function ledLimiter() {
  // V1 at (60,95): + at (60,92.46) − at (60,97.54)
  // R1(99,88.9 rot90): pin2(L)=96.714  pin1(R)=101.286
  // D1(118,88.9 rot0): A(L)=115.714    K(R)=120.286
  const V1x=60, V1y=95, Vplus=[60,92.46], Vminus=[60,97.54];
  return sch("ll-dddd-0000-0000-000000000004",
    [LIB_R, LIB_LED, LIB_VSOURCE, LIB_GND],
    [
      netlabel("ll-nv1", "V5", Vplus[0], Vplus[1],  90),
      netlabel("ll-nv2", "V5", 96.714,  88.9,      180),  // at R1 pin2(L)

      w("ll-w1", 101.286, 88.9, 115.714, 88.9),  // R1 → D1 anode
      w("ll-w2", 120.286, 88.9, 133,     88.9),  // D1 cathode → GND
      simText("ll-sim", ".op", 60, 120),

      vsrcInst("ll-v1", V1x, V1y, "V1", "DC 5", "dc=5 ac=0"),
      gndInst("ll-gv", Vminus[0], Vminus[1]),
      rInst("ll-r1", 99, 88.9, 90, "R1", "160"),
      ledInst("ll-d1", 118, 88.9, "D1", "LED_Vf1.8V"),
      gndInst("ll-gd", 133, 88.9),
    ],
    [
      ["ll-v1","V1",1,"DC 5"],["ll-r1","R1",1,"160"],
      ["ll-d1","D1",1,"LED_Vf1.8V"],["ll-gv","#PWR01",1,"GND"],["ll-gd","#PWR02",1,"GND"],
    ]
  );
}

function commonEmitter() {
  // Q1(127,101.6): B free=(120.65,101.6)  C free=(130.81,106.68)  E free=(130.81,96.52)
  // RC(130.81,84 rot0): pin2(top)=81.714  pin1(bot)=86.286 → pin1 down to collector
  // RE(130.81,109 rot0): pin2(top)=106.714 pin1(bot)=111.286
  // R1(101.6,85 rot0): pin2(top)=82.714 pin1(bot)=87.286
  // R2(101.6,101.6 rot0): pin2(top)=99.314 pin1(bot)=103.886
  // C1(111,101.6 rot90): pin2(L)=108.714 pin1(R)=113.286

  const Bx=120.65, By=101.6;
  const Cx=130.81, Cy=106.68;
  const Ex=130.81, Ey=96.52;

  return sch("ce-eeee-0000-0000-000000000005",
    [LIB_R, LIB_C, LIB_BJT, LIB_VSOURCE, LIB_GND],
    [
      // VCC1: V1 at (130.81,75): + at (130.81,72.46) − at (130.81,77.54)
      // netlabel "VCC12" at V1+ and at RC pin2(top)
      netlabel("ce-vcc1a", "VCC12", 130.81, 72.46, 90),
      netlabel("ce-vcc1b", "VCC12", 130.81, 81.714, 90),   // RC pin2 top

      // VCC2: V2 at (101.6,72): + at (101.6,69.46) − at (101.6,74.54)
      netlabel("ce-vcc2a", "VCC12", 101.6, 69.46, 90),
      netlabel("ce-vcc2b", "VCC12", 101.6, 82.714, 90),    // R1 pin2 top

      // Collector chain: RC pin1(bot=86.286) → wire → collector(130.81,106.68)
      w("ce-w1", Cx, 86.286, Cx, Cy),
      // Vout from collector
      w("ce-w2", Cx, Cy, Cx+12, Cy),
      netlabel("ce-vout", "Vout_col", Cx+12, Cy, 0),

      // Emitter → RE → GND
      w("ce-w3", Ex, Ey, 130.81, 106.714),   // emitter to RE pin2 top
      w("ce-w4", 130.81, 111.286, 130.81, 122),  // RE pin1 bot to GND

      // Bias divider: R1 bot → junc → R2 top
      w("ce-w5", 101.6, 87.286, 101.6, 95.5),   // R1 bot → junc
      w("ce-w6", 101.6, 95.5,  101.6, 99.314),  // junc → R2 top
      w("ce-w7", 101.6, 103.886, 101.6, 116),   // R2 bot → GND
      junc("ce-j1", 101.6, 95.5),

      // Base: bias junc → C1 → Q1 base
      w("ce-w8",  101.6, 95.5,  101.6, 101.6), // junc down to C1 y-level
      w("ce-w9",  101.6, 101.6, 108.714, 101.6), // to C1 pin2(L)
      w("ce-w10", 113.286, 101.6, Bx, By),       // C1 pin1(R) → base

      simText("ce-sim", ".tran 10u 5m", 60, 135),

      // V1 (VCC collector side)
      vsrcInst("ce-v1", 130.81, 75, "V1", "DC 12", "dc=12 ac=0"),
      gndInst("ce-gv1", 130.81, 77.54),

      // V2 (VCC bias side)
      vsrcInst("ce-v2", 101.6, 72, "V2", "DC 12", "dc=12 ac=0"),
      gndInst("ce-gv2", 101.6, 74.54),

      rInst("ce-rc", 130.81, 84,    0, "RC", "10k"),
      rInst("ce-re", 130.81, 109,   0, "RE", "500"),
      rInst("ce-r1", 101.6,  85,    0, "R1", "100k"),
      rInst("ce-r2", 101.6,  101.6, 0, "R2", "20k"),
      cInst("ce-c1", 111,    101.6, 90, "C1", "10u"),
      bjtInst("ce-q1", 127, 101.6, "Q1", "BC547"),
      gndInst("ce-gr", 130.81, 122),
      gndInst("ce-gb", 101.6, 116),
    ],
    [
      ["ce-v1","V1",1,"DC 12"],["ce-v2","V2",1,"DC 12"],
      ["ce-rc","RC",1,"10k"],["ce-re","RE",1,"500"],
      ["ce-r1","R1",1,"100k"],["ce-r2","R2",1,"20k"],
      ["ce-c1","C1",1,"10u"],["ce-q1","Q1",1,"BC547"],
      ["ce-gv1","#PWR01",1,"GND"],["ce-gv2","#PWR02",1,"GND"],
      ["ce-gr","#PWR03",1,"GND"],["ce-gb","#PWR04",1,"GND"],
    ]
  );
}

export function generateKicadSch(circuit) {
  switch (circuit.id) {
    case "rc_lowpass":      return rcLowpass();
    case "rc_highpass":     return rcHighpass();
    case "voltage_divider": return voltageDivider();
    case "led_limiter":     return ledLimiter();
    case "common_emitter":  return commonEmitter();
    default: return "";
  }
}
