import React from "react";

/**
 * ErrorBoundary — catches render-time crashes in its subtree and shows a calm,
 * specific fallback instead of letting the whole app unmount to a blank screen.
 *
 * React error boundaries must be class components; this is the only class in
 * the UI. It catches errors thrown while *rendering* children (a malformed
 * circuit, a charting edge case, a bad measurement array). It does NOT catch
 * errors in event handlers or async callbacks — those are handled where they
 * happen (see App.runDesign's try/catch).
 *
 * Props:
 *   resetKey   — when this value changes, a live error is cleared automatically
 *                (so a fresh, good run recovers without a manual reset).
 *   onReset()  — called by the fallback's "Start over" button.
 *   fallback(error, reset) — optional custom renderer; a default is provided.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Record for debugging; never re-throw — that would blank the screen.
    // eslint-disable-next-line no-console
    console.error("Results area render failed:", error, info && info.componentStack);
  }

  componentDidUpdate(prevProps) {
    // New content swapped in (e.g. a new circuit) → clear the stale error.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  handleReset = () => {
    this.setState({ error: null });
    if (this.props.onReset) this.props.onReset();
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.handleReset);
      return <DefaultFallback error={this.state.error} onReset={this.handleReset} />;
    }
    return this.props.children;
  }
}

function DefaultFallback({ error, onReset }) {
  const detail = (error && error.message ? String(error.message) : "").trim().slice(0, 160);
  return (
    <div
      role="alert"
      style={{
        flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", textAlign: "center", padding: "24px", gap: "14px",
      }}
    >
      <div style={{ color: "var(--warn)", display: "inline-flex" }}>
        <svg width={32} height={32} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 2.2L14.4 13H1.6L8 2.2z" /><path d="M8 6.6v3" /><path d="M8 11.6h.01" />
        </svg>
      </div>
      <div style={{ fontSize: "var(--fs-h2)", fontWeight: 600, color: "var(--text)" }}>
        This design couldn't be displayed
      </div>
      <p style={{ fontSize: "var(--fs-sm)", color: "var(--text-2)", maxWidth: "44ch", lineHeight: 1.55, margin: 0 }}>
        Something went wrong while drawing these results. Your other work is safe —
        start over and try a different circuit or value.
      </p>
      {detail && (
        <code style={{ fontSize: "var(--fs-xs)", color: "var(--text-3)", fontFamily: "var(--font-mono)", maxWidth: "48ch", wordBreak: "break-word" }}>
          {detail}
        </code>
      )}
      <button
        onClick={onReset}
        style={{
          background: "var(--accent)", border: "none", borderRadius: "var(--r-sm)",
          color: "#fff", fontSize: "var(--fs-sm)", fontWeight: 600, padding: "9px 18px", cursor: "pointer",
        }}
      >
        Start over
      </button>
    </div>
  );
}
