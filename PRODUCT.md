# AutoCDA

## Register

product

## Product purpose

AutoCDA turns a plain-English description of an analog circuit into a buyable, simulator-verified design. The user types "low-pass filter at 1 kHz"; AutoCDA picks real E-series parts, runs the design through an in-browser SPICE engine (ngspice-wasm), reports the honest measured-versus-target error, and shows the schematic, frequency or transient response, and a live editable simulator.

The core promise is trust: every number shown is either derived from a stated design equation or measured by a real simulator, and the interface never claims a verification it did not run.

## Users

Electronics engineers, EE students, and serious hardware hobbyists. They are fluent in schematics, component values, and SPICE. They are impatient with toy tools and skeptical of anything that hides its work. They compare AutoCDA against bench tools and against writing the netlist themselves, so the bar is professional precision, not novelty.

## Brand and tone

Calm, precise, confident. The voice of a senior engineer who explains clearly and never oversells. Plain words over jargon in the primary surface; exact technical terms where an engineer expects them (netlist, E24, cutoff, gain). No hype, no exclamation, no decorative emoji. Numbers are first-class citizens and always readable.

## Strategic principles

- Show the work. The refine trace, the netlist, and the measured error are features, not clutter to hide.
- Honest by construction. Analytical results are labeled analytical; SPICE-verified results say so and show the error.
- One task at a time. Describe, confirm the spec, then read a calm result. Complexity is available on demand, never forced.
- The tool disappears. Familiar, predictable patterns (top bar, sidebar conversation, tabs) over invented affordances.

## Anti-references

- The "hacker terminal" look: pure-black background, neon-green monospace everywhere, fake status pills. Reads as a toy, not a tool.
- SaaS hero-metric dashboards with giant gradient numbers and no substance.
- Anything that decorates with emoji or animates for spectacle.
