/**
 * proKey — OFFLINE Pro key verification. No network, no server.
 *
 * A Pro key is a signed token: `AUTOCDA-PRO.<payloadB64url>.<sigB64url>`
 *   - payload = JSON { n: buyer id, iat: issue date, exp: expiry|null }
 *   - sig     = ECDSA P-256 signature over the payloadB64url string, made with the
 *               PRIVATE key you hold (scripts/mint-pro-key.mjs).
 *
 * The app ships only the PUBLIC key (src/pro/proPublicKey.js), which can verify but
 * never mint — so keys are unforgeable, yet validation is 100% client-side.
 * Web Crypto (crypto.subtle) is used in both Node (minting) and the browser (verifying),
 * so a key minted by Node verifies in the browser unchanged.
 */
import { PRO_PUBLIC_JWK } from "./proPublicKey";

const KEY_RE = /^AUTOCDA-PRO\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/;

function b64urlToBytes(s) {
  let b = s.replace(/-/g, "+").replace(/_/g, "/");
  while (b.length % 4) b += "=";
  const bin = atob(b);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

/**
 * Verify a Pro key fully offline.
 * @returns {Promise<{ok:boolean, reason?:string, info?:object}>}
 *   reasons: "empty" | "format" | "invalid" | "expired" | "not-configured" | "error"
 */
export async function verifyProKey(key) {
  const k = (key || "").trim();
  if (!k) return { ok: false, reason: "empty" };
  if (!PRO_PUBLIC_JWK) return { ok: false, reason: "not-configured" };
  const m = KEY_RE.exec(k);
  if (!m) return { ok: false, reason: "format" };
  const [, payloadB64, sigB64] = m;
  try {
    const pub = await crypto.subtle.importKey(
      "jwk", PRO_PUBLIC_JWK, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]
    );
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" }, pub,
      b64urlToBytes(sigB64), new TextEncoder().encode(payloadB64)
    );
    if (!ok) return { ok: false, reason: "invalid" };
    const info = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64)));
    if (info.exp && Date.now() > Date.parse(info.exp)) return { ok: false, reason: "expired", info };
    return { ok: true, info };
  } catch {
    return { ok: false, reason: "error" };
  }
}
