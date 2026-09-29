import React, { useState, useEffect, useRef } from "react";

export default function ProcessingLog({ steps, active }) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [done, setDone] = useState(false);
  const logEndRef = useRef(null);

  useEffect(() => {
    setVisibleCount(0);
    setDone(false);
    if (!steps || steps.length === 0) return;

    let i = 0;
    const tick = () => {
      i += 1;
      setVisibleCount(i);
      if (i < steps.length) {
        setTimeout(tick, 120);
      } else {
        setTimeout(() => setDone(true), 120);
      }
    };
    setTimeout(tick, 120);
  }, [steps]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleCount, done]);

  return (
    <div style={{
      flex: "0 0 auto",
      background: "#eef1f5",
      border: "1px solid #dce1e7",
      borderRadius: "8px",
      margin: "0 16px 12px",
      padding: "12px",
      overflowY: "auto",
      maxHeight: "200px",
      minHeight: "120px",
    }}>
      <div style={{
        fontSize: "10px",
        letterSpacing: "0.08em",
        color: "#5b6774",
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        fontWeight: 600,
        marginBottom: "8px",
      }}>
        PROCESSING LOG
      </div>
      {(!steps || steps.length === 0) && (
        <div style={{ color: "#9aa4b0", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px" }}>
          Awaiting input...
        </div>
      )}
      {steps && steps.slice(0, visibleCount).map((step, i) => (
        <div key={i} style={{
          color: "#1a7f42",
          fontFamily: "'JetBrains Mono', 'Courier New', monospace",
          fontSize: "12px",
          lineHeight: "1.8",
          whiteSpace: "pre-wrap",
        }}>
          {step}
        </div>
      ))}
      {steps && visibleCount > 0 && !done && (
        <span style={{
          color: "#1a7f42",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "12px",
          animation: "blink 1s step-end infinite",
        }}>█</span>
      )}
      {done && steps && steps.length > 0 && (
        <div style={{
          color: "#1a7f42",
          fontFamily: "'JetBrains Mono', 'Courier New', monospace",
          fontSize: "12px",
          lineHeight: "1.8",
          fontWeight: 600,
        }}>
          [COMPLETE] Circuit ready for display.
        </div>
      )}
      <div ref={logEndRef} />
      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </div>
  );
}
