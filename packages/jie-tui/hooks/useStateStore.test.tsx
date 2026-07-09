import { useEffect } from "react";
import { Text } from "ink";
import { render } from "ink-testing-library";
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
});