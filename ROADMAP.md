# AutoCDA — Product Roadmap (prompt-driven, bootstrapped)

A living plan to take AutoCDA from "strong prototype" to a shippable, revenue-
earning product. Built to be **flexible** — every phase has a goal and a metric,
not a fixed spec, so you can swap in better ideas as you learn.

**How to use this doc:** each task has a **Prompt** block — paste it to a coding
agent (or me) to execute that step. Prompts are self-contained (reference real
files). Do one phase at a time; stop at each **Decision gate** and let the metric
decide whether to continue, double down, or pivot.

North star: *the tool an EE opens to go from idea → a verified, buyable circuit in
seconds.* Moat: **verification, not generation.** Motion: free-first, student-
first (India), monetize via API + Pro + sourcing affiliate + education.

---

## 0. Baseline — what's already built (pre-business)

The engineering is done to prototype grade. This is the foundation every phase
builds on.

**Design + verify engine**
- 19 circuit types, all SPICE-verified: RC low/high-pass, band-pass, Sallen-Key
  low/high-pass, 4th-order Butterworth low-pass, inverting/non-inverting/two-stage/
  summing/difference op-amps, integrator, differentiator, common-emitter, voltage
  divider, LED limiter, zener regulator, constant current source, RC oscillator.
- Real **ngspice (WebAssembly)** verification — runs in the browser **and** in
  Node (so a server-side API is possible).
- **Closed-loop reasoning agent**: propose → SPICE-grade → observe → re-propose.
  Deterministic secant proposer (no API key) or an optional LLM proposer. Precision
  ladder: coarse E-series → E96 resistor trim → joint two-component search →
  series/parallel resistor synthesis (sub-1%).
- E-series (E12/E24/E96) snapping + synthesis; honest measured-vs-target error.

**Natural language**
- Regex fast-path parser + optional LLM fallback; parses tolerance and E-series
  from the prompt; robust across all 19 types (39/39 varied phrasings).

**Outputs**
- Data-driven schematics (SVG rendered from the real, refined components).
- Exports: KiCad `.kicad_sch`, EasyEDA JSON, Falstad CircuitJS.
- BOM with a **multi-distributor price marketplace** (Mouser + Digi-Key proxy,
  cheapest-per-part, graceful catalog fallback).
- Monte-Carlo yield analysis.

**Productization**
- **Verification API** (`npm run verify-api`): `/api/health`, `/api/types`,
  `/api/parse`, `/api/verify`, `/api/compose`. Reuses the exact app code; ngspice
  server-side; no per-call AI cost.
- **Composition engine**: chains verified blocks into arbitrary multi-stage
  circuits, measured end to end.

**Quality + docs**
- 97 automated tests across 12 suites (run with no API key, no wasm).
- 525-case labelled benchmark + generator.
- Docs: README, FEATURES, DESIGN, PRODUCT, RESEARCH, PAPER_DRAFT, technical
  dossier, BUSINESS.
- Fixes along the way: common-emitter bias (was ~98% error), schematic honesty
  (data-driven, not stock numbers), Details-tab scroll, parser silent-wrong reads
  (commas/scientific/whitespace/op-amp/0V), constraint parsing.

**Honest gaps to close for "product-ready":** breadth beyond 19 (composition UI +
more types), daily-usable UX (iterate, save, share, import), deployment (it only
runs locally today), monetization wiring, and distribution.

---

## 1. Guiding principles (keep these when ideas change)

1. **Verification is the product.** Never ship an unverified number. If SPICE
   can't check it, label it analytical.
2. **Deterministic-first, LLM-optional.** Keep it free to run and reproducible.
3. **Student-first, India-first.** Lowest switching cost, biggest underserved pool.
4. **Free → retention → revenue.** Measure 7-day retention before building paywalls.
5. **One wedge at a time.** Ship, measure, then expand. Kill what doesn't retain.

---

## 2. Phase 1 — Make it trustworthy + usable daily  (goal: retention)

Metric: a student can design, trust, and come back. Target 7-day retention > 20%
on a small test cohort.

### 1.1 Graceful failure + edge-case UX
**Prompt:**
```
In AutoCDA, audit the UI failure paths. Read src/App.jsx. Handle: SPICE run
errors, unparseable prompts (confidence 0), unsupported requests, and empty/garbage
input — each should show a calm, specific message and never a blank screen or
console crash. Add an error boundary around the results area. Verify in the browser
with 10 bad prompts. Keep all 97 tests green; add a couple for the parse-failure
message path.
```

### 1.2 Conversational iteration (the "Claude-for-circuits" UX)
**Prompt:**
```
Add multi-turn design iteration to AutoCDA. After a result, let the user type
follow-ups like "sharpen the rolloff", "cut cost 20%", "lower the gain to 8",
"use E96", "tighter tolerance". Parse the follow-up into a delta on the current
spec (target/constraint change), re-run orchestrate() with SPICE grading, and show
before→after (old vs new measured value, error, parts, cost). Reuse the reasoning
loop in src/agents/orchestrator.js. Keep each change SPICE-verified. Test in the
browser across 5 edit types.
```

### 1.3 Save / share a design
**Prompt:**
```
Add save + shareable links to AutoCDA. Persist designs to localStorage (list +
reload) and encode a design (type, targets, constraints, components) into a URL
hash so a link reproduces it (reuse lz-string, already a dependency). Add a "Share"
button that copies the link and a "My designs" list. No backend. Test: design,
copy link, open in a fresh tab, confirm it rebuilds and re-verifies.
```

### 1.4 Bring-your-own circuit (meet pros where they are)
**Prompt:**
```
Add netlist import to AutoCDA. Let the user paste an ngspice netlist (or upload a
.cir/.net), run it through the existing runSpice (src/sim/spice.js), and show the
measured response + a plot — "verify any circuit", not just generated ones. Detect
the analysis type from the deck. Guard against malformed input. Add it as a new
input mode in src/App.jsx. Test with 3 pasted netlists.
```

### 1.5 Composition in the UI (breadth made visible)
**Prompt:**
```
Surface the composition engine (src/design/compose.js) in the AutoCDA UI. Let a
user build a signal chain by adding stages (pick type + target per stage), then
design+verify the whole chain with composeCircuit + verifyComposition, showing the
combined schematic/response, end-to-end measured value, and combined BOM. Add a
"Build a chain" mode. Verify in the browser with a 2-stage filter+amp chain.
```

**Decision gate 1:** put the result in front of ~20 EE students/makers. If 7-day
retention is weak, fix the design UX before anything else — do **not** proceed to
monetization. If it's strong, continue.

---

## 3. Phase 2 — Deploy + distribute  (goal: reachable by strangers)

Metric: anyone with a link can use the app and the API.

### 2.1 Host the web app
**Prompt:**
```
Prepare AutoCDA (create-react-app) for static hosting on Cloudflare Pages / Netlify
/ Vercel. Produce a production build, add SPA routing config, document env vars
(REACT_APP_PRICING_PROXY, REACT_APP_ANTHROPIC_KEY as optional), and confirm the
ngspice-wasm loads from the built bundle. Give me the exact deploy steps for one
host. Don't commit any secrets.
```

### 2.2 Host the verification API
**Prompt:**
```
Package the AutoCDA verification API (server/apiServer.mjs + server/loader.mjs) for
a small always-on Node host (Render / Railway / Fly.io / a VPS). Add a start
command, a health check, basic rate-limiting and a request-size cap, CORS to the
app origin, and a Dockerfile. Keep ngspice server-side. Give exact deploy steps and
a smoke-test curl. No secrets in the repo.
```

### 2.3 Public API docs + free tier + keys
**Prompt:**
```
Write public API docs for AutoCDA (endpoints, request/response examples, errors,
limits) as a docs page served by the app. Add a simple API-key check to
server/apiServer.mjs (env-configured keys, a free anonymous tier with a low rate
limit, higher limits for keyed users) and usage counting per key (in-memory or a
small file/db). Keep it dependency-light. Test the limits with curl.
```

### 2.4 Landing page that states the promise
**Prompt:**
```
Create a focused landing section for AutoCDA: one-line promise ("Describe a circuit,
get a SPICE-verified, buyable design in seconds"), a 20-second demo (GIF or live
embed), the 19 types, "verified by real ngspice" trust badge, and a single CTA to
try it. Match DESIGN.md's system. Mobile-first. No marketing fluff — show the
measured-error proof.
```

**Decision gate 2:** share the public link in 2–3 channels (see §6). Watch
sign-ups/day and retention. If people share it unprompted, you have pull.

---

## 4. Phase 3 — Monetize  (goal: first revenue)

Metric: first rupees from affiliate + first Pro subscriber + one college pilot.

### 3.1 BOM affiliate (cheapest build, first money)
**Prompt:**
```
Turn the AutoCDA BOM into revenue. For each marketplace offer (server/pricingProxy.js
+ src/design/distributorPricing.js), append the distributor's affiliate/referral
parameters to the product links, and add a "Buy" link per row in the BOM panel
(src/App.jsx BomPanel) and a "Buy full BOM" action. Document how to register for
Mouser/Digi-Key/LCSC affiliate programs and where the IDs go (server-side config,
never in the bundle). Keep the catalog fallback working.
```

### 3.2 India landed-cost (the India wedge)
**Prompt:**
```
Add landed-cost to AutoCDA's BOM for India. Extend server/pricingProxy.js with a
landed-cost calculator: part price + estimated customs duty + GST + shipping +
forex, per distributor, so the BOM shows true ₹-delivered cost and flags local
(Robu/Evelta) vs imported (LCSC/Mouser) after duties. Add an LCSC adapter and one
Indian-distributor adapter behind the same offers[] contract. Make duty/GST rates
config-driven. Show ₹ in the UI when an India mode is on. Unit-test the calculator.
```

### 3.3 Pro tier (gate the power features)
**Prompt:**
```
Add a Pro tier to AutoCDA. Keep core design+verify free. Gate behind Pro:
unlimited/multi-objective optimization, private saved designs + history, netlist
import, composition chains beyond N stages, and all exports. Add a lightweight auth
+ subscription (e.g. a hosted provider; for India use Razorpay/Stripe). Feature-flag
gating in the client, enforce server-side for the API. Document pricing tiers
(free / Pro ₹299–999/mo / API usage tiers).
```

### 3.4 Multi-objective optimization (a flagship Pro feature)
**Prompt:**
```
Extend AutoCDA's reasoning loop (src/agents/reasoningAgent.js) to optimize a
weighted objective over cost + measured error + power + yield, not just hit one
target. Add a cost/power estimate per candidate (from the BOM + simple models) and
let the loop trade them off; expose weights in the UI. Keep every candidate
SPICE-graded. Add tests with analytic models. Show the Pareto choice to the user.
```

### 3.5 Education pilot
**Prompt (not code — outreach):** Offer 3 engineering colleges a free semester
pilot (a class set of accounts + a lab-exercise pack generated from the 19 types).
Ask for feedback + a testimonial. Convert to a cheap annual site license.

**Decision gate 3:** if affiliate + one Pro sub + one college pilot land → it's a
business worth running. Reinvest in whichever channel converts best.

---

## 5. Phase 4 — Grow  (goal: compounding distribution)

Metric: organic traffic + API usage growth, month over month.

### 4.1 Reference-design library (content/SEO moat)
**Prompt:**
```
Generate a public reference-design library for AutoCDA: for common requests across
the 19 types (and composed chains), pre-generate verified designs with schematic,
measured error, BOM, and exports, each on its own shareable page with good SEO
(title, description, structured data). This is both content marketing and proof.
Build it as static pages from the design engine. List them in a browsable index.
```

### 4.2 Be the verify layer for other AI tools (API partnerships)
**Prompt (BD + a tiny SDK):**
```
Make it trivial for other AI/hardware tools to call AutoCDA's /api/verify. Write a
small JS/Python client snippet + a "verify this LLM circuit output" example, and a
one-page pitch: "ground your AI's circuit output in real SPICE." Publish the
snippets in the docs. Then list 10 AI-hardware / EDA tools to approach as design
partners.
```

### 4.3 PCB-fab quote compare (expand the sourcing)
**Prompt:**
```
Add PCB fab quote comparison to AutoCDA. From a design, estimate board specs and
query (or template) quotes from JLCPCB / PCBPower / PCBWay / Robu, showing cheapest
fab option alongside the component BOM. Use official APIs/affiliate feeds where
available; clearly label estimates. Same marketplace pattern as the parts proxy.
```

### 4.4 Community + templates
Discord/forum for users; let people publish their verified designs as templates
(feeds the reference library and SEO). Weekly "design challenge" for engagement.

### 4.5 Mobile / PWA
**Prompt:**
```
Make AutoCDA installable as a PWA and fully usable on a phone (students design on
mobile). Add a manifest + service worker (offline shell), audit the layout at
phone width, and ensure the Details tab + schematic are touch-friendly. Verify on a
mobile viewport.
```

---

## 6. How to sell + where to sell

**Motion: product-led growth (PLG).** The free tool is the top of funnel;
verification earns trust; Pro/affiliate/education monetize. No cold enterprise
sales early.

**Where — students & makers (retention engine, India-first):**
- IEEE student branches, college EE/robotics clubs, maker spaces, hackathons.
- WhatsApp/Telegram EE groups, college society channels.
- Instagram / YouTube Shorts: "design a filter in 10 seconds, SPICE-verified" demos.
- LinkedIn (India EE/embedded community is very active there).

**Where — global makers & engineers (credibility + traffic):**
- Reddit: r/AskElectronics, r/ECE, r/embedded, r/PrintedCircuitBoard, r/diyelectronics.
- Hacker News: "Show HN: AutoCDA — describe a circuit, get a SPICE-verified design".
- Product Hunt launch; Hackaday tip line; EEVblog forum; electronics StackExchange
  (be genuinely helpful, link sparingly).

**Where — developers (for the API):**
- Show HN / dev.to / Hashnode posts: "the SPICE-verified truth layer for AI circuit
  design." Direct outreach to AI-hardware/EDA startups as design partners.

**Where — education (recurring revenue):**
- Direct to EE department heads / lab instructors; offer a free pilot + lab pack.

**Pricing (starting point, iterate):**
- Free: core design + verify, public designs, basic exports.
- Pro: ₹299–999/mo (or $5–30) — multi-objective, private designs, import,
  composition, all exports.
- API: free anonymous tier (rate-limited) → usage tiers for volume.
- Education: per-college annual site license.
- Affiliate: passive, on every BOM.

**Launch sequence (first 2 weeks after deploy):** 1) soft-share in 2 India student
channels + r/AskElectronics, fix feedback; 2) Show HN + Product Hunt once stable;
3) publish 5 reference-design pages for SEO; 4) DM 10 AI-hardware tools re: the API.

---

## 7. Flexibility + how to think about growing better

- **Re-rank every phase monthly** against one question: *what most increases
  trusted weekly usage?* If a later idea beats the current task on that, swap it in.
- **Kill fast:** any feature that doesn't lift retention or revenue in a month gets
  cut. Breadth (more types/composition) only matters if users hit the ceiling —
  watch for "unsupported" requests as the signal to expand.
- **Let usage pick the wedge:** if students love it but don't pay, lean education +
  API; if pros adopt, lean Pro + landed-cost; if other tools call the API, lean
  API-as-product.
- **Instrument everything** (privacy-light): prompts tried, types requested,
  unsupported requests, retention, API calls. Data decides the roadmap.
- **Stay deterministic + verified** even as you add AI — that's the durable moat.

---

## 8. Immediate next actions (do these first)
1. Phase 1.1 (graceful failure) + 1.2 (conversational iteration) — makes it feel
   like a product.
2. Phase 2.1 + 2.2 (deploy app + API) — so strangers can use it.
3. Phase 3.1 (affiliate links) — first revenue for near-zero effort.
4. Put the link in front of 20 students; measure 7-day retention; let the gate
   decide what's next.
