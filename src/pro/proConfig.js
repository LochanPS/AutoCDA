/**
 * Pro master switch. ONE flag. 0/1.
 *
 *   PRO_ENABLED = false  → Pro is OFF. Every feature is free and open: no "Get Pro"
 *                          button, no unlock modal, no keys, no server. Nothing to break.
 *   PRO_ENABLED = true   → Pro is ON. Gating returns; unlock uses the offline signed-key
 *                          system (src/pro/proKey.js) — no code changes needed to flip back.
 *
 * All the Pro machinery (context, UI, key verifier, mint scripts) stays in the tree,
 * dormant. To switch Pro back on later: set this to true and redeploy.
 */
export const PRO_ENABLED = false;
