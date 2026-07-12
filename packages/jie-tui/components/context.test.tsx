import { Component, type ReactNode } from "react";
import { render } from "../test-renderer";
import { TuiContext, useTuiContext, useFocusedAgent } from "./context";
import { makeContextValue } from "../test-support";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

interface BoundaryProps {
  readonly children: ReactNode;
  readonly onError: (err: Error) => void;
}

class Boundary extends Component<BoundaryProps, { readonly error: Error | null }> {
  override state: { readonly error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error): { readonly error: Error } {
    return { error };
  }
  override componentDidCatch(error: Error): void {
    this.props.onError(error);
  }
  override render(): ReactNode {
    if (this.state.error !== null) return null;
    return this.props.children;
  }
}

describe("TuiContext", () => {
  test("useTuiContext returns the provided value inside a Provider", () => {
    let captured: unknown = "sentinel";
    const Probe = (): null => {
      const ctx = useTuiContext();
      captured = ctx;
      return null;
    };
    const ctx = makeContextValue();
    const { unmount } = render(
      <TuiContext.Provider value={ctx}>
        <Probe />
      </TuiContext.Provider>,
    );
    expect(captured).toBe(ctx);
    unmount();
  });

  test("useFocusedAgent returns null when no focused agent", () => {
    let captured: string | null = "sentinel";
    const Probe = (): null => {
      const focused = useFocusedAgent();
      captured = focused === null ? "null" : "set";
      return null;
    };
    const ctx = makeContextValue();
    const { unmount } = render(
      <TuiContext.Provider value={ctx}>
        <Probe />
      </TuiContext.Provider>,
    );
    expect(captured).toBe("null");
    unmount();
  });

  test("useTuiContext throws when no provider is mounted", () => {
    const Probe = (): null => {
      useTuiContext();
      return null;
    };
    const caught: { value: Error | null } = { value: null };
    const originalConsoleError = console.error;
    console.error = (): void => undefined;
    let unmountFn: (() => void) | null = null;
    try {
      const result = render(
        <Boundary onError={(e) => { caught.value = e; }}>
          <Probe />
        </Boundary>,
      );
      unmountFn = result.unmount;
    } finally {
      console.error = originalConsoleError;
    }
    expect(caught.value).not.toBeNull();
    if (caught.value === null) throw new Error("unreachable");
    expect(caught.value.message).toBe("TuiContext is not provided; wrap your tree in <TuiContext.Provider>");
    unmountFn?.();
  });
});