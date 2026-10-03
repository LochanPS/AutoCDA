# AutoCDA — Go-to-market & demand plan

Honest, founder-facing plan. Written pre-revenue with **zero traffic data yet**, so
every number below is a *hypothesis to validate*, not a forecast. The whole point of
the first phase is to replace these guesses with real numbers from real people.

---

## 0. The core discipline: talk to people before building more

You already have a working, deployed product. The biggest risk now is **building in
a vacuum** — adding features nobody asked to pay for. The fix is cheap and starts today:

- **Ship the waitlist** (done — landing page) and **share the link** in 5–10 places.
- **Talk to 20–30 potential users in the first month.** Not to pitch — to *listen*.
  Ask: "How do you design/verify a filter or amp today? What's annoying? What would
  you pay to never do again?" Their answers decide what you build next.
- A waitlist signup is a weak signal; a **conversation** is a strong one; **someone
  pre-paying or committing to a pilot** is the only real proof.

Rule of thumb: don't build the next big feature until ~10 people have told you, in
their words, that they want it.

---

## 1. What AutoCDA actually is (honest positioning)

**"Describe an analog building block, get a SPICE-verified, buyable design in seconds."**

It covers **19 textbook analog circuits** (filters, op-amp stages, regulators,
current sources, etc.), proves each in real ngspice, and gives a priced BOM.

Be honest about the ceiling: this is **not** a replacement for Cadence/LTspice for
professional IC or complex board design. Its sweet spot is **speed and verification
for common building blocks** — which is exactly what students, hobbyists, and early
prototypers need, and a useful **"truth layer" API** for AI tools. Sell *that*, not a
pro-EDA fantasy.

---

## 2. Who your customers are (segments, ranked by how reachable they are solo)

| # | Segment | Pain AutoCDA solves | Willingness to pay | How you reach them |
|---|---|---|---|---|
| 1 | **EE/ECE students & educators** (esp. India) | "Design + verify a filter for my lab/assignment, fast, correctly" | Low per-head; **real as a college site license** | Professors, IEEE student branches, college clubs, student subreddits |
| 2 | **Hobbyists / makers** | "Pick the right R/C, confirm it works, buy the parts" | Low individually; **affiliate BOM + volume** | r/AskElectronics, r/PrintedCircuitBoard, EEVblog forum, Hackaday, Discord, YouTube |
| 3 | **Early hardware startups / freelance hardware designers** | "Skip the grunt-work math + sim for standard blocks; get a buyable BOM" | **Medium–high** (time = money) → Pro | LinkedIn, hardware meetups, Upwork/Fiverr, indie hardware communities |
| 4 | **AI tool / agent developers** | "A deterministic, SPICE-verified design endpoint my LLM can call" | **Usage-tiered API** | HN, X/Twitter dev crowd, AI/agent communities, your API docs |

**Your likely first paying customers:** a college running a pilot (segment 1), and a
handful of prototypers/freelancers who hit the free limits and want Pro (segment 3).
Hobbyists mostly monetize through **affiliate BOM**, not subscriptions.

---

## 3. Revenue streams (you already have the plumbing for #1)

1. **Affiliate BOM** — commission on "Buy" clicks. Passive, scales with traffic. Cents
   per build, so it only matters at volume. **Live now** once you add your affiliate IDs.
2. **Pro subscription** — ₹299–999/mo (roadmap 3.3). Individuals/prototypers. Recurring.
3. **API usage tiers** — free anon tier + paid keys (already built into the verify API).
   Devs/companies building on the truth layer.
4. **Education site licenses** — annual per-college/department. Highest-value single deals.

Diversified, but don't chase all four at once. **Pick the one that converts first and
double down.**

---

## 4. First 12 months (a realistic, sequenced plan)

### Months 1–2 — Validate demand, don't build much
- Ship waitlist + analytics (lightweight, privacy-friendly e.g. Plausible/Umami free, or GA).
- **Share the link** in 8–10 communities (see §6) and **talk to 20–30 people.**
- Register affiliate programs (Mouser/DigiKey/LCSC) — approvals take days.
- Reach out to **3 professors** for a free semester pilot.
- **Goal:** 100–300 waitlist emails, 20+ conversations, 1–2 pilot verbal yeses, affiliate live.
- **Spend:** ~₹0. Time, not money.

### Months 3–4 — Build the one thing people asked for; turn on money
- From the conversations, build the single most-requested Pro feature (likely
  multi-objective optimization, private history, or exports).
- Stand up Pro with **Razorpay** (India) — test mode first.
- Convert the waitlist with a launch offer (e.g. founding-user discount).
- Run the first **college pilot** live; collect a testimonial.
- **Goal:** first 5–20 paying individuals OR 1 signed pilot; first affiliate ₹ trickling in.

### Months 5–6 — Find the channel that works, repeat it
- Look at the data: which segment actually converts? Pour effort there.
- Start simple **content marketing** (one post/video per week: "design an X filter in
  30s, verified"). SEO around "RC filter calculator", "Sallen-Key design", etc.
- Push the **API** to dev communities if that's where pull appears.
- **Goal:** a repeatable acquisition loop + first ₹5–20k MRR *if* a channel is working.

### Months 7–12 — Compound
- Convert pilots to **paid annual licenses**.
- Expand circuit coverage only where users ask.
- Partner: college departments, maker communities, an affiliate/influencer or two.
- **Year-1 honest target:** first ₹15–50k MRR + 1–3 college licenses + a few API customers.
  Could be less; could be more. The point is a *working* loop, not a big number.

> If after ~6 months of real effort **no** channel converts and pilots don't sign —
> that's the signal to pivot the wedge (e.g. go all-in on the API, or on education)
> rather than keep polishing features.

---

## 5. Years 2–3 and beyond

- **Year 2:** scale the one winning channel; 1 hire (or a co-founder) in that function
  (content/sales/eng). Broaden circuit library and Pro depth driven by paying users.
  Plausible shape: ₹1–5L MRR if year 1 found a real wedge.
- **Year 3+:** two realistic forks — (a) **vertical SaaS** for hardware teams
  (deeper design + verification + sourcing), or (b) **infrastructure** — the
  SPICE-verified API as the trusted backend other AI/EDA tools call. Let the data
  from years 1–2 pick the fork; don't decide it now.
- **Future / moat:** the moat is *verification + breadth + trust*, not the UI. Keep
  widening "what can be described and proven," and own the "verified-by-real-SPICE"
  positioning before AI-EDA competitors do.

---

## 6. Where to share the link (demand validation channels)

Start here, one honest post each (show the measured-error proof, not hype):
- **Reddit:** r/AskElectronics, r/PrintedCircuitBoard, r/ECE, r/electronics (read each
  sub's self-promo rules first; lead with value, not a sales pitch).
- **Forums:** EEVblog, All About Circuits, Hackaday (tip line / project).
- **Hacker News:** a "Show HN" once it's polished — emphasize the verification + API.
- **India / college:** IEEE student branches, college EE WhatsApp/Telegram groups,
  LinkedIn posts, professors directly.
- **Dev/AI (for the API):** X/Twitter, relevant Discords, dev newsletters.
- **YouTube/short video:** a 20–30s "describe → verified design → buy parts" clip.

Track which channel drives waitlist signups — that tells you where your people are.

---

## 7. How to actually make the first sales

1. **Affiliate (today):** add your affiliate IDs → every Buy click can earn. Zero selling.
2. **Pro (self-serve):** free design+verify stays free; gate power features; let heavy
   users hit the wall and upgrade. Price in ₹ (Razorpay). A founding-user discount
   converts the waitlist.
3. **Education (direct):** email/visit professors, offer a free pilot, collect a
   testimonial, then quote a modest **annual department license**. One yes = recurring.
4. **API (developer-led):** great docs + examples; free anon tier to try; paid keys for
   volume. Land one or two devs building on it, then publicize the case.

The sequence that needs the least "selling" first: **affiliate → self-serve Pro →
pilots → API deals.**

---

## 8. Metrics to watch (so you're not flying blind)

- Weekly unique visitors + **designs run** (activation).
- **Waitlist signups / week** and conversation count.
- Affiliate clicks → (later) attributed sales.
- Free→Pro conversion %, MRR, churn (once Pro is live).
- Pilots: started → testimonial → signed license.

If "designs run" per visitor is low, the problem is the product/landing. If it's high
but nobody pays, the problem is packaging/pricing. The metrics tell you which.

---

*This plan is a set of hypotheses. Replace each guess with a real number as it comes
in, and let the data — not the roadmap — decide what to build and who to sell to next.*
