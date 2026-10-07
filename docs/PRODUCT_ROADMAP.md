# AutoCDA — Product Roadmap (what to build next)

> Forward-looking product roadmap. The build-order roadmap for the original engine
> (Phases 0–5) lives in [docs/ROADMAP.md](ROADMAP.md); this doc picks up from "the
> product is mostly built" and lays out how it gets **robust, broad, and the default
> verification layer** people open before they build or buy. Written 2026-10-07.

---

## North star

**AutoCDA is the verification layer for analog hardware.** Anyone with a circuit
*intent* — a student, a maker, a prototyper, or an AI agent — opens it, types what
they want in plain English, and gets a **real-SPICE-verified, buyable design in
seconds**, *before* they commit to building, laying out, or buying anything.

The one-line test for every feature below: **does it help someone trust a design
before they spend money or time on it?** If yes, it's on-mission. If it's just
generation or decoration, it's not.

---

## The wedge (what only we do)

- **Verification, not generation.** A raw LLM guesses component values and is
  confidently wrong. AutoCDA *proves* them in ngspice and reports the honest
  measured-vs-target error. Trust is the product.
- **Buyable by construction.** Every value is snapped to a real E-series part, and
  the design lands as a BOM you can actually order — at the cheapest price across
  sellers.
- **Deterministic + reproducible.** Same intent → same verified result. No account,
  no black box, runs in the browser. AI only at the edges (parse intent in, explain
  out).

Everything on this roadmap widens that wedge in one of three directions:
**breadth** (what can be described), **depth** (how well it's verified), and
**sourcing** (how cheaply it can be bought).

---

## Where we are (done — the foundation)

- 19 SPICE-verified circuit types; NL parser (regex fast-path + optional LLM); typed
  `CircuitSpec` confirm-before-run; E-series snapping; deterministic design→snap→
  simulate→verify→refine loop; honest measured error.
- Composition ("build a chain"), netlist import, Monte-Carlo yield, multi-objective
  optimization, multi-agent orchestration.
- BOM + CSV export; multi-seller price compare (Mouser live via pricing proxy +
  static catalog fallback); KiCad / EasyEDA / Falstad exports.
- Shareable-URL + localStorage design persistence (no account).
- Verification **HTTP API** (deployed on Render) for external/AI callers; 90+ tests.
- Pro tier built but **currently switched OFF** (`src/pro/proConfig.js`) — revisit
  when the free product has traction.

---

## Theme A — Breadth: toward "any circuit"

*The #1 risk named in BUSINESS.md: 19 fixed topologies ≠ "any circuit." This is the
key build for "the tool you always open."*

- **A1. More building blocks.** Add the next-most-requested textbook types: active
  filters (multiple-feedback, state-variable), instrumentation amp, current mirror,
  push-pull output, voltage reference, RC/LC tank, comparator with hysteresis,
  precision rectifier, 555-style timing. Each with its own schematic + verified loop.
- **A2. Composition depth.** The chain builder exists — extend it: branching (not
  just series), impedance-matching checks between stages, and per-stage vs end-to-end
  error reporting. "Any circuit" largely = verified blocks + good composition.
- **A3. LLM topology proposal → verify.** For intents with no closed-form template,
  let the LLM *propose* a topology, then run it through the **same deterministic
  verify loop**. The LLM never gets the final word — the simulator does. This is the
  honest path to open-ended coverage without sacrificing trust.
- **A4. Parametric search intent.** "Cheapest low-pass under 2% error at 1 kHz" or
  "lowest-power divider" — turn the optimizer into a first-class search over intent,
  not just a Pro panel.

## Theme B — Verification depth: prove more, prove harder

*Today two types are analytical-only and tolerance has a floor. Close those.*

- **B1. Transient + FFT measurement.** Unlocks the honest verification of
  **oscillators** (frequency/amplitude from zero-cross/FFT) and **zener/shunt
  regulators** (load/line regulation from a transient sweep). Removes the two
  "analytical-only" asterisks in FEATURES.md.
- **B2. Richer measured metrics.** THD, PSRR, phase margin / stability, output
  impedance, slew-rate, settling time, noise. These are exactly the numbers a pro
  checks before trusting a block — measuring them *is* the moat.
- **B3. Sub-1% via part networks.** Series/parallel R (and C) synthesis so tolerances
  tighter than a single standard part are reachable, with the honest trade (cost,
  part count) shown.
- **B4. Corner & environment analysis.** Temperature, supply, and process corners on
  top of the existing Monte-Carlo — "verified across conditions," not just nominal.
- **B5. Reproducibility stamp.** Every result carries engine version + netlist hash
  so a verified design is auditable and re-runnable. Trust you can cite.

## Theme C — Sourcing & BOM: the "cheapest buyable" engine

*Your stated vision: attach every seller's API, build a BOM that links each part at
its cheapest price across all of them. This is the design→buy bridge.*

- **C1. Multi-seller live pricing.** Beyond Mouser (already proxied): add
  **Digi-Key, LCSC, element14/Newark** product APIs behind the existing
  `buildBOM` / pricing-proxy interface. Keys stay **server-side** in the proxy, never
  in the bundle (same pattern as `MOUSER_API_KEY`).
- **C2. Cheapest-across-sellers BOM.** For each part, query all configured sellers,
  rank offers cheapest-first, and build a BOM that links every line to its lowest
  landed price — neutral, multi-seller, no single-distributor bias.
- **C3. Stock, MOQ & lead-time aware.** A cheap part that's out of stock isn't cheap.
  Factor availability, minimum order qty, and lead time into the "best buy" pick.
- **C4. Substitutes.** When the ideal part is unavailable/expensive, suggest a
  verified equivalent (same value/tolerance/footprint) and re-verify automatically.
- **C5. India landed-cost.** The India-specific killer feature from BUSINESS.md:
  part + customs duty + GST + shipping + forex → true ₹-delivered cost, local vs
  import. Nobody else shows this.
- **C6. One-click cart / BOM upload.** Export straight into each distributor's BOM
  importer so "design → buy" is one hop. (Affiliate tagging optional, server-side,
  per AFFILIATE.md — a thin stream, not the point.)

## Theme D — The Verification API as a product (the truth layer)

*BUSINESS.md's #1 wedge by leverage: be the SPICE-verified endpoint any AI/tool calls.*

- **D1. MCP server.** ✅ *shipped* — `server/mcpServer.mjs` (`npm run mcp`): a stdio
  JSON-RPC MCP server exposing `verify_circuit`, `parse_prompt`, `compose_circuit`,
  and `list_circuit_types` so any MCP agent (Claude Desktop/Code, Cursor, …) can
  SPICE-verify a circuit mid-reasoning. Runs in-process (ngspice, no network, no cold
  start); the model proposes, the simulator decides. Shares one core
  (`server/apiCore.mjs`) with the HTTP API so a verify over MCP and over HTTP agree —
  "the circuit truth-layer for AI," first-class. Tool calls are serialized (the wasm
  engine is non-reentrant).
- **D2. Warm + reliable.** ✅ *shipped* — self keep-warm pinger (`KEEP_WARM_MS` /
  `KEEP_WARM_URL`) defeats idle spin-down on Render/HF for real callers; durable per-key
  usage counts (`USAGE_FILE`) now persist **only keyed callers** so the file stays
  bounded and keyed limits survive restarts (anon-IP counts stay in memory).
- **D3. Richer API responses.** Return the new metrics (Theme B) + sourcing (Theme C)
  so one call gives verified design **and** buyable, priced BOM.
- **D4. Great docs + examples + SDKs.** The API is developer-led growth; the docs page
  is the funnel. A couple of copy-paste SDK snippets (JS/Python) and a live playground.

## Theme E — Trust & UX robustness (the tool "disappears")

- **E1. Portable designs.** The URL-share + localStorage model already lets users keep
  and move their work; add explicit **download/upload a design file** (`.autocda.json`)
  so they can save to device and resume later — no account, by design.
- **E2. Confidence & assumptions front-and-center.** Keep surfacing every defaulted
  value and parser confidence; never hide a guess. This is the brand (PRODUCT.md).
- **E3. Offline-first.** The app already runs with no backend; keep every core path
  (design, verify, BOM fallback) working with zero network.
- **E4. Accessibility & performance.** Trim the 5.9 MB bundle (code-split the wasm
  engine / recharts), keep WCAG-AA, reduced-motion. A fast, calm tool earns daily use.

## Theme F — Monetization (deferred, not forgotten)

*Switched off now to focus on a working, broadly-useful free product. Turn on when the
free tool retains users.*

- **F1. Re-enable Pro** (`PRO_ENABLED = true`) with offline signed keys (already built)
  once there's demand — gate the power tools (optimization, private history, exports,
  advanced sourcing), keep describe→verify→BOM free forever.
- **F2. Payment** when ready: start with manual UPI + key issuance (MVP), graduate to
  Razorpay/Stripe payment links + a webhook that auto-mints keys.
- **F3. API usage tiers** and **education site licenses** per BUSINESS.md — the
  higher-leverage revenue once the wedge is proven.

## Theme G — Scale (later, needs team/capital)

*From ROADMAP.md Phase 5 — only when the product's growth demands it.*

- **G1. Server-side ngspice** for large circuits, big Monte-Carlo, corner sweeps.
- **G2. PCB layout** (placement/routing) with a **quantum-inspired annealer**
  (simulated/digital annealing on classical hardware) as the optimization backend —
  the honest "quantum angle," relevant only at the layout stage.
- **G3. BOM lifecycle / compliance** (EOL, RoHS/REACH) for teams — enterprise later.

---

## Suggested near-term order (robustness first, mission-aligned)

1. **C1 + C2** — multi-seller live pricing + cheapest-across-sellers BOM. Directly
   delivers the design→buy vision and is mostly plumbing behind an existing interface.
2. **B1** — transient/FFT measurement. Removes the two analytical-only asterisks;
   makes "everything is really verified" true.
3. **A1 + A3** ✅ *shipped* — added MFB low-pass, 3-op-amp instrumentation amp,
   and BJT current mirror (each with its own SPICE descriptor + verify loop), plus
   `topologyAgent` (`src/agents/topologyAgent.js`): an LLM proposes a topology —
   a built-in type or a raw parametric netlist — and it is **accepted only if the
   deterministic verify path grades it within tolerance** (the simulator, not the
   model, decides). Attacks the breadth risk that gates "the tool you always open."
4. **D1 + D2** ✅ *shipped* — MCP server (`server/mcpServer.mjs`, `npm run mcp`) +
   warm/reliable API (keep-warm pinger, keyed-only durable usage). Opens the
   highest-leverage wedge (AI truth-layer) with low marginal cost.
5. **E1 + E4** ✅ *shipped* — portable `.autocda.json` design files
   (download/open, `src/share/designFile.js`) + bundle trim: the ngspice-wasm
   engine and recharts now load as on-demand async chunks, dropping the main
   bundle from ~5.9 MB to **121 kB gzip** (the engine/charts fetch only when a
   user runs a sim or opens a chart). Reduced-motion + WCAG-AA already held.

> Let real usage reorder this. The discipline from GO_TO_MARKET.md still holds: ship
> the free tool, get it in front of people, and let what they actually ask for — not
> this list — decide what gets built next.
