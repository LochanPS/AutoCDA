import React, { useState, useRef, useCallback } from "react";
import ResultPlot from "./ResultPlot";
import { runSpice, measureCutoff, measureGain, measureDC } from "../sim/spice";
import { validateNetlist, detectAnalysis, normalizeDeck, summarizeResult } from "../netlist/importNetlist";
import { realErrors } from "../agents/simulatorAgent";

// Three ready-to-run decks — cover AC, DC operating-point, and transient so the
// analysis-detection path is exercised across kinds. Also serve as the demo set.
const SAMPLES = [
  {
    name: "RC low-pass (AC)",
    deck: `* RC low-pass, fc ~ 1 kHz
V1 in 0 AC 1
R1 in out 1k
C1 out 0 159n
.ac dec 100 10 1meg
.end`,
  },
  {
    name: "Voltage divider (.op)",
    deck: `* 10 V divider -> ~3.33 V
V1 in 0 DC 10
R1 in out 2k
R2 out 0 1k
.op
.end`,
  },
  {
    name: "RC step (transient)",
    deck: `* RC step response, tau = 1 ms
V1 in 0 PULSE(0 1 0 1u 1u 5m 10m)
R1 in out 1k
C1 out 0 1u
.tran 10u 5m
.end`,
  },
];

export default function NetlistImport() {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState(null); // { analysis, summary, result, spiceErrors, deck }
  const fileRef = useRef(null);

  const onFile = useCallback((e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setText(String(reader.result || "")); setError(""); setRun(null); };
    reader.onerror = () => setError("Couldn't read that file.");
    reader.readAsText(file);
    e.target.value = ""; // allow re-selecting the same file
  }, []);

  const simulate = useCallback(async () => {
    if (running) return;
    setError("");
    setRun(null);

    const check = validateNetlist(text);
    if (!check.ok) { setError(check.message); return; }

    const deck = normalizeDeck(text);
    const analysis = detectAnalysis(deck);

    setRunning(true);
    let result;
    try {
      result = await runSpice(deck);
    } catch (e) {
      setRunning(false);
      const detail = (e && e.message ? String(e.message) : "").trim().slice(0, 160);
      setError(`The simulation couldn't run${detail ? ` (${detail})` : ""}. Check the netlist syntax and try again.`);
      return;
    }

    const spiceErrors = realErrors(result.errors);
    const nodeCount = Object.keys(result.nodes || {}).length;
    if (spiceErrors.length && nodeCount === 0) {
      setRunning(false);
      setError(`ngspice rejected the deck:\n${spiceErrors.slice(0, 4).join("\n")}`);
      return;
    }

    const summary = summarizeResult(result, analysis, { measureCutoff, measureGain, measureDC });
    setRun({ analysis, summary, result, spiceErrors, deck });
    setRunning(false);
  }, [text, running]);

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: "14px", overflowY: "auto", paddingRight: "4px" }}>
      <IntroCard />

      <div style={card}>
        <div style={cardHead}>
          <span style={{ fontSize: "var(--fs-body)", fontWeight: 600, color: "var(--text)" }}>Paste an ngspice netlist</span>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <input ref={fileRef} type="file" accept=".cir,.net,.sp,.txt,.spice" onChange={onFile} style={{ display: "none" }} />
            <button style={ghostBtn} onClick={() => fileRef.current && fileRef.current.click()}>Upload .cir / .net</button>
          </div>
        </div>

        <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setError(""); }}
            placeholder={"* paste a deck here\nV1 in 0 AC 1\nR1 in out 1k\nC1 out 0 159n\n.ac dec 100 10 1meg\n.end"}
            spellCheck={false}
            style={{
              width: "100%", minHeight: "190px", resize: "vertical",
              background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
              padding: "12px 14px", color: "var(--text)", fontSize: "13px", lineHeight: 1.5,
              fontFamily: "var(--font-mono, monospace)", outline: "none",
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.boxShadow = "0 0 0 3px var(--accent-soft)"; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
          />

          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center" }}>
            <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-3)", fontWeight: 600 }}>Examples:</span>
            {SAMPLES.map((s) => (
              <button key={s.name} style={chip} onClick={() => { setText(s.deck); setError(""); setRun(null); }}>{s.name}</button>
            ))}
          </div>

          {error && (
            <div style={{ color: "var(--danger)", fontSize: "var(--fs-sm)", lineHeight: 1.45, whiteSpace: "pre-wrap", fontFamily: /ngspice|simulation/.test(error) ? "var(--font-mono, monospace)" : undefined }}>
              {error}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              onClick={simulate}
              disabled={running}
              style={{
                background: running ? "var(--surface-2)" : "var(--accent)", border: "none", borderRadius: "var(--r-sm)",
                color: running ? "var(--text-3)" : "#fff", fontSize: "var(--fs-sm)", fontWeight: 600,
                padding: "10px 20px", cursor: running ? "progress" : "pointer",
              }}
            >
              {running ? "Simulating…" : "Verify in SPICE"}
            </button>
          </div>
        </div>
      </div>

      {run && <Results run={run} />}
    </div>
  );
}

function Results({ run }) {
  const { analysis, summary, result, spiceErrors, deck } = run;
  return (
    <>
      <div style={card}>
        <div style={{ ...cardHead, gap: "12px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "var(--fs-body)", fontWeight: 600, color: "var(--text)" }}>Measured response</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={badge}>{analysis ? analysis.label : "Result"}</span>
            <span style={{ fontSize: "var(--fs-sm)", color: "var(--success)", fontWeight: 600 }}>{summary.headline}</span>
          </span>
        </div>
        <div style={{ padding: "14px 16px", display: "flex", flexWrap: "wrap", gap: "14px 36px" }}>
          {summary.rows.map((r, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
              <span style={{ fontSize: "var(--fs-xs)", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>{r.label}</span>
              <span className="tnum" style={{ fontSize: "var(--fs-body)", fontWeight: 600, color: "var(--text)" }}>{r.value}</span>
            </div>
          ))}
        </div>
        {spiceErrors.length > 0 && (
          <div style={{ borderTop: "1px solid var(--border)", background: "var(--warn-soft)", padding: "10px 16px", fontSize: "var(--fs-xs)", color: "var(--warn)", whiteSpace: "pre-wrap", fontFamily: "var(--font-mono, monospace)" }}>
            {spiceErrors.slice(0, 4).join("\n")}
          </div>
        )}
      </div>

      <div style={card}>
        <div style={cardHead}><span style={{ fontSize: "var(--fs-body)", fontWeight: 600, color: "var(--text)" }}>Plot</span></div>
        <div style={{ padding: "12px 10px" }}>
          <ResultPlot result={result} height={300} />
        </div>
      </div>

      <details style={{ ...card, padding: "0" }}>
        <summary style={{ padding: "13px 16px", cursor: "pointer", fontSize: "var(--fs-sm)", fontWeight: 600, color: "var(--text-2)" }}>
          Deck sent to ngspice
        </summary>
        <pre style={{ margin: 0, padding: "0 16px 16px", fontSize: "12px", color: "var(--text-2)", fontFamily: "var(--font-mono, monospace)", whiteSpace: "pre-wrap" }}>{deck}</pre>
      </details>
    </>
  );
}

function IntroCard() {
  return (
    <div style={{ ...card, padding: "16px 18px" }}>
      <div style={{ fontSize: "var(--fs-h2)", fontWeight: 700, color: "var(--text)", marginBottom: "6px" }}>Verify any circuit</div>
      <div style={{ fontSize: "var(--fs-sm)", color: "var(--text-2)", lineHeight: 1.55, maxWidth: "70ch" }}>
        Paste or upload an ngspice deck and run it through the same in-browser SPICE engine AutoCDA uses to grade its own
        designs. The analysis type is detected from the deck — <code>.ac</code>, <code>.tran</code>, <code>.dc</code>, or <code>.op</code> — and the measured response is plotted. Not just generated circuits: yours too.
      </div>
    </div>
  );
}

const card = {
  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r)",
  boxShadow: "var(--shadow-sm)", overflow: "hidden", flexShrink: 0,
};
const cardHead = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "13px 16px", borderBottom: "1px solid var(--border)",
};
const ghostBtn = {
  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--r-sm)",
  color: "var(--text)", fontSize: "var(--fs-xs)", fontWeight: 600, padding: "7px 12px", cursor: "pointer",
};
const chip = {
  background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "999px",
  color: "var(--text-2)", fontSize: "var(--fs-xs)", padding: "5px 11px", cursor: "pointer",
};
const badge = {
  fontSize: "var(--fs-xs)", fontWeight: 600, padding: "3px 10px", borderRadius: "999px",
  background: "var(--accent-soft)", color: "var(--accent)",
};
