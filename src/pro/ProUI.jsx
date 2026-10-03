/**
 * ProUI — the Pro unlock modal, header button, and gating primitives.
 * Pure presentational; all state/logic lives in ProContext.
 */
import React, { useState } from "react";
import { usePro } from "./ProContext";

const overlay = {
  position: "fixed", inset: 0, background: "rgba(22,27,34,0.45)", zIndex: 1000,
  display: "flex", alignItems: "center", justifyContent: "center", padding: "16px",
};
const card = {
  width: "min(100%, 420px)", background: "var(--surface)", border: "1px solid var(--border)",
  borderRadius: "var(--r)", boxShadow: "var(--shadow-md)", padding: "22px", textAlign: "left",
};
const primaryBtn = {
  background: "var(--accent)", border: "none", borderRadius: "var(--r-sm)", color: "#fff",
  fontSize: "var(--fs-body)", fontWeight: 600, padding: "10px 16px", cursor: "pointer",
};
const ghostBtn = {
  background: "transparent", border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
  color: "var(--text-2)", fontSize: "var(--fs-sm)", fontWeight: 600, padding: "9px 14px", cursor: "pointer",
};

export function ProModal({ onClose, feature }) {
  const { isPro, unlock, lock, apiConfigured, checkoutUrl, info } = usePro();
  const [k, setK] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setErr(""); setBusy(true);
    const r = await unlock(k);
    setBusy(false);
    if (r.ok) { onClose(); return; }
    setErr(
      r.reason === "no-api" ? "Pro isn't configured yet (the app has no API URL set)."
      : r.reason === "invalid" || r.reason === "not-pro" ? "That key isn't valid or isn't a Pro key."
      : r.reason === "offline" || r.reason === "error" ? "Couldn't reach the server — try again in a moment."
      : "Enter your Pro key."
    );
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={card} onClick={(e) => e.stopPropagation()}>
        {isPro ? (
          <>
            <div style={{ fontSize: "var(--fs-h2)", fontWeight: 700, color: "var(--text)", marginBottom: "6px" }}>Pro is active</div>
            <div style={{ fontSize: "var(--fs-sm)", color: "var(--text-2)", marginBottom: "16px" }}>
              All Pro features are unlocked{info && info.limit ? ` · API limit ${info.limit}/min` : ""}.
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <button style={ghostBtn} onClick={() => { lock(); onClose(); }}>Remove key</button>
              <button style={primaryBtn} onClick={onClose}>Done</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: "var(--fs-h2)", fontWeight: 700, color: "var(--text)", marginBottom: "4px" }}>Unlock AutoCDA Pro</div>
            <div style={{ fontSize: "var(--fs-sm)", color: "var(--text-2)", marginBottom: "16px" }}>
              {feature ? <><strong>{feature}</strong> is a Pro feature. </> : null}
              Pro unlocks netlist import, multi-stage chains, exports, and tolerance/optimization — plus higher API limits.
            </div>

            {checkoutUrl ? (
              <a href={checkoutUrl} target="_blank" rel="noopener noreferrer"
                 style={{ ...primaryBtn, display: "inline-block", textDecoration: "none", marginBottom: "16px" }}>
                Get Pro →
              </a>
            ) : (
              <div style={{ fontSize: "var(--fs-sm)", color: "var(--warn)", background: "var(--warn-soft)", border: "1px solid #efe0b0", borderRadius: "var(--r-sm)", padding: "9px 12px", marginBottom: "16px" }}>
                Checkout link not set yet. Contact us to get a Pro key.
              </div>
            )}

            <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>Already have a key?</div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <input
                value={k}
                onChange={(e) => { setK(e.target.value); if (err) setErr(""); }}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="paste your Pro key"
                style={{ flex: "1 1 200px", background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "10px 12px", fontSize: "var(--fs-body)", color: "var(--text-primary)", outline: "none" }}
              />
              <button style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={submit}>{busy ? "…" : "Unlock"}</button>
            </div>
            {!apiConfigured && <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-3)", marginTop: "8px" }}>(Key validation needs REACT_APP_VERIFY_API configured.)</div>}
            {err && <div style={{ color: "var(--danger)", fontSize: "var(--fs-xs)", marginTop: "8px" }}>{err}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
              <button style={ghostBtn} onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Header button: "Get Pro" / "Pro ✓".
export function ProButton() {
  const { isPro } = usePro();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: "inline-flex", alignItems: "center", gap: "6px", borderRadius: "999px", cursor: "pointer",
          padding: "6px 14px", fontSize: "var(--fs-sm)", fontWeight: 600,
          border: isPro ? "1px solid var(--success)" : "none",
          background: isPro ? "transparent" : "var(--accent)",
          color: isPro ? "var(--success)" : "#fff",
        }}
      >
        {isPro ? "Pro ✓" : "Get Pro"}
      </button>
      {open && <ProModal onClose={() => setOpen(false)} />}
    </>
  );
}

// Small inline lock chip for gating a single control (e.g. an export button).
export function ProLockChip({ feature, label = "Pro" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={`${feature} is a Pro feature`}
        style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "999px", color: "var(--text-2)", fontSize: "var(--fs-xs)", fontWeight: 600, padding: "5px 10px", cursor: "pointer" }}
      >
        🔒 {label}
      </button>
      {open && <ProModal onClose={() => setOpen(false)} feature={feature} />}
    </>
  );
}

// Full-section upsell (for gating a whole mode/panel).
export function ProUpsell({ feature, note }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: "10px", padding: "40px 20px", background: "var(--surface)", border: "1px dashed var(--border-strong)", borderRadius: "var(--r)" }}>
      <div style={{ fontSize: "26px" }}>🔒</div>
      <div style={{ fontSize: "var(--fs-h2)", fontWeight: 700, color: "var(--text)" }}>{feature} is a Pro feature</div>
      <div style={{ fontSize: "var(--fs-sm)", color: "var(--text-2)", maxWidth: "44ch" }}>
        {note || "Core design + verification stays free. Pro adds this plus exports, chains, and tolerance/optimization."}
      </div>
      <button style={{ ...primaryBtn, marginTop: "4px" }} onClick={() => setOpen(true)}>Unlock with Pro</button>
      {open && <ProModal onClose={() => setOpen(false)} feature={feature} />}
    </div>
  );
}

// Gate a control: render children when Pro, else a lock chip that opens the modal.
export function ProGate({ feature, label, children }) {
  const { isPro } = usePro();
  if (isPro) return children;
  return <ProLockChip feature={feature} label={label} />;
}
