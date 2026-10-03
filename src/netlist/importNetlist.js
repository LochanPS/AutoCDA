/**
 * importNetlist.js — pure helpers for the "Import netlist" mode.
 *
 * Lets a user paste (or upload) an arbitrary ngspice deck and run it through the
 * same in-browser ngspice-wasm engine the designer uses. No design equations are
 * involved: whatever the deck says, we simulate and measure. This module is the
 * pure half (detect / validate / normalize / summarize); the React panel in
 * src/components/NetlistImport.jsx wires it to runSpice.
 *
 * Pure module — no React, no wasm import, so it is unit-testable in node.
 */

// Analysis directives ngspice understands, mapped to a friendly kind + label.
const ANALYSIS = [
  { re: /^\.ac\b/i,    kind: "ac",   label: "AC sweep (frequency response)" },
  { re: /^\.tran\b/i,  kind: "tran", label: "Transient (time domain)" },
  { re: /^\.dc\b/i,    kind: "dc",   label: "DC sweep" },
  { re: /^\.op\b/i,    kind: "op",   label: "Operating point (DC)" },
  { re: /^\.noise\b/i, kind: "noise", label: "Noise analysis" },
  { re: /^\.disto\b/i, kind: "disto", label: "Distortion analysis" },
  { re: /^\.tf\b/i,    kind: "tf",   label: "Transfer function" },
];

// Valid first letters for an ngspice element/instance line.
const ELEMENT_LETTERS = /^[RCLKDEFGHIJMQVSTUWXZ]/i;

const lines = (deck) => String(deck == null ? "" : deck).split(/\r?\n/);
const isComment = (l) => /^\s*\*/.test(l) || l.trim() === "";
const isDirective = (l) => /^\s*\./.test(l);

/**
 * Detect the first analysis directive in a deck.
 * @returns {{kind:string,label:string,directive:string}|null}
 */
export function detectAnalysis(deck) {
  for (const raw of lines(deck)) {
    const l = raw.trim();
    if (!l || isComment(l)) continue;
    for (const a of ANALYSIS) {
      if (a.re.test(l)) return { kind: a.kind, label: a.label, directive: l };
    }
  }
  return null;
}

/**
 * Validate a pasted deck before simulating. Cheap structural checks only — the
 * real correctness check is ngspice itself. Returns a helpful message on failure.
 * @returns {{ok:boolean, message?:string, analysis?:object, elements?:number}}
 */
export function validateNetlist(deck) {
  if (!deck || !String(deck).trim()) {
    return { ok: false, message: "Paste or upload a netlist first." };
  }

  const body = lines(deck).map((l) => l.trim()).filter((l) => l && !isComment(l));
  const elementLines = body.filter((l) => !isDirective(l));

  if (elementLines.length === 0) {
    return { ok: false, message: "No circuit elements found — a netlist needs at least one component (e.g. R1 in out 1k)." };
  }

  const bad = elementLines.find((l) => !ELEMENT_LETTERS.test(l));
  if (bad) {
    return { ok: false, message: `Unrecognised element line: "${bad.slice(0, 40)}". Lines must start with a device letter (R, C, L, V, Q, …).` };
  }

  // Flag element lines that carry no nodes at all (name only).
  const noNodes = elementLines.find((l) => l.split(/\s+/).length < 3);
  if (noNodes) {
    return { ok: false, message: `Element "${noNodes.split(/\s+/)[0]}" is missing nodes/value — expected at least two nodes.` };
  }

  const analysis = detectAnalysis(deck);
  if (!analysis) {
    return { ok: false, message: "No analysis directive found. Add one, e.g. .ac dec 100 10 1meg, .tran 10u 5m, .dc V1 0 5 0.1, or .op" };
  }

  return { ok: true, analysis, elements: elementLines.length };
}

/**
 * Make a pasted deck safe to feed ngspice-wasm:
 *   - ngspice treats the FIRST line as a title and ignores it, so a deck whose
 *     first line is a real element would silently lose that element. Prepend a
 *     comment title when the first non-blank line isn't already a comment.
 *   - append a trailing `.end` if the user omitted it.
 */
export function normalizeDeck(deck) {
  let text = String(deck == null ? "" : deck).replace(/\r\n/g, "\n").trim();
  if (!text) return text;

  const all = text.split("\n");
  const firstReal = all.find((l) => l.trim() !== "");
  if (firstReal && !/^\s*\*/.test(firstReal)) {
    text = `* AutoCDA imported netlist\n${text}`;
  }

  if (!/\n\s*\.end\s*$/i.test("\n" + text)) {
    text = `${text}\n.end`;
  }
  return text;
}

// ── result summary ───────────────────────────────────────────────────────────

const fmtHz = (f) =>
  f == null ? "n/a" : f >= 1e6 ? `${(f / 1e6).toPrecision(3)} MHz` : f >= 1e3 ? `${(f / 1e3).toPrecision(3)} kHz` : `${f.toPrecision(3)} Hz`;
const fmtV = (v) => (v == null ? "n/a" : `${Number(v).toPrecision(4)} V`);
const fmtNum = (v) => (v == null ? "n/a" : String(Number(v).toPrecision(4)));

// Prefer an "out" node, else the last declared node (ngspice lists the output
// of a chain last in most hand-written decks).
function primaryNode(result) {
  const keys = Object.keys(result.nodes || {});
  if (!keys.length) return null;
  const out = keys.find((k) => /(^|[(])out([)]|$)/i.test(k) || k.toLowerCase() === "out");
  return out || keys[keys.length - 1];
}

/**
 * Build a short measured-response summary from a parsed SPICE result, given the
 * detected analysis kind. Uses the pure analyzers from ../sim/measure.
 * @returns {{headline:string, rows:Array<{label:string,value:string}>, node:string|null}}
 */
export function summarizeResult(result, analysis, { measureCutoff, measureGain, measureDC }) {
  const kind = analysis && analysis.kind;
  const node = primaryNode(result);
  const rows = [];

  if (kind === "ac") {
    const fc = node ? measureCutoff(result, node) : null;
    const gain = node ? measureGain(result, null, node) : null;
    const gainDb = gain != null && gain > 0 ? 20 * Math.log10(gain) : null;
    rows.push({ label: "Output node", value: node || "n/a" });
    rows.push({ label: "−3 dB corner", value: fmtHz(fc) });
    rows.push({ label: "Peak gain", value: gain == null ? "n/a" : `${gain.toPrecision(3)}× (${gainDb == null ? "n/a" : gainDb.toFixed(1)} dB)` });
    return { headline: fc != null ? `−3 dB at ${fmtHz(fc)}` : "AC response measured", rows, node };
  }

  if (kind === "op" || kind === "dc") {
    const keys = Object.keys(result.nodes || {}).slice(0, 8);
    for (const k of keys) {
      rows.push({ label: k, value: /^i\(/i.test(k) ? `${(measureDC(result, k) * 1000).toPrecision(4)} mA` : fmtV(measureDC(result, k)) });
    }
    const headVal = node ? measureDC(result, node) : null;
    return { headline: node ? `${node} = ${/^i\(/i.test(node) ? `${(headVal * 1000).toPrecision(4)} mA` : fmtV(headVal)}` : "DC solution measured", rows, node };
  }

  if (kind === "tran") {
    const sweep = result.sweep || [];
    const tEnd = sweep.length ? sweep[sweep.length - 1] : null;
    rows.push({ label: "Points", value: String(sweep.length) });
    rows.push({ label: "Time span", value: tEnd == null ? "n/a" : `${(tEnd * 1e3).toPrecision(4)} ms` });
    const keys = Object.keys(result.nodes || {}).slice(0, 6);
    for (const k of keys) {
      const arr = result.nodes[k];
      const final = arr && arr.length ? arr[arr.length - 1] : null;
      const peak = arr && arr.length ? Math.max(...arr) : null;
      rows.push({ label: `${k} (final / peak)`, value: `${fmtNum(final)} / ${fmtNum(peak)}` });
    }
    return { headline: "Transient response measured", rows, node };
  }

  // Fallback: just list nodes.
  const keys = Object.keys(result.nodes || {}).slice(0, 8);
  for (const k of keys) rows.push({ label: k, value: `${(result.nodes[k] || []).length} points` });
  return { headline: `${analysis ? analysis.label : "Result"} measured`, rows, node };
}
