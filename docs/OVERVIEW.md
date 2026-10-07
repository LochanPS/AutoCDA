# AutoCDA — what it is, what it does, why it can be great

## In one line

**AutoCDA is the SPICE-verified truth layer for analog circuit design** — type what
you want in plain English (or have an AI agent ask), and get a **real,
simulator-verified, buyable** circuit back in seconds, with the honest error stated.

## The problem it solves

Analog design is where confident guessing goes to die. A large language model will
happily answer "a low-pass filter at 2 kHz" with an R and a C — and be wrong by
tens of percent, with **no signal of which answers are right**. Datasheets, forum
posts, and calculators each cover a slice; none of them *prove* the number, and none
of them hand you a part you can order. For hardware, a confidently wrong value costs
a build, a board spin, or a bad order.

The core insight: **LLMs are good proposers and bad self-verifiers.** So AutoCDA
keeps the model where it's strong (understanding intent, proposing a shape) and
hands the verdict to something that cannot bluff — a real circuit simulator.

## What it does

1. **Understands intent.** Plain English → a typed spec (circuit type + numeric
   targets + constraints). A fast offline parser handles the common cases; an LLM
   handles the messy tail. Every assumption it makes is shown, never hidden.
2. **Designs from first principles**, then **snaps every value to a real
   E-series part**, so the result is orderable by construction.
3. **Verifies in a real simulator.** ngspice (compiled to WebAssembly) runs in the
   browser or server and *measures* the circuit. The reported error is
   measured-vs-target — not a restatement of the formula that sized it.
4. **Closes the loop.** It proposes a value, grades it in SPICE, observes the error,
   and re-proposes — converging to within tolerance, then trimming to sub-1% with
   finer parts. A handful of deterministic simulations, no AI cost.
5. **Goes open-ended.** For intents with no template, the LLM proposes a *topology*,
   which is **accepted only if the simulator grades it within tolerance** — the
   model never gets the last word.
6. **Makes it buyable.** A bill of materials with real part numbers and prices, and
   the **India landed cost** (duty + GST + shipping + forex) that no global
   distributor shows.
7. **Serves it to tools and agents.** The same engine is an **HTTP API**, a live
   **playground**, an **OpenAPI** spec, and an **MCP server** (`npx
   autocda-verify-mcp`) so any AI agent can verify a circuit mid-reasoning instead
   of guessing.
8. **Stays honest and reproducible.** Every result is labelled measured-vs-derived
   and carries a reproducibility stamp (engine version + canonical netlist hash):
   same intent → same stamped design, auditable and re-runnable.

## Why it can be *really* good

- **Trust is the product, and trust compounds.** The market is flooded with
  generators; almost nothing *verifies*. "The number is proven" is a durable
  promise, not a feature race.
- **Right place, right time.** Every coding/agent copilot now needs external
  verifiers to stop hallucinating. AutoCDA is exactly that for analog — and it's
  already a one-line MCP install. The wedge is *being the endpoint other AIs call*.
- **Buyable-by-construction + local landed cost** turns "here's a design" into
  "here's what to order and what it truly costs delivered" — the design→buy bridge,
  with an India-specific edge nobody else shows.
- **Deterministic + reproducible = cheap to scale and easy to cite.** No GPU, no
  per-call AI cost; the netlist hash is simultaneously an audit key and a cache key
  (identical decks are served from cache — ~100× faster). A verified corpus of
  intent→design pairs accumulates as a data moat and as training signal for better
  proposers.
- **Developer-led growth.** The API/MCP spreads through the people who build agents;
  the playground is the funnel; the benchmark page is the proof.

## Is it easily replicable?

**The concept, yes. The defensible product, no — and the gap widens with use.**

Anyone can wrap "ngspice + an LLM" in a weekend; the idea isn't the moat. What is
hard to copy, and compounds:

- **The verifying-oracle discipline done honestly.** The hard part isn't calling a
  simulator — it's the *contract*: never show an unverified number, report real
  measured error, converge reliably across circuit types and bad seeds, and refuse
  to fake a pass on an unreachable target. That's a lot of careful, tested
  engineering (the convergence guarantees are CI-enforced), and it's the whole
  reason to trust the output.
- **Breadth that stays verified.** Each new circuit type is a verified template with
  its own measurement and refinement, plus the LLM-topology escape hatch gated by
  the oracle. Breadth that *remains trustworthy* is slow to accumulate — and the
  verified-design corpus is a dataset a newcomer starts without.
- **Sourcing data + local landed cost.** Multi-seller pricing, stock/lead-time, and
  a correct India landed-cost model are integration and data work, not an afternoon.
- **The reproducibility + caching substrate.** Stamping, canonicalization, and the
  content-addressed cache are the scaling and audit story; they're plumbing a clone
  won't bother with until it's big, by which point the corpus and the integrations
  are ahead.
- **Distribution + trust position.** Being the MCP/API that agents already call, and
  the benchmark others cite, is a position, not a file you can fork.

So: a demo is replicable; a *trusted, broad, buyable, reproducible, agent-native
verifier with a growing corpus* is a company. The defensibility is execution + data
+ position, not a secret algorithm — which is the normal shape of a real product.

## Where it stands (honest)

22 verified circuit types, composition (incl. branching), multi-objective and
constrained parametric search, transient/FFT metrics, corner analysis, a deployed
web app + API + MCP package, 298 tests. Known gaps are listed plainly in the paper
([PAPER.md](PAPER.md) §5) and the roadmap ([PRODUCT_ROADMAP.md](PRODUCT_ROADMAP.md)):
breadth is still template-anchored (the topology escape hatch needs scale proof),
active-circuit models are idealized, sourcing is partly static, and — the real one —
it needs users. The next moves are to make the LLM path production-safe behind a
server proxy, benchmark the LLM-routed parser, and get it in front of agent builders.

## Try it

- **Web app:** https://auto-cda-phi.vercel.app/
- **API + playground:** `npm run verify-api` → open `/` (or the deployed API root)
- **From an AI agent (MCP):** `npx -y autocda-verify-mcp`, or add it to an MCP client
- **Benchmark:** `npm run benchmark` → `/benchmark`
- **The method, written up:** [PAPER.md](PAPER.md)
