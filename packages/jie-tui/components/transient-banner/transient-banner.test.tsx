import { render } from "../../test-renderer";
import { TransientBanner, _TRANSIENT_TTL_MS } from "./transient-banner";
import { TuiContext } from "../context";
import { Actions, createStateStore } from "../../state";
import { makeContextValue } from "../../test-support";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;
declare const beforeEach: (fn: () => void) => void;
declare const afterEach: (fn: () => void) => void;

const TRANSIENT_TTL_MS = _TRANSIENT_TTL_MS;

async function advanceTimers(ms: number): Promise<void> {
  vi.advanceTimersByTime(ms);
}

describe("TransientBanner", () => {
  test("renders the transient message text when state.transientMessage is set", () => {
    const store = createStateStore();
    store.dispatch(Actions.setTransientMessage("logged in to nvidia"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><TransientBanner /></TuiContext.Provider>,
    );
    expect(lastFrame() ?? "").toContain("logged in to nvidia");
    unmount();
  });

  test("does not render anything when state.transientMessage is null", () => {
    const store = createStateStore();
    const ctx = makeContextValue({ stateStore: store });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><TransientBanner /></TuiContext.Provider>,
    );
    const frame = lastFrame() ?? "";
    expect(frame).not.toContain("logged in");
    expect(frame).not.toContain("✓");
    unmount();
  });

  test("does not render an empty banner when state.transientMessage is the empty string", () => {
    const store = createStateStore();
    store.dispatch(Actions.setTransientMessage(""));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><TransientBanner /></TuiContext.Provider>,
    );
    const frame = lastFrame() ?? "";
    expect(frame).not.toContain("✓");
    unmount();
  });

  test("uses the 'success' color token for the transient message text", () => {
    const store = createStateStore();
    store.dispatch(Actions.setTransientMessage("ok"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><TransientBanner /></TuiContext.Provider>,
    );
    expect(lastFrame() ?? "").toMatch(/\[32m/);
    unmount();
  });
});

describe("TransientBanner auto-clear", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("dispatches clearTransientMessage after TRANSIENT_TTL_MS", async () => {
    const store = createStateStore();
    store.dispatch(Actions.setTransientMessage("ok"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { unmount, waitUntilRenderFlush } = render(
      <TuiContext.Provider value={ctx}><TransientBanner /></TuiContext.Provider>,
    );
    await waitUntilRenderFlush();
    expect(store.getState().transientMessage).toBe("ok");
    await advanceTimers(TRANSIENT_TTL_MS - 1);
    expect(store.getState().transientMessage).toBe("ok");
    await advanceTimers(2);
    expect(store.getState().transientMessage).toBeNull();
    unmount();
  });

  test("changing the message text cancels the old timer via key remount", async () => {
    const store = createStateStore();
    store.dispatch(Actions.setTransientMessage("first"));
    const ctx1 = makeContextValue({ stateStore: store, state: store.getState() });
    const { rerender, unmount, waitUntilRenderFlush } = render(
      <TuiContext.Provider value={ctx1}><TransientBanner /></TuiContext.Provider>,
    );
    await waitUntilRenderFlush();
    await advanceTimers(3000);
    store.dispatch(Actions.setTransientMessage("second"));
    const ctx2 = makeContextValue({ stateStore: store, state: store.getState() });
    rerender(
      <TuiContext.Provider value={ctx2}><TransientBanner /></TuiContext.Provider>,
    );
    await waitUntilRenderFlush();
    await advanceTimers(1500);
    expect(store.getState().transientMessage).toBe("second");
    await advanceTimers(3501);
    expect(store.getState().transientMessage).toBeNull();
    unmount();
  });

  test("cancels the pending timer when unmounted", async () => {
    const store = createStateStore();
    store.dispatch(Actions.setTransientMessage("ok"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { unmount, waitUntilRenderFlush } = render(
      <TuiContext.Provider value={ctx}><TransientBanner /></TuiContext.Provider>,
    );
    await waitUntilRenderFlush();
    unmount();
    await advanceTimers(TRANSIENT_TTL_MS + 100);
    expect(store.getState().transientMessage).toBe("ok");
  });
});
