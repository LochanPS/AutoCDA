import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react-dom/test-utils";
import ErrorBoundary from "./ErrorBoundary";

// A child that throws on render when `boom` is true.
function Boom({ boom }) {
  if (boom) throw new Error("kaboom in a panel");
  return <div>panel ok</div>;
}

describe("ErrorBoundary", () => {
  let container;
  let errSpy;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    // React logs caught errors to console.error; silence it for clean output.
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errSpy.mockRestore();
    container.remove();
  });

  test("renders children normally when nothing throws", () => {
    const root = createRoot(container);
    act(() => { root.render(<ErrorBoundary><Boom boom={false} /></ErrorBoundary>); });
    expect(container.textContent).toContain("panel ok");
    act(() => root.unmount());
  });

  test("a render crash shows the calm fallback, not a blank screen", () => {
    const root = createRoot(container);
    act(() => { root.render(<ErrorBoundary><Boom boom={true} /></ErrorBoundary>); });
    // Calm, specific fallback — never empty.
    expect(container.textContent).toContain("This design couldn't be displayed");
    expect(container.textContent).toContain("Start over");
    expect(container.querySelector("[role='alert']")).not.toBeNull();
    act(() => root.unmount());
  });

  test("changing resetKey clears a live error and re-renders children", () => {
    const root = createRoot(container);
    act(() => { root.render(<ErrorBoundary resetKey="a"><Boom boom={true} /></ErrorBoundary>); });
    expect(container.textContent).toContain("This design couldn't be displayed");

    // New content swapped in with a fresh key → boundary recovers.
    act(() => { root.render(<ErrorBoundary resetKey="b"><Boom boom={false} /></ErrorBoundary>); });
    expect(container.textContent).toContain("panel ok");
    expect(container.textContent).not.toContain("This design couldn't be displayed");
    act(() => root.unmount());
  });

  test("Start over calls onReset", () => {
    const onReset = vi.fn();
    const root = createRoot(container);
    act(() => { root.render(<ErrorBoundary onReset={onReset}><Boom boom={true} /></ErrorBoundary>); });
    const btn = container.querySelector("button");
    act(() => { btn.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(onReset).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });
});
