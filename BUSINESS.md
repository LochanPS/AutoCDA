# AutoCDA — Business Plan (bootstrapped, revenue-first)

No investors. Goal: make money and run a sustainable business. This doc is the
plan of record — vision, moat, wedges, money math, India angle, risks, and a
90-day plan to first revenue.

---

## 1. One-line vision

**The tool electronics/electrical engineers open to go from an idea to a
*verified, buyable* circuit in seconds** — the SPICE-verified trust layer that a
raw LLM (ChatGPT/Claude) cannot give.

Not "an AI that writes circuits" (general LLMs already do that, and are confidently
wrong). The product is **verification-in-the-loop**: every result is graded by a
real simulator, uses real buyable parts, and shows its honest error.

---

## 2. The moat — verification, not generation

- A general LLM hallucinates component values; AutoCDA **proves** them in ngspice
  and reports measured-vs-target error.
- Deterministic by construction: closed-form design + E-series parts + SPICE +
  a feedback loop (secant solver + resistor synthesis). **No LLM required** for
  the known circuit library — so it's free to run, reproducible, and trustworthy.
- LLM is optional and confined to (a) parsing messy English, (b) proposing novel
  topologies the loop then verifies.
- Trust (SPICE proof, netlist, buyable BOM) is what pros need and what makes the
  free tool worth returning to. **Retention = the moat.**

---

## 3. Wedges (what we actually sell / where money comes from)

Ranked by leverage for a bootstrapped team:

1. **Verification API** — be the "SPICE-verified truth layer" any AI/tool calls:
   LLM designs → POST to AutoCDA → gets back verified components, measured error,
   netlist, BOM. Metered usage (Stripe-style). Compounds as LLM-for-hardware
   grows. Low marginal cost (ngspice runs server-side, no per-call AI cost).
2. **Freemium Pro** — free design + verify; pay for unlimited sims, multi-
   objective optimization, private designs, team workspace, exports. ~₹299–999/mo
   (or $5–30) per seat; India-priced, volume-driven.
3. **Sourcing affiliate** — distributors/PCB fabs pay 2–10% referral on the
   design→BOM→buy flow. Zero inventory, zero fulfillment. Monetizes existing
   behavior.
4. **Education** — site licenses to engineering colleges (India has ~4,000). Cheap
   per-seat, sticky, and students become pros who default to the tool.
5. **Enterprise later** — BOM lifecycle / obsolescence / compliance (EOL, RoHS/
   REACH) SaaS; teams pay real money for this.

Deliberately **not** doing now: open two-sided marketplace (counterfeit/trust +
capital heavy), quantum parts (no market), raw global price-compare (Octopart owns
it). We get sourcing "for free" as the step after design and skip catalog breadth.

---

## 4. Money math (rough, honest, bootstrapped)

Assumptions are illustrative — validate with real numbers.

- **Affiliate:** if 1,000 active users/mo each source a ₹500 BOM and 20% buy
  through our links at a 5% referral → 1000·0.2·₹500·0.05 = **₹5,000/mo**. Scales
  linearly with active users; meaningful only at 10k–100k users.
- **Pro:** 500 paying seats × ₹499/mo = **₹2.5L/mo (~$3k)**. 5,000 seats ≈ ₹25L/mo.
  Conversion from free is the lever (1–3% typical).
- **API:** usage-based; 1M verifications/mo at ₹0.10 each = **₹1L/mo**. Grows with
  AI-hardware adoption; near-zero marginal cost.
- **Education:** 50 colleges × ₹50k/yr = **₹25L/yr** recurring.

None of these is a quick win alone; **stacked**, a focused solo/small team can
reach ramen-profitable on Pro + affiliate + a few college deals within ~12–18
months **if** retention is real. This is a build-audience-then-monetize business.

---

## 5. Comparables (the category makes money)

- **Altium** → acquired by Renesas **~$5.9B** (2024); owns Octopart (sourcing) +
  Upverter (design).
- **Cadence / Synopsys** — EDA giants, tens of $B; **verification** is a core
  revenue category.
- AI-EDA startups on this exact premise (VC-funded, pre-profit): **Flux.ai**,
  **CELUS**, **Quilter**, **JITX**, **SnapEDA**.

We are not inventing a category nobody funds; we're bootstrapping a differentiated
slice (verification-grounding + India + landed cost) of a proven one.

---

## 6. India angle

- PLI / "Make in India" / ESDM push; local PCB/PCBA capacity growing.
- Huge EE/embedded talent + student/maker base priced out of Altium.
- Unserved pains no incumbent solves: fragmented local distributors, **opaque
  landed cost** (part + customs duty + GST + shipping + forex), lead times,
  counterfeits.
- **Landed-cost transparency** (₹-delivered, local-vs-import) is the India-specific
  killer feature on top of the global design tool.

---

## 7. Adoption flywheel

```
free + web + instant
   → students / makers (India) adopt
   → verification earns daily trust (retention)
   → pros adopt for quick first-cut design
   → design feeds sourcing (affiliate revenue)
   → community reference designs (content moat / SEO)
   → verification API embeds everywhere (compounding usage)
```

Mirrors how AI coding tools spread: free, instant, trustworthy, student-first.

---

## 8. Risks (named honestly)

- **Adoption is slow** — EEs are conservative; switching tools is hard. Win
  students/hobbyists first (low switching cost).
- **Breadth gap** — 19 fixed topologies ≠ "any circuit." Composition + verified
  blocks (+ optional LLM topology) is the path to "go-to." This is the key build.
- **Monetization lag** — free-first = long runway; stay lean, no burn.
- **Counterfeit/trust** if we ever touch the marketplace (we don't, for now).
- **Distributor/affiliate access** — needs official APIs + affiliate approval.
- **Solo-founder focus** — the biggest risk is doing many things poorly. Pick one
  wedge at a time.

---

## 9. 90-day plan to first revenue (lean, no raise)

**Weeks 1–4 — ship the proof-of-value**
- Verification API live (done: engine runs server-side) + public docs + a free
  tier. Get **one** external AI/tool/dev to call it (design partner > deck).
- Add affiliate links to the BOM (first rupees, zero extra build).

**Weeks 5–8 — audience + retention**
- Put the free web tool in front of Indian EE students/makers (college clubs,
  r/AskElectronics, LinkedIn, maker Discords). Measure **7-day retention** — the
  only metric that matters now.
- Add the composition engine (breadth) so it handles more than the fixed menu.

**Weeks 9–12 — turn on money**
- Launch Pro (unlimited sims, private designs, exports, multi-objective).
- Pitch 3 engineering colleges a cheap pilot license.
- India landed-cost on the BOM (duty + GST + shipping) as a Pro feature.

**Decision gate at day 90:** if students retain + one API user + one college
pilot + first affiliate rupees → it's a business worth running. If not, the free
tool is still a strong portfolio/credibility asset and the learning was cheap.

---

## 10. What's already built (assets in hand)

- 19 SPICE-verified circuit types; NL parsing (+ constraints); closed-loop
  reasoning refinement; E-series + resistor synthesis; data-driven schematics;
  KiCad/EasyEDA/Falstad exports; multi-distributor BOM marketplace (Mouser +
  Digi-Key proxy); 93 automated tests.
- Next code steps: **verification API** (productizes the engine) and the
  **composition engine** (breadth toward "any circuit").
