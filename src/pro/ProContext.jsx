/**
 * ProContext — license-key MVP for AutoCDA Pro.
 *
 * One key = Pro unlock (client features) + higher API limits (enforced server-side
 * by the verify API). There is deliberately NO account/login/database here: a paying
 * user receives a key, pastes it in, and the app validates it by calling the verify
 * API's /api/usage endpoint. A key on the "keyed" tier = Pro.
 *
 * Config (REACT_APP_* are public, which is fine — these are URLs, not secrets):
 *   REACT_APP_VERIFY_API        base URL of the deployed verify API (e.g. the Render URL)
 *   REACT_APP_PRO_CHECKOUT_URL  hosted payment link (Razorpay/Stripe) for "Get Pro"
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

const API_BASE = (process.env.REACT_APP_VERIFY_API || "").replace(/\/$/, "");
export const PRO_CHECKOUT_URL = process.env.REACT_APP_PRO_CHECKOUT_URL || "";
const LS_KEY = "autocda_pro_key";

const ProContext = createContext(null);

async function validateKey(k) {
  if (!k) return { ok: false, reason: "empty" };
  if (!API_BASE) return { ok: false, reason: "no-api" };
  try {
    const res = await fetch(`${API_BASE}/api/usage`, { headers: { "x-api-key": k, accept: "application/json" } });
    if (res.status === 401) return { ok: false, reason: "invalid" };
    if (!res.ok) return { ok: false, reason: "error" };
    const d = await res.json();
    if (d && d.tier === "keyed") return { ok: true, info: d };
    return { ok: false, reason: "not-pro" }; // a valid-but-anon response = not a Pro key
  } catch {
    return { ok: false, reason: "offline" };
  }
}

export function ProProvider({ children }) {
  const [key, setKey] = useState(() => { try { return localStorage.getItem(LS_KEY) || ""; } catch { return ""; } });
  const [status, setStatus] = useState("idle"); // idle | checking | active | invalid | error | no-api
  const [info, setInfo] = useState(null);

  // Revalidate a stored key on load. If the API is unreachable (sleeping/offline),
  // keep the user Pro rather than locking out someone who paid.
  useEffect(() => {
    let live = true;
    if (!key) { setStatus("idle"); return; }
    setStatus("checking");
    validateKey(key).then((r) => {
      if (!live) return;
      if (r.ok) { setStatus("active"); setInfo(r.info); }
      else if (r.reason === "offline") { setStatus("active"); }   // grace while API is down
      else { setStatus("idle"); setInfo(null); }
    });
    return () => { live = false; };
  }, [key]);

  const unlock = useCallback(async (k) => {
    const trimmed = (k || "").trim();
    setStatus("checking");
    const r = await validateKey(trimmed);
    if (r.ok) {
      try { localStorage.setItem(LS_KEY, trimmed); } catch { /* ignore */ }
      setKey(trimmed); setInfo(r.info); setStatus("active");
      return { ok: true };
    }
    setStatus(r.reason === "invalid" || r.reason === "not-pro" ? "invalid" : r.reason === "no-api" ? "no-api" : "error");
    return r;
  }, []);

  const lock = useCallback(() => {
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
    setKey(""); setInfo(null); setStatus("idle");
  }, []);

  const value = { isPro: status === "active", status, info, hasKey: !!key, unlock, lock, apiConfigured: !!API_BASE, checkoutUrl: PRO_CHECKOUT_URL };
  return <ProContext.Provider value={value}>{children}</ProContext.Provider>;
}

export function usePro() {
  return useContext(ProContext) || { isPro: false, status: "idle", info: null, hasKey: false, unlock: async () => ({ ok: false, reason: "no-provider" }), lock: () => {}, apiConfigured: false, checkoutUrl: "" };
}
