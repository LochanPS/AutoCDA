import React, { useEffect, useRef } from "react";

const CIRCUITS = [
  { id: "rc_lowpass", prompt: "Design a low-pass RC filter with cutoff frequency 1 kHz" },
  { id: "rc_highpass", prompt: "Design a high-pass RC filter with cutoff frequency 500 Hz" },
  { id: "voltage_divider", prompt: "Design a voltage divider to step down 12V to 5V" },
  { id: "led_limiter", prompt: "Design an LED current limiter circuit for 5V supply and 20mA LED current" },
  { id: "common_emitter", prompt: "Design a common emitter BJT amplifier with voltage gain of 20" },
];

export default function ChatPanel({ messages, onSelectCircuit, loading }) {
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 0 }}>
      {/* Chat history */}
      <div style={{
        flex: "1 1 auto",
        overflowY: "auto",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        minHeight: 0,
      }}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            display: "flex",
            flexDirection: "column",
            alignItems: msg.role === "user" ? "flex-end" : "flex-start",
          }}>
            <div style={{
              fontSize: "10px",
              color: "#8b949e",
              marginBottom: "4px",
              fontFamily: "'Segoe UI', system-ui, sans-serif",
              paddingLeft: msg.role === "user" ? 0 : "4px",
              paddingRight: msg.role === "user" ? "4px" : 0,
            }}>
              {msg.role === "user" ? "YOU" : "AutoCDA"}
            </div>
            <div style={{
              maxWidth: "88%",
              padding: "10px 14px",
              borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
              background: msg.role === "user" ? "#1f6feb" : "#21262d",
              color: "#e6edf3",
              fontSize: "13px",
              lineHeight: "1.5",
              fontFamily: "'Segoe UI', system-ui, sans-serif",
              border: msg.role === "user" ? "none" : "1px solid #30363d",
            }}>
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Divider */}
      <div style={{ borderTop: "1px solid #30363d", margin: "0 16px" }} />

      {/* Processing log label */}
      <div style={{
        padding: "10px 16px 6px",
        fontSize: "10px",
        letterSpacing: "0.08em",
        color: "#8b949e",
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        fontWeight: 600,
      }}>
        PROCESSING LOG
      </div>

      {/* Prompt buttons label */}
      <div style={{
        padding: "0 16px 6px",
        fontSize: "10px",
        letterSpacing: "0.08em",
        color: "#8b949e",
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        fontWeight: 600,
      }}>
        SELECT A CIRCUIT REQUEST
      </div>

      {/* Prompt buttons */}
      <div style={{
        padding: "0 16px 16px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        flexShrink: 0,
      }}>
        {CIRCUITS.map((c) => (
          <button
            key={c.id}
            onClick={() => !loading && onSelectCircuit(c.id)}
            disabled={loading}
            style={{
              background: loading ? "#1a1f27" : "#1c2128",
              border: "1px solid #30363d",
              borderRadius: "10px",
              padding: "10px 14px",
              color: loading ? "#484f58" : "#e6edf3",
              fontFamily: "'JetBrains Mono', 'Courier New', monospace",
              fontSize: "12px",
              textAlign: "left",
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "8px",
              transition: "border-color 0.2s, background 0.2s",
              lineHeight: "1.4",
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.borderColor = "#58a6ff";
                e.currentTarget.style.background = "#1f2937";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#30363d";
              e.currentTarget.style.background = loading ? "#1a1f27" : "#1c2128";
            }}
          >
            <span style={{ flex: 1 }}>{c.prompt}</span>
            <span style={{ color: "#58a6ff", flexShrink: 0, fontSize: "14px" }}>→</span>
          </button>
        ))}
      </div>
    </div>
  );
}
