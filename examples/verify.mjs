// AutoCDA Verification API — JavaScript example.
//   node examples/verify.mjs "low pass filter at 2 kHz within 2%"
// Env: AUTOCDA_API (default http://localhost:3002), AUTOCDA_KEY (optional).

const API = process.env.AUTOCDA_API || "http://localhost:3002";
const KEY = process.env.AUTOCDA_KEY || "";
const prompt = process.argv.slice(2).join(" ") || "low pass filter at 2 kHz within 2%";

const headers = { "content-type": "application/json" };
if (KEY) headers["x-api-key"] = KEY;

const res = await fetch(`${API}/api/verify`, {
  method: "POST",
  headers,
  body: JSON.stringify({ prompt }),
});
const d = await res.json();

if (!d.ok) {
  console.error("verify failed:", d.error || d);
  process.exit(1);
}

console.log(`\n${d.name}  (${d.type})`);
console.log(`  ${d.targetName} target ${d.target} → measured ${d.measured}`);
console.log(`  error ${(d.errorPct * 100).toFixed(2)}%  ${d.converged ? "✓ converged" : "≈ best-effort"}`);
console.log(`  parts: ${d.components.map((c) => `${c.ref}=${c.value}`).join(", ")}`);
console.log(`  BOM: $${d.bom.total.toFixed(3)}  ·  India landed: ₹${d.sourcing?.indiaLandedINR?.total ?? "—"}`);
if (d.metrics) for (const m of Object.values(d.metrics)) console.log(`  ${m.label}: ${+m.value.toPrecision(4)} ${m.unit}`);
if (d.repro) console.log(`  repro: ${d.repro.engine} ${d.repro.engineVersion} · netlist ${d.repro.netlistHash}`);
