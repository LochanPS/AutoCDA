/**
 * ProUI — the Pro unlock modal, header button, and gating primitives.
 * Pure presentational; all state/logic lives in ProContext.
 */
import React, { useState } from "react";
import { usePro } from "./ProContext";
import { PRO_ENABLED } from "./proConfig";

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

// Payment options shown to a non-Pro user: hosted checkout if set, else a UPI
// QR + "pay then WhatsApp me the proof → I send your key" flow, else contact note.
function PayPanel() {
  const { checkoutUrl, upiId, upiQr, whatsapp, price } = usePro();
  const waText = encodeURIComponent(`Hi! I paid ${price} for AutoCDA Pro via UPI. Here's my payment screenshot — please send my Pro key.`);
  const waLink = whatsapp ? `https://wa.me/${whatsapp}?text=${waText}` : "";
  const upiLink = upiId ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent("AutoCDA")}&cu=INR` : "";

  if (checkoutUrl) {
    return (
      <a href={checkoutUrl} target="_blank" rel="noopener noreferrer"
         style={{ ...primaryBtn, display: "inline-block", textDecoration: "none", marginBottom: "16px" }}>
        Get Pro →
      </a>
    );
  }

  if (upiId || upiQr) {
    return (
      <div style={{ border: "1px solid var(--border)", borderRadius: "var(--r-sm)", padding: "14px", marginBottom: "16px" }}>
        <div style={{ fontSize: "var(--fs-sm)", fontWeight: 700, color: "var(--text)", marginBottom: "2px" }}>Get Pro — {price}</div>
        <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-2)", marginBottom: "12px" }}>Pay by UPI, then send the screenshot — we reply with your key.</div>
        <div style={{ display: "flex", gap: "14px", alignItems: "center", flexWrap: "wrap" }}>
          {upiQr ? (
            <img src={upiQr} alt="UPI QR code" width={120} height={120}
                 style={{ width: 120, height: 120, borderRadius: "var(--r-sm)", border: "1px solid var(--border)", background: "#fff", objectFit: "contain" }} />
          ) : null}
          <div style={{ flex: "1 1 160px", minWidth: 0 }}>
            {upiId ? (
              <div style={{ fontSize: "var(--fs-sm)", color: "var(--text)", marginBottom: "6px", wordBreak: "break-all" }}>
                <span style={{ color: "var(--text-3)" }}>UPI: </span><strong>{upiId}</strong>
              </div>
            ) : null}
            {upiLink ? (
              <a href={upiLink} style={{ ...ghostBtn, display: "inline-block", textDecoration: "none", marginBottom: "8px" }}>Open UPI app</a>
            ) : null}
            {waLink ? (
              <a href={waLink} target="_blank" rel="noopener noreferrer"
                 style={{ ...primaryBtn, display: "block", textAlign: "center", textDecoration: "none" }}>
                I paid → send proof on WhatsApp
              </a>
            ) : (
              <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-3)" }}>After paying, contact us for your key.</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontSize: "var(--fs-sm)", color: "var(--warn)", background: "var(--warn-soft)", border: "1px solid #efe0b0", borderRadius: "var(--r-sm)", padding: "9px 12px", marginBottom: "16px" }}>
      Payment isn't set up yet. Contact us to get a Pro key.
    </div>
  );
}

export function ProModal({ onClose, feature }) {
  const { isPro, unlock, lock, info } = usePro();
  const [k, setK] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setErr(""); setBusy(true);
    const r = await unlock(k);
    setBusy(false);
    if (r.ok) { onClose(); return; }
    setErr(
      r.reason === "not-configured" ? "Pro keys aren't set up yet — contact us."
      : r.reason === "expired" ? "This key has expired. Renew to continue."
      : r.reason === "empty" ? "Enter your Pro key."
      : "That key isn't valid. Check for a copy-paste slip (it starts with AUTOCDA-PRO)."
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
              Pro unlocks netlist import, multi-stage chains, exports, and tolerance/optimization.
            </div>

            <PayPanel />

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
            <div style={{ fontSize: "var(--fs-xs)", color: "var(--text-3)", marginTop: "8px" }}>Keys are verified on your device — no sign-in, works offline.</div>
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
  if (!PRO_ENABLED) return null; // Pro OFF → no header button at all
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
