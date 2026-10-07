/**
 * playground.mjs — D4: the API funnel.
 *
 * Two developer-facing surfaces served by the verify API itself, so the running
 * instance IS its own documentation:
 *   • PLAYGROUND_HTML — a zero-build, single-file page: type an intent, hit
 *     /api/verify, see the verified result + the exact curl / JS / Python to
 *     reproduce it. Served at GET / and GET /playground.
 *   • OPENAPI — a machine-readable OpenAPI 3.0 description an agent (or Swagger /
 *     Postman) can ingest. Served at GET /api/openapi.json.
 */

export const OPENAPI = {
  openapi: "3.0.3",
  info: {
    title: "AutoCDA Verification API",
    version: "1.0.0",
    description:
      "The SPICE-verified truth layer for analog circuit design. POST a plain-English intent or an explicit {type, targets} and get back a real-ngspice-verified, buyable design: measured value, honest measured-vs-target error, the netlist, a priced BOM, richer measured metrics, India landed cost, and a reproducibility stamp.",
  },
  servers: [{ url: "/", description: "this instance" }],
  components: {
    securitySchemes: {
      apiKey: { type: "apiKey", in: "header", name: "x-api-key" },
    },
  },
  paths: {
    "/api/health": { get: { summary: "Liveness + type count (no auth, no rate limit)", responses: { 200: { description: "ok" } } } },
    "/api/types": { get: { summary: "List supported circuit types and their target fields", responses: { 200: { description: "array of { id, name, fields }" } } } },
    "/api/usage": { get: { summary: "Your tier, limit and usage", responses: { 200: { description: "usage" } } } },
    "/api/parse": {
      post: {
        summary: "Parse a natural-language intent into a CircuitSpec (no simulation)",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"] }, example: { prompt: "low pass filter at 2 kHz" } } } },
        responses: { 200: { description: "{ type, targets, constraints, confidence, assumed }" } },
      },
    },
    "/api/verify": {
      post: {
        summary: "Design + SPICE-verify a circuit; returns measured error, BOM, metrics, sourcing, repro stamp",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  prompt: { type: "string", description: "natural-language intent (or use type+targets)" },
                  type: { type: "string", description: "explicit circuit type id (see /api/types)" },
                  targets: { type: "object", description: "numeric design targets in base SI units" },
                  constraints: { type: "object", properties: { tolerance: { type: "number" }, eSeries: { type: "string", enum: ["E12", "E24", "E96"] } } },
                  strategy: { type: "string", enum: ["reasoning", "grid"], default: "reasoning" },
                  corners: { type: "boolean", description: "also run temperature/supply/process corner analysis (extra SPICE runs)" },
                },
              },
              examples: {
                prompt: { value: { prompt: "low pass filter at 2 kHz within 2%" } },
                explicit: { value: { type: "voltage_divider", targets: { Vin: 12, Vout: 5 }, constraints: { tolerance: 0.02 } } },
              },
            },
          },
        },
        responses: { 200: { description: "verified design" }, 422: { description: "could not parse / invalid spec" } },
      },
    },
    "/api/compose": {
      post: {
        summary: "Cascade verified stages into one circuit, measured end-to-end",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", properties: { stages: { type: "array", items: { type: "object", properties: { type: { type: "string" }, targets: { type: "object" } } } } }, required: ["stages"] }, example: { stages: [{ type: "opamp_noninverting", targets: { Av: 5 } }, { type: "rc_lowpass", targets: { fc: 1000 } }] } } },
        },
        responses: { 200: { description: "composed, end-to-end-measured circuit" } },
      },
    },
  },
};

export const PLAYGROUND_HTML = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>AutoCDA Verification API — Playground</title>
<style>
  :root{--bg:#0d1117;--surface:#161b22;--surface2:#1c2128;--border:#30363d;--text:#e6edf3;--text2:#9da7b3;--text3:#6e7681;--accent:#2f81f7;--ok:#3fb950;--warn:#d29922;--mono:ui-monospace,SFMono-Regular,Menlo,monospace}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 -apple-system,Segoe UI,Roboto,sans-serif}
  .wrap{max-width:960px;margin:0 auto;padding:28px 18px 60px}
  h1{font-size:22px;margin:0 0 4px}
  .sub{color:var(--text2);font-size:14px;margin:0 0 22px}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px 18px;margin-bottom:16px}
  label{display:block;font-size:12px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px}
  textarea,input,select{width:100%;background:var(--bg);border:1px solid var(--border);border-radius:7px;color:var(--text);padding:9px 11px;font:14px var(--mono);outline:none}
  textarea{min-height:60px;resize:vertical}
  .row{display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-top:12px}
  .row>div{flex:1;min-width:150px}
  button{background:var(--accent);border:0;border-radius:7px;color:#fff;font-size:14px;font-weight:600;padding:10px 18px;cursor:pointer}
  button:disabled{opacity:.5;cursor:progress}
  .stats{display:flex;flex-wrap:wrap;gap:14px 34px;margin:4px 0 2px}
  .stat b{display:block;font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.04em}
  .stat span{font:600 20px var(--mono)}
  .ok{color:var(--ok)} .warn{color:var(--warn)}
  pre{background:var(--bg);border:1px solid var(--border);border-radius:7px;padding:12px;overflow:auto;font:12.5px/1.5 var(--mono);color:var(--text2);max-height:360px}
  .tabs{display:flex;gap:6px;margin-bottom:8px}
  .tabs button{background:var(--surface2);color:var(--text2);padding:5px 12px;font-size:12px}
  .tabs button.on{background:var(--accent);color:#fff}
  .muted{color:var(--text3);font-size:12px}
  a{color:var(--accent)}
</style></head>
<body><div class="wrap">
  <h1>AutoCDA Verification API</h1>
  <p class="sub">The SPICE-verified truth layer for analog design. Type an intent → get a real-ngspice-verified, buyable design. <a href="/api/openapi.json">OpenAPI</a> · <a href="/benchmark">benchmark</a> · <a href="https://github.com/LochanPS/AutoCDA">source</a></p>

  <div class="card">
    <label>Intent (plain English)</label>
    <textarea id="prompt">low pass filter at 2 kHz within 2%</textarea>
    <div class="row">
      <div style="flex:0 0 160px">
        <label>Max error</label>
        <select id="tol"><option value="">(default 5%)</option><option value="0.02">2%</option><option value="0.01">1%</option><option value="0.005">0.5%</option></select>
      </div>
      <div style="flex:0 0 150px">
        <label>API key (optional)</label>
        <input id="key" placeholder="x-api-key">
      </div>
      <div style="flex:0 0 auto"><button id="go">Verify</button></div>
    </div>
    <p class="muted" id="hint" style="margin-top:10px">Tip: try "voltage divider 12V to 5V", "wien bridge oscillator 1kHz", "instrumentation amplifier gain 100".</p>
  </div>

  <div id="out"></div>

  <div class="card">
    <label>Reproduce this request</label>
    <div class="tabs"><button data-l="curl" class="on">curl</button><button data-l="js">JavaScript</button><button data-l="py">Python</button></div>
    <pre id="snippet"></pre>
  </div>
</div>
<script>
const $=s=>document.querySelector(s);
let last={prompt:"low pass filter at 2 kHz within 2%"};
function body(){const p=$("#prompt").value.trim();const tol=$("#tol").value;const b={prompt:p};if(tol)b.constraints={tolerance:Number(tol)};return b;}
function snippets(b){const J=JSON.stringify(b);const origin=location.origin;return{
  curl:\`curl -s \${origin}/api/verify \\\\\n  -H 'content-type: application/json' \\\\\n  -d '\${J}'\`,
  js:\`const r = await fetch("\${origin}/api/verify", {\n  method: "POST",\n  headers: { "content-type": "application/json" },\n  body: JSON.stringify(\${J})\n});\nconst design = await r.json();\nconsole.log(design.measured, design.errorPct, design.converged);\`,
  py:\`import requests\nr = requests.post("\${origin}/api/verify", json=\${J})\ndesign = r.json()\nprint(design["measured"], design["errorPct"], design["converged"])\`
};}
function renderSnippet(lang){$("#snippet").textContent=snippets(last)[lang];}
document.querySelectorAll(".tabs button").forEach(btn=>btn.onclick=()=>{document.querySelectorAll(".tabs button").forEach(b=>b.classList.remove("on"));btn.classList.add("on");renderSnippet(btn.dataset.l);});
const fmtErr=e=>e==null?"—":(e*100).toFixed(2)+"%";
async function run(){
  const b=body();last=b;renderSnippet(document.querySelector(".tabs button.on").dataset.l);
  $("#go").disabled=true;$("#out").innerHTML='<div class="card muted">Verifying in ngspice…</div>';
  try{
    const h={"content-type":"application/json"};const k=$("#key").value.trim();if(k)h["x-api-key"]=k;
    const r=await fetch("/api/verify",{method:"POST",headers:h,body:JSON.stringify(b)});
    const d=await r.json();
    if(!d.ok){$("#out").innerHTML='<div class="card warn">'+(d.error||"could not verify")+'</div>';return;}
    const inr=d.sourcing&&d.sourcing.indiaLandedINR;
    const metrics=d.metrics?Object.values(d.metrics).map(m=>m.label+": "+(+m.value.toPrecision(4))+" "+m.unit).join("\\n"):"";
    $("#out").innerHTML=
      '<div class="card"><div class="stats">'+
        stat("Measured",(d.measured==null?"—":(+d.measured.toPrecision(5))+(d.targetName==="fc"||d.targetName==="f"?" Hz":""))) +
        stat("Target",(d.target==null?"—":+Number(d.target).toPrecision(5))) +
        stat("Error",fmtErr(d.errorPct),d.converged?"ok":"warn") +
        stat("Converged",d.converged?"yes":"best-effort",d.converged?"ok":"warn") +
        stat("BOM (USD)","$"+(d.bom?d.bom.total.toFixed(3):"—")) +
        (inr?stat("India landed","₹"+inr.total.toFixed(0)):"")+
      '</div>'+
      (metrics?'<label style="margin-top:14px">Measured metrics</label><pre>'+metrics+'</pre>':'')+
      (d.repro?'<p class="muted">repro: '+d.repro.engine+' '+d.repro.engineVersion+' · netlist '+d.repro.hashAlgo+' '+d.repro.netlistHash+'</p>':'')+
      '<label style="margin-top:8px">Full response</label><pre>'+JSON.stringify(d,null,2)+'</pre></div>';
  }catch(e){$("#out").innerHTML='<div class="card warn">'+e.message+'</div>';}
  finally{$("#go").disabled=false;}
}
function stat(l,v,cls){return '<div class="stat"><b>'+l+'</b><span class="'+(cls||"")+'">'+v+'</span></div>';}
$("#go").onclick=run;renderSnippet("curl");run();
</script>
</body></html>`;
