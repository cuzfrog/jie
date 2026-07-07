import { TuiContext, useTuiContext, useFocusedAgent } from "./context";
import { makeContextValue, renderComponent } from "../test-harness";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

describe("TuiContext", () => {
  test("useTuiContext returns the provided value inside a Provider", () => {
    let captured: unknown = "sentinel";
    const Probe = (): null => {
      const ctx = useTuiContext();
      captured = ctx;
      return null;
    };
    const ctx = makeContextValue();
    const { unmount } = renderComponent(
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
    const { unmount } = renderComponent(
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
    const { unmount } = renderComponent(<Probe />);
    unmount();
  });
});