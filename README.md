# AutoCDA v1.0 — Automatic Circuit Design Assistant

## How to Run

1. Double-click `run.bat`
2. Wait — it checks Node.js, generates schematics, installs packages
3. Browser opens automatically at http://localhost:3000
4. Click any prompt button on the left to generate a circuit

## Requirements

- **Node.js** (required): https://nodejs.org
- **Python + Schemdraw** (optional, for best schematics): `pip install schemdraw matplotlib`

## Supported Circuits (Demo)

| Circuit | Key Parameter |
|---------|---------------|
| RC Low-Pass Filter | fc = 1 kHz |
| RC High-Pass Filter | fc = 500 Hz |
| Voltage Divider | 12V → 5V |
| LED Current Limiter | 5V, 20mA |
| Common Emitter Amplifier | Gain = 20 |

## Notes

- No internet required after `npm install`
- All simulation results are pre-verified
- **Export SPICE Netlist** button downloads the netlist for any circuit
- If Python/Schemdraw is not available, accurate inline SVG schematics are used automatically
