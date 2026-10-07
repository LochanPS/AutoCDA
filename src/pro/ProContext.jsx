/**
 * ProContext — OFFLINE license-key MVP for AutoCDA Pro.
 *
 * Pro unlock is verified entirely IN THE BROWSER against an embedded public key
 * (see src/pro/proKey.js + proPublicKey.js). There is NO network call, so unlock
 * never fails with "couldn't reach the server", cold starts, or CORS. A paying user
 * receives a signed key (minted with scripts/mint-pro-key.mjs) and pastes it in.
 *
 * The Render verify API and its API_KEYS are now independent — they gate the HTTP
 * API's rate limits for developer callers, NOT the app's Pro unlock.
 *
 * Config (REACT_APP_* are public — URLs/flags only, never secrets):
 *   REACT_APP_PRO_CHECKOUT_URL  optional hosted payment link for "Get Pro"
 *   REACT_APP_UPI_ID            optional UPI VPA to show a pay-by-UPI panel
 *   REACT_APP_UPI_QR            optional path/URL to your UPI QR image (e.g. /upi-qr.png)
 *   REACT_APP_WHATSAPP          optional WhatsApp number (digits, incl. country code) for "send proof"
 *   REACT_APP_PRO_PRICE         optional display price (default "₹499")
 *   REACT_APP_PRO_OVERRIDE      LOCAL DEV ONLY — "1" forces Pro. NEVER set in production:
 *                               it is baked into the public bundle and would unlock Pro
 *                               for every visitor. For your own forever-access on the live
 *                               site, mint yourself a key and paste it once instead.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { verifyProKey } from "./proKey";
import { PRO_ENABLED } from "./proConfig";

export const PRO_CHECKOUT_URL = process.env.REACT_APP_PRO_CHECKOUT_URL || "";
export const UPI_ID = process.env.REACT_APP_UPI_ID || "";
export const UPI_QR = process.env.REACT_APP_UPI_QR || "";
export const WHATSAPP = (process.env.REACT_APP_WHATSAPP || "").replace(/[^\d]/g, "");
export const PRO_PRICE = process.env.REACT_APP_PRO_PRICE || "₹499";
const OVERRIDE = ["1", "true", "yes"].includes(String(process.env.REACT_APP_PRO_OVERRIDE || "").trim().toLowerCase());
const LS_KEY = "autocda_pro_key";

const ProContext = createContext(null);

export function ProProvider({ children }) {
  const [key, setKey] = useState(() => { try { return localStorage.getItem(LS_KEY) || ""; } catch { return ""; } });
  const [status, setStatus] = useState(OVERRIDE ? "active" : "idle"); // idle | checking | active | invalid
  const [info, setInfo] = useState(null);

  // Revalidate a stored key on load — offline, instant.
  useEffect(() => {
    if (OVERRIDE) { setStatus("active"); return; }
    let live = true;
    if (!key) { setStatus("idle"); return; }
    setStatus("checking");
    verifyProKey(key).then((r) => {
      if (!live) return;
      if (r.ok) { setStatus("active"); setInfo(r.info); }
      else { setStatus("idle"); setInfo(null); }   // a bad/expired stored key: drop silently
    });
    return () => { live = false; };
  }, [key]);

  const unlock = useCallback(async (k) => {
    const trimmed = (k || "").trim();
    setStatus("checking");
    const r = await verifyProKey(trimmed);
    if (r.ok) {
      try { localStorage.setItem(LS_KEY, trimmed); } catch { /* ignore */ }
      setKey(trimmed); setInfo(r.info); setStatus("active");
      return { ok: true };
    }
    setStatus("invalid");
    return r;
  }, []);

  const lock = useCallback(() => {
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
    setKey(""); setInfo(null); setStatus(OVERRIDE ? "active" : "idle");
  }, []);

  const value = {
    // Pro OFF → everyone is "Pro" (all features open). Pro ON → normal key/override logic.
    isPro: !PRO_ENABLED || OVERRIDE || status === "active",
    status, info, hasKey: !!key, unlock, lock,
    checkoutUrl: PRO_CHECKOUT_URL, upiId: UPI_ID, upiQr: UPI_QR, whatsapp: WHATSAPP, price: PRO_PRICE,
  };
  return <ProContext.Provider value={value}>{children}</ProContext.Provider>;
}

export function usePro() {
  return useContext(ProContext) || {
    isPro: false, status: "idle", info: null, hasKey: false,
    unlock: async () => ({ ok: false, reason: "no-provider" }), lock: () => {},
    checkoutUrl: "", upiId: "", upiQr: "", whatsapp: "", price: PRO_PRICE,
  };
}
