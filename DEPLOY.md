# Deploying AutoCDA

Two independent deployables:

1. **Web app** — static Create-React-App build → **Vercel** (CDN).
2. **Verification API** — Node service → **Render** (free, no card; `render.yaml` blueprint).

They communicate only over HTTPS. The app needs **no secrets**. ngspice runs in
both places: in the app it is WebAssembly **base64-inlined into the JS bundle**
(no separate `.wasm` fetch, no cross-origin-isolation headers); in the API it
runs server-side.

---

## 0. Secrets — never commit

`.env` is gitignored. Anything prefixed `REACT_APP_*` is **bundled into the public
JS** at build time — put only non-secret values there. Distributor credentials and
API keys stay server-side (pricing proxy / API host), set in the host dashboard.

---

## 1. Web app → Vercel

### Environment variables (Project → Settings → Environment Variables)

| Var | Required | Notes |
|---|---|---|
| `REACT_APP_PRICING_PROXY` | optional | URL of the pricing proxy (e.g. `https://pricing.example/api/pricing`). Without it the app uses the built-in static parts catalog. A URL is not a secret; distributor keys live in the proxy. |
| `REACT_APP_ANTHROPIC_KEY` | optional | Enables the LLM prompt parser / in-loop proposer. **If set, it is bundled into the public JS.** Leave empty in production (the regex parser handles the 19 types); only ever use a restricted/demo key. |

### Deploy (CLI)

```bash
npm i -g vercel
vercel login
# from the repo root:
vercel                 # first run: link/create project, accepts CRA auto-detect
vercel env add REACT_APP_PRICING_PROXY production   # optional
vercel --prod
```

Output: `https://<project>.vercel.app`.

`vercel.json` (committed) already sets the build command, output dir (`build`),
the SPA rewrite to `/index.html`, immutable caching for `/static/*`, no-cache for
`index.html`, and baseline security headers.

### Deploy (git-based, alternative)

Push to GitHub → **Import Project** in the Vercel dashboard. It reads `vercel.json`.
Add the env vars in the dashboard. Every push redeploys.

### Verify

Open the URL, click **Try it**. The SPICE simulation runs **in your browser** — a
measured result proves the wasm engine loaded straight from the bundle. API docs
are served statically at `https://<project>.vercel.app/api-docs.html`.

---

## 2. Verification API (Docker — any always-on / scale-to-zero host)

`Dockerfile` + `.dockerignore` are committed. Start command is baked in
(`npm run verify-api`). Health check: `GET /api/health` (unauthenticated,
unthrottled). The **same image runs on any container host** — pick one below.

The API is **stateless per request**, so it does not *need* an always-on
instance; scale-to-zero is fine and usually free at low volume.

### Where to host

| Host | Card required? | Cost | Notes |
|---|---|---|---|
| **Hugging Face Spaces (Docker SDK)** | **No** | Free | **Recommended if you have no card.** Runs this Dockerfile; keeps the real server (rate-limiting works). Sleeps after ~48 h idle, wakes on request. |
| **Render (free Node web service)** | **No** | Free, indefinite | **Recommended no-card path.** No Docker needed — `render.yaml` blueprint committed. Idles after ~15 min, cold-starts on next request. |
| **Google Cloud Run** | Yes (Visa/MC/Amex) | ~$0 low traffic (2M req/mo free) | Managed, no expiry. Best if you *can* add a card. |
| **Oracle Cloud Always Free** | Yes (card to verify) | Free forever | ARM VM, you own the box. |
| **Fly.io / Koyeb** | Yes | Small free allowance | `fly launch --dockerfile`. |

> **No Visa/Mastercard?** Cloud Run, Oracle, Fly all require a card even for free
> tiers. Use **Hugging Face Spaces** (below) — no card, runs the same image.
> Free tiers change often — verify current limits before committing.

### Caveats (what the free setup does *not* do)

- **Rate-limit + usage counts are in memory, per instance** → they reset on
  restart / scale-to-zero, and are not shared across multiple instances. For
  durable counts, set `USAGE_FILE` to a path on a **mounted persistent disk**
  (Fly volume, a VM disk, etc.). Scale-to-zero hosts without a disk will reset.
- **No self-serve key signup / billing.** The anonymous free tier needs no key.
  Higher limits = you hand someone a key by adding it to `API_KEYS`. That's
  deliberate for this stage, not a billing system.
- **TLS** is provided by the host (Cloud Run/Fly/Koyeb) or by a reverse proxy
  you add (Caddy/nginx on a VM). The container itself serves plain HTTP.
- The hosted **web app's in-browser SPICE is independent of this API** — the app
  keeps working even if the API is down. The API is for *external* callers.

### Deploy quickstarts (same image)

**Hugging Face Spaces — no credit card** (recommended when you have no card):
1. huggingface.co → sign up (free, no card) → **New Space** → **SDK: Docker** → **Blank** → Public.
2. Clone the Space repo and copy these into it (keep the auto-generated `README.md`, which has `sdk: docker`):
   `Dockerfile`, `.dockerignore`, `package.json`, `package-lock.json`, `server/`, `src/`.
3. Space → **Settings → Variables and secrets** → add:
   - `PORT = 7860`  (HF serves the app on port 7860)
   - `CORS_ORIGIN = https://auto-cda-phi.vercel.app`
   - optional: `API_KEYS`, `ANON_RATE_LIMIT`, etc.
4. `git push` the Space → HF builds the Docker image → live at `https://<user>-<space>.hf.space`.
5. Smoke test: `curl https://<user>-<space>.hf.space/api/health`

> HF free Spaces sleep after ~48 h idle and cold-start (loads the ~20 MB engine,
> ≈1–2 s on the first request after waking). In-memory rate/usage counts reset on
> each wake — fine for a free public API.

**Google Cloud Run** (managed, no expiry — needs a card):
```bash
gcloud run deploy autocda-api --source . \
  --allow-unauthenticated --region <region> \
  --set-env-vars CORS_ORIGIN=https://<project>.vercel.app
# → https://autocda-api-xxxxx-<region>.run.app
```

**Fly.io** (persistent usage counts via a volume):
```bash
fly launch --dockerfile --no-deploy          # creates fly.toml (reads $PORT)
fly volumes create data --size 1             # optional, for USAGE_FILE
fly secrets set CORS_ORIGIN=https://<project>.vercel.app
# optionally set USAGE_FILE=/data/usage.json and mount the volume at /data
fly deploy
```

**Koyeb**: New Service → Docker/repo → health path `/api/health` → set `CORS_ORIGIN` → deploy.

**Oracle Always Free VM** (free forever, self-managed):
```bash
# on the VM, with the repo checked out:
docker build -t autocda-api .
docker run -d --restart unless-stopped -p 3002:3002 \
  -e CORS_ORIGIN=https://<project>.vercel.app \
  -e USAGE_FILE=/data/usage.json -v /opt/autocda:/data \
  autocda-api
# then front :3002 with Caddy for automatic HTTPS
```

**Render — free Node web service, no card, no Docker** (recommended no-card path):
A `render.yaml` blueprint is committed (runtime `node`, `npm ci` / `npm run verify-api`,
health check `/api/health`, free plan).
1. render.com → sign up with GitHub (no card).
2. **New + → Blueprint** → pick `LochanPS/AutoCDA` → Render reads `render.yaml` → **Apply**.
3. Build runs, then live at `https://autocda-verify-api.onrender.com`.
4. (Optional) edit `CORS_ORIGIN` / add `API_KEYS` in the service's **Environment** tab.

> Free Render services spin down after ~15 min idle and cold-start on the next
> request (~30–60 s, loading the ~20 MB engine). Indefinite — they do not expire.
> Not using the committed `Dockerfile` here; the Node runtime runs the start command directly.

### Environment variables (set in the host's dashboard / CLI)

| Var | Default | Notes |
|---|---|---|
| `PORT` | injected by Render | server reads `process.env.PORT` |
| `CORS_ORIGIN` | `*` | set to your app origin, e.g. `https://<project>.vercel.app` |
| `API_KEYS` | *(none)* | comma list: `"key_live_abc=600,key_free_xyz"` → per-key requests/window |
| `KEYED_RATE_LIMIT` | `120` | default limit for keys without an explicit number |
| `ANON_RATE_LIMIT` | `10` | free anonymous tier, per IP, per window |
| `RATE_WINDOW_MS` | `60000` | rate-limit window |
| `MAX_BODY_BYTES` | `65536` | request-body cap (413 over this) |
| `USAGE_FILE` | *(none)* | optional JSON path to persist per-key usage (point at a mounted persistent disk) |

No secrets are required to run. `API_KEYS` values are chosen by you — set them in
the host's dashboard/CLI, never in git.

### Smoke test (replace host)

```bash
API=https://your-api-host.example      # your deployed API URL

# 1. liveness
curl -s "$API/api/health"
# {"ok":true,"service":"autocda-verify-api","types":19}

# 2. verify from a prompt
curl -s "$API/api/verify" -H "content-type: application/json" \
  -d '{"prompt":"low-pass filter at 1kHz"}'
# {"ok":true,"type":"rc_lowpass","measured":994.8,"errorPct":0.0052,"verified":true,...}

# 3. explicit spec
curl -s "$API/api/verify" -H "content-type: application/json" \
  -d '{"type":"voltage_divider","targets":{"Vin":9,"Vout":3.3}}'

# 4. with an API key (higher rate limit) + check usage
curl -s "$API/api/usage" -H "x-api-key: YOUR_KEY"
```

---

## 3. Using the API (for consumers)

Anyone can call it — a human with `curl`, a script, or another LLM/agent. Full
reference page: `https://<your-app>/api-docs.html`.

**No key needed to start** (anonymous free tier). Send a key only to raise your
rate limit.

### The one call you need — `POST /api/verify`

Give it plain English, get a verified, buyable design back:

```bash
curl -s "https://your-api-host.example/api/verify" \
  -H "content-type: application/json" \
  -d '{"prompt":"low-pass filter at 1 kHz"}'
```
```jsonc
{
  "ok": true,
  "type": "rc_lowpass",
  "verified": true,
  "target": 1000, "measured": 994.8, "errorPct": 0.0052,   // ← honest measured error
  "components": [ {"ref":"R1","value":"1 kΩ"}, {"ref":"C1","value":"159 nF"} ],
  "bom": { "rows": [...], "total": 0.12 },
  "netlist": "* RC Low-Pass ...",
  "trace": [ ... ]
}
```

Or pass an explicit spec instead of a prompt:
```bash
-d '{"type":"voltage_divider","targets":{"Vin":9,"Vout":3.3},"constraints":{"eSeries":"E96"}}'
```

### From JavaScript

```js
const r = await fetch("https://your-api-host.example/api/verify", {
  method: "POST",
  headers: { "content-type": "application/json" /* , "x-api-key": "YOUR_KEY" */ },
  body: JSON.stringify({ prompt: "sallen-key low-pass 2 kHz" }),
});
const design = await r.json();
console.log(design.measured, design.components);
```

### From Python

```python
import requests
r = requests.post("https://your-api-host.example/api/verify",
                  json={"prompt": "band-pass 300Hz to 3kHz"},
                  headers={})  # add {"x-api-key": "YOUR_KEY"} for higher limits
print(r.json()["measured"], r.json()["errorPct"])
```

### Using a key (higher limit)

```bash
curl ... -H "x-api-key: YOUR_KEY"        # or: -H "Authorization: Bearer YOUR_KEY"
```
Every response carries `X-RateLimit-Limit` / `-Remaining` / `-Reset`. On `429`
you also get `Retry-After` (seconds). Check your own usage:
```bash
curl -s "https://your-api-host.example/api/usage" -H "x-api-key: YOUR_KEY"
# {"ok":true,"tier":"keyed","limit":120,"used":57,"windowRemaining":119}
```

### All endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | liveness (no auth, no limit) |
| `GET` | `/api/types` | the 19 circuit types + their target fields |
| `POST` | `/api/parse` | prompt → structured spec (no design step) |
| `POST` | `/api/verify` | **main** — prompt or spec → verified design + BOM + netlist |
| `POST` | `/api/compose` | cascade stages into one circuit, measured end-to-end |
| `GET` | `/api/usage` | your tier, limit, and usage |

Errors are JSON `{ "ok": false, "error": "..." }` with status `400` (bad input),
`401` (unknown key), `413` (body too large), `422` (prompt not understood),
`429` (rate limited), `500` (server error).

---

## Local dev

```bash
npm start                     # app on http://localhost:3000
npm run verify-api            # API on http://localhost:3002
npm run pricing-proxy         # optional pricing proxy on :3001 (needs distributor keys in .env)
```
