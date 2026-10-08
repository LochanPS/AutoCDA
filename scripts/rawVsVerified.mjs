/**
 * rawVsVerified.mjs — the headline proof: a bare LLM picking component values
 * (no verification) vs AutoCDA's verify-in-the-loop, both graded by the SAME
 * ngspice oracle. Writes docs/compare.html and prints a JSON summary.
 *
 * For each design task:
 *   RAW   : ask the LLM directly for the governing component values, build the
 *           netlist with exactly those, measure the error. No checking.
 *   AUTOCDA: the full propose→SPICE-grade→re-propose loop.
 *
 * Reads OPENROUTER_API_KEY (or REACT_APP_ANTHROPIC_KEY) from env/.env; the key is
 * never printed. Free models are rate-limited (429) — this samples and paces, and
 * records how many raw calls failed so the picture stays honest.
 *
 *   node --import ./server/loader.mjs scripts/rawVsVerified.mjs [sampleCap]
 */
import fs from "node:fs";

try {
  for (const line of fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const { designerAgent } = await import("../src/agents/designerAgent.js");
const { orchestrate } = await import("../src/agents/orchestrator.js");
const { simulatorAgent } = await import("../src/agents/simulatorAgent.js");
const { makeSpec } = await import("../src/spec/circuitSpec.js");
const { runSpice } = await import("../src/sim/spice.js");
const { selectProvider, extractJsonObject } = await import("../src/parse/llmParser.js");

const provider = selectProvider();
if (!provider) { console.error("No LLM key. Set OPENROUTER_API_KEY in .env."); process.exit(1); }
console.error(`raw-LLM provider: ${provider.name} (${provider.model})`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Simple, 2–3 value tasks a bare LLM can plausibly answer; same ones AutoCDA verifies.
const CASES = [
  ["rc_lowpass", { fc: 1000 }, "a low-pass RC filter with cutoff 1 kHz"],
  ["rc_lowpass", { fc: 4700 }, "a low-pass RC filter with cutoff 4.7 kHz"],
  ["rc_highpass", { fc: 500 }, "a high-pass RC filter with cutoff 500 Hz"],
  ["voltage_divider", { Vin: 12, Vout: 5 }, "a resistive divider from 12 V to 5 V"],
  ["voltage_divider", { Vin: 9, Vout: 3.3 }, "a resistive divider from 9 V to 3.3 V"],
  ["led_limiter", { Vsupply: 5, I: 0.02 }, "an LED current limiter from 5 V at 20 mA (Vf 1.8 V)"],
  ["opamp_inverting", { Av: 10 }, "an inverting op-amp amplifier with gain 10"],
  ["opamp_noninverting", { Av: 5 }, "a non-inverting op-amp amplifier with gain 5"],
];

async function callLLM(prompt) {
  const headers = provider.name === "openrouter"
    ? { "content-type": "application/json", authorization: `Bearer ${provider.key}`, "HTTP-Referer": "https://auto-cda-phi.vercel.app", "X-Title": "AutoCDA" }
    : { "content-type": "application/json", "x-api-key": provider.key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" };
  const body = provider.name === "openrouter"
    ? { model: provider.model, messages: [{ role: "system", content: "You are an analog circuit designer. Output ONLY a JSON object." }, { role: "user", content: prompt }], response_format: { type: "json_object" }, max_tokens: 300 }
    : { model: provider.model, max_tokens: 300, system: "You are an analog circuit designer. Output ONLY a JSON object.", messages: [{ role: "user", content: prompt }] };
  const res = await fetch(provider.url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const content = provider.name === "openrouter" ? data?.choices?.[0]?.message?.content : (data.content || []).map((b) => b.text || "").join("");
  return extractJsonObject(content);
}

const errOf = (m, t) => (typeof m === "number" && isFinite(m) && t ? Math.abs((m - t) / t) : null);
const results = [];

for (const [type, targets, desc] of CASES.slice(0, Number(process.argv[2]) || CASES.length)) {
  const d = designerAgent({ type, targets, eSeries: "E24" });
  const refs = d.snapped.filter((c) => c.unit === "Ω" || c.unit === "F").map((c) => ({ ref: c.ref, unit: c.unit }));
  const refList = refs.map((r) => `${r.ref} (${r.unit === "F" ? "farads" : "ohms"})`).join(", ");
  const prompt = `Give component values for ${desc}. Return ONLY a JSON object with exactly these keys in SI base units: ${refList}. Example: {"R1": 1000, "C1": 1.6e-7}. No prose.`;

  // RAW: the LLM's own values, measured as-is.
  let rawErr = null, rawOk = false;
  for (let a = 0; a < 3 && !rawOk; a++) {
    try {
      const vals = await callLLM(prompt);
      const valueMap = {};
      for (const r of refs) { const v = Number(vals[r.ref]); if (isFinite(v) && v > 0) valueMap[r.ref] = v; }
      if (Object.keys(valueMap).length === refs.length) {
        const sim = await simulatorAgent({ type, targets, valueMap, runSpice });
        rawErr = errOf(sim.measured, sim.target); rawOk = rawErr != null;
      }
    } catch (e) { if (a < 2) await sleep(/429/.test(e.message) ? 12000 : 4000); }
  }

  // AUTOCDA: verified loop.
  const vres = await orchestrate(makeSpec({ type, targets, constraints: { tolerance: 0.02 } }), { runSpice, strategy: "reasoning" });
  const verErr = vres.errorPct;

  results.push({ type, targets, rawErrorPct: rawErr, rawOk, autocdaErrorPct: verErr });
  console.error(`${type} ${JSON.stringify(targets)}  raw ${rawErr == null ? "FAIL" : (rawErr * 100).toFixed(1) + "%"}  autocda ${verErr == null ? "—" : (verErr * 100).toFixed(2) + "%"}`);
  await sleep(1500);
}

// ── summary ────────────────────────────────────────────────────────────────────
const rawVals = results.map((r) => r.rawErrorPct).filter((x) => x != null).sort((a, b) => a - b);
const verVals = results.map((r) => r.autocdaErrorPct).filter((x) => x != null).sort((a, b) => a - b);
const med = (v) => (v.length ? v[Math.floor(v.length / 2)] : null);
const within = (v, t) => (v.length ? v.filter((x) => x <= t).length / v.length : 0);
const pctOrNull = (x) => (x == null ? null : +(x * 100).toFixed(2));
const summary = {
  cases: results.length,
  rawGraded: rawVals.length,
  rawFailures: results.filter((r) => !r.rawOk).length,
  raw: { medianPct: pctOrNull(med(rawVals)), worstPct: pctOrNull(rawVals[rawVals.length - 1]), within5: +(within(rawVals, 0.05) * 100).toFixed(0) },
  autocda: { medianPct: pctOrNull(med(verVals)), worstPct: pctOrNull(verVals[verVals.length - 1]), within5: +(within(verVals, 0.05) * 100).toFixed(0) },
  provider: provider.name, model: provider.model,
};
console.log("\n" + JSON.stringify(summary, null, 2));

// ── page ────────────────────────────────────────────────────────────────────────
const date = new Date().toISOString().slice(0, 10);
const bar = (pct, color, max = 60) => { const w = Math.min(100, (pct / max) * 100); return `<div style="background:#1c2128;border-radius:4px;overflow:hidden;height:16px"><div style="width:${w}%;height:100%;background:${color}"></div></div>`; };
const rows = results.map((r) => `<tr>
  <td>${r.type}</td><td style="color:#6e7681">${Object.entries(r.targets).map(([k, v]) => `${k}=${v}`).join(", ")}</td>
  <td class="n" style="color:#f85149">${r.rawErrorPct == null ? "FAILED" : (r.rawErrorPct * 100).toFixed(1) + "%"}</td>
  <td style="width:160px">${r.rawErrorPct == null ? "" : bar(r.rawErrorPct * 100, "#f85149")}</td>
  <td class="n" style="color:#3fb950">${r.autocdaErrorPct == null ? "—" : (r.autocdaErrorPct * 100).toFixed(2) + "%"}</td>
</tr>`).join("");
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AutoCDA — Raw LLM vs Verified</title><style>
:root{--bg:#0d1117;--surface:#161b22;--border:#30363d;--text:#e6edf3;--mono:ui-monospace,Menlo,monospace}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 -apple-system,Segoe UI,Roboto,sans-serif}
.wrap{max-width:840px;margin:0 auto;padding:30px 18px 60px}h1{font-size:23px;margin:0 0 4px}
.sub{color:#9da7b3;margin:0 0 22px}.cards{display:flex;gap:16px;flex-wrap:wrap;margin:10px 0 18px}
.c{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px 18px;min-width:150px}
.c b{display:block;font-size:12px;color:#6e7681;text-transform:uppercase;letter-spacing:.04em}.c span{font:700 24px/1.2 var(--mono)}
table{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden}
th,td{padding:9px 14px;text-align:left;border-bottom:1px solid var(--border);font-size:14px}
th{color:#6e7681;font-size:12px;text-transform:uppercase}.n{text-align:right;font-family:var(--mono)}
.red{color:#f85149}.green{color:#3fb950}.foot{color:#6e7681;font-size:12px;margin-top:22px}a{color:#2f81f7}</style></head>
<body><div class="wrap">
<h1>Raw LLM vs SPICE-verified</h1>
<p class="sub">Same design tasks. A bare LLM picks component values with no check (red) vs AutoCDA's verify-in-the-loop (green) — both measured by the same ngspice oracle. <a href="/">playground</a></p>
<div class="cards">
 <div class="c"><b>Raw LLM — median error</b><span class="red">${summary.raw.medianPct ?? "—"}%</span></div>
 <div class="c"><b>AutoCDA — median error</b><span class="green">${summary.autocda.medianPct ?? "—"}%</span></div>
 <div class="c"><b>Raw — worst</b><span class="red">${summary.raw.worstPct ?? "—"}%</span></div>
 <div class="c"><b>AutoCDA — worst</b><span class="green">${summary.autocda.worstPct ?? "—"}%</span></div>
</div>
<table><thead><tr><th>Circuit</th><th>Target</th><th class="n">Raw LLM err</th><th></th><th class="n">AutoCDA err</th></tr></thead><tbody>${rows}</tbody></table>
<p class="foot">Generated ${date} · raw-LLM via ${summary.model} · ${summary.rawFailures} raw call(s) failed to produce a usable design. Reproduce: <code>node --import ./server/loader.mjs scripts/rawVsVerified.mjs</code>. The point isn't that the LLM is dumb — it's that nothing tells you which of its answers are wrong. The oracle does.</p>
</div></body></html>`;
fs.writeFileSync(new URL("../docs/compare.html", import.meta.url), html);
console.log("wrote docs/compare.html");
