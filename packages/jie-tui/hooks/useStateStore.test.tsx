import { useEffect, type JSX } from "react";
import { Text } from "@cuzfrog/jie-ink";
import { render } from "../test-renderer";
import { Actions, createStateStore } from "../state";
import { useStateStore } from "./useStateStore";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

const FLUSH_EFFECTS_MS = 10;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe("useStateStore", () => {
  test("returns the initial snapshot from stateStore.getState()", () => {
    const stateStore = createStateStore();
    let captured: ReturnType<typeof useStateStore> | null = null;
    const Probe = (): null => {
      captured = useStateStore(stateStore);
      return null;
    };
    const { unmount } = render(<Probe />);
    expect(captured).not.toBeNull();
    expect(captured!.state).toBe(stateStore.getState());
    unmount();
  });

  test("dispatch routes back to the same stateStore", () => {
    const stateStore = createStateStore();
    let captured: ReturnType<typeof useStateStore> | null = null;
    const Probe = (): null => {
      captured = useStateStore(stateStore);
      return null;
    };
    const { unmount } = render(<Probe />);
    captured!.dispatch(Actions.toggleThinking());
    expect(stateStore.getState().thinkingExpanded).toBe(true);
    unmount();
  });

  test("snapshot re-renders after the store mutates", async () => {
    const stateStore = createStateStore();
    const Probe = (): JSX.Element => {
      const { state } = useStateStore(stateStore);
      return <Text>{state.thinkingExpanded ? "open" : "closed"}</Text>;
    };
    const { lastFrame, unmount } = render(<Probe />);
    await sleep(FLUSH_EFFECTS_MS);
    expect(lastFrame()).toContain("closed");
    stateStore.dispatch(Actions.toggleThinking());
    await sleep(FLUSH_EFFECTS_MS);
    expect(lastFrame()).toContain("open");
    unmount();
  });

  test("unsubscribes on unmount", async () => {
    const stateStore = createStateStore();
    const unsubscribeSpy = vi.spyOn(stateStore, "subscribe");
    const Probe = (): null => {
      useStateStore(stateStore);
      useEffect(() => (): void => undefined, []);
      return null;
    };
    const { unmount } = render(<Probe />);
    await sleep(FLUSH_EFFECTS_MS);
    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
    unmount();
  });

  test("dispatch is referentially stable across re-renders", async () => {
    // Consumers (e.g. <Editor>) rely on dispatch having a stable identity so
    // that useCallback-wrapped handlers don't churn on every state update.
    // Re-render the hook by dispatching through it; the returned dispatch
    // reference must not change.
    const stateStore = createStateStore();
    const dispatches: Array<ReturnType<typeof useStateStore>["dispatch"]> = [];
    const Probe = (): null => {
      const { dispatch } = useStateStore(stateStore);
      dispatches.push(dispatch);
      return null;
    };
    const { unmount, rerender } = render(<Probe />);
    await sleep(FLUSH_EFFECTS_MS);
    stateStore.dispatch(Actions.toggleThinking());
    await sleep(FLUSH_EFFECTS_MS);
    rerender(<Probe />);
    await sleep(FLUSH_EFFECTS_MS);
    expect(dispatches.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < dispatches.length; i++) {
      expect(dispatches[i]).toBe(dispatches[0]);
    }
    unmount();
  });
});