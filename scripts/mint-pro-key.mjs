/**
 * Mint a Pro key for one buyer. Run after they pay.
 *
 *   node scripts/mint-pro-key.mjs <buyer-email-or-name> [YYYY-MM-DD expiry]
 *
 * Examples:
 *   node scripts/mint-pro-key.mjs asha@example.com              # lifetime key
 *   node scripts/mint-pro-key.mjs asha@example.com 2027-10-07   # expires on that date
 *
 * Prints a key like  AUTOCDA-PRO.<payload>.<sig>  — send it to the buyer. They paste it
 * into Get Pro → Unlock. Verification is offline; no server, no account.
 */
import { webcrypto as crypto } from "node:crypto";
import { readFile } from "node:fs/promises";

const who = process.argv[2];
const exp = process.argv[3] || null;
if (!who) {
  console.error("Usage: node scripts/mint-pro-key.mjs <buyer-email-or-name> [YYYY-MM-DD expiry]");
  process.exit(1);
}
if (exp && Number.isNaN(Date.parse(exp))) {
  console.error(`Bad expiry "${exp}" — use YYYY-MM-DD.`);
  process.exit(1);
}

let priv;
try {
  priv = JSON.parse(await readFile(".secrets/pro-private.jwk", "utf8"));
} catch {
  console.error("No .secrets/pro-private.jwk — run `node scripts/gen-pro-keypair.mjs` first.");
  process.exit(1);
}

const key = await crypto.subtle.importKey("jwk", priv, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
const payload = { n: who, iat: new Date().toISOString().slice(0, 10), exp };
const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(payloadB64));
const sigB64 = Buffer.from(new Uint8Array(sig)).toString("base64url");

console.log(`AUTOCDA-PRO.${payloadB64}.${sigB64}`);
