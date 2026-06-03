"""
AutoCDA — Schemdraw schematic generator
Generates 5 circuit SVGs into public/schematics/
Run: pip install schemdraw matplotlib
"""

import os
import sys

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "public", "schematics")
os.makedirs(OUTPUT_DIR, exist_ok=True)

try:
    import schemdraw
    import schemdraw.elements as elm
    HAS_SCHEMDRAW = True
except ImportError:
    HAS_SCHEMDRAW = False
    print("[WARN] schemdraw not found. Run: pip install schemdraw matplotlib")
    print("[WARN] Falling back to inline SVG in React components.")
    sys.exit(0)

import matplotlib
matplotlib.use("Agg")

STYLE = {
    "color": "#79c0ff",
    "lw": 2,
}

def save(d, name):
    path = os.path.join(OUTPUT_DIR, name)
    d.save(path, transparent=True, dpi=150)
    print(f"[OK] {name}")

# 1. RC Low-Pass Filter
with schemdraw.Drawing(fontsize=11, **STYLE) as d:
    d.config(bgcolor="none")
    V = d.add(elm.SourceV().up().label("Vin", loc="left"))
    d.add(elm.Line().right(1))
    R = d.add(elm.Resistor().right().label("R1\n1kΩ", loc="top"))
    d.add(elm.Dot())
    C = d.add(elm.Capacitor().down().label("C1\n159nF", loc="right"))
    d.add(elm.Ground())
    d.add(elm.Line().right(1).at(R.end))
    d.add(elm.Dot(open=True).label("Vout", loc="right"))
    d.add(elm.Line().left(1).at(V.start))
    d.add(elm.Line().right().tox(C.end))
    save(d, "rc_lowpass.svg")

# 2. RC High-Pass Filter
with schemdraw.Drawing(fontsize=11, **STYLE) as d:
    d.config(bgcolor="none")
    V = d.add(elm.SourceV().up().label("Vin", loc="left"))
    d.add(elm.Line().right(1))
    C = d.add(elm.Capacitor().right().label("C1\n318nF", loc="top"))
    d.add(elm.Dot())
    R = d.add(elm.Resistor().down().label("R1\n1kΩ", loc="right"))
    d.add(elm.Ground())
    d.add(elm.Line().right(1).at(C.end))
    d.add(elm.Dot(open=True).label("Vout", loc="right"))
    d.add(elm.Line().left(1).at(V.start))
    d.add(elm.Line().right().tox(R.end))
    save(d, "rc_highpass.svg")

# 3. Voltage Divider
with schemdraw.Drawing(fontsize=11, **STYLE) as d:
    d.config(bgcolor="none")
    V = d.add(elm.SourceV().up().label("Vin\n12V", loc="left"))
    d.add(elm.Line().right(2))
    R1 = d.add(elm.Resistor().down().label("R1\n1.4kΩ", loc="right"))
    d.add(elm.Dot())
    R2 = d.add(elm.Resistor().down().label("R2\n1kΩ", loc="right"))
    d.add(elm.Ground())
    d.add(elm.Line().right(1.5).at(R1.end))
    d.add(elm.Dot(open=True).label("Vout\n5V", loc="right"))
    d.add(elm.Line().left(2).at(V.start))
    d.add(elm.Line().right().tox(R2.end))
    save(d, "voltage_divider.svg")

# 4. LED Current Limiter
with schemdraw.Drawing(fontsize=11, **STYLE) as d:
    d.config(bgcolor="none")
    V = d.add(elm.SourceV().up().label("5V", loc="left"))
    d.add(elm.Line().right(1))
    R = d.add(elm.Resistor().right().label("R1\n160Ω", loc="top"))
    LED = d.add(elm.LED().right().label("D1\nVf=1.8V", loc="top"))
    d.add(elm.Line().down().toy(V.start))
    d.add(elm.Ground())
    d.add(elm.Line().left().tox(V.start))
    save(d, "led_limiter.svg")

# 5. Common Emitter Amplifier
with schemdraw.Drawing(fontsize=11, **STYLE) as d:
    d.config(bgcolor="none")
    Q = d.add(elm.BjtNpn(circle=True).at((4, 3)).label("Q1\nBC547", loc="right"))
    # VCC and RC
    d.add(elm.Line().up(1).at(Q.collector))
    RC = d.add(elm.Resistor().up().label("RC\n10kΩ", loc="right"))
    d.add(elm.Vdd().label("VCC\n12V"))
    # RE emitter
    d.add(elm.Line().down(0.5).at(Q.emitter))
    RE = d.add(elm.Resistor().down().label("RE\n500Ω", loc="right"))
    d.add(elm.Ground())
    # Bias divider
    d.add(elm.Line().left(2).at(Q.base))
    base_node = d.add(elm.Dot())
    d.add(elm.Line().up(1))
    R1 = d.add(elm.Resistor().up().label("R1\n100kΩ", loc="right"))
    d.add(elm.Vdd().label("VCC"))
    d.add(elm.Line().down(1).at(base_node.start))
    R2 = d.add(elm.Resistor().down().label("R2\n20kΩ", loc="right"))
    d.add(elm.Ground())
    # Input coupling
    d.add(elm.Line().left(1).at(base_node.start))
    C1 = d.add(elm.Capacitor().left().label("C1\n10µF", loc="top"))
    d.add(elm.Dot(open=True).label("Vin", loc="left"))
    # Output
    d.add(elm.Line().right(1).at(Q.collector))
    d.add(elm.Dot(open=True).label("Vout", loc="right"))
    save(d, "common_emitter.svg")

print("\n[DONE] All 5 schematics generated.")
