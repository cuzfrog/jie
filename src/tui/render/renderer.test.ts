import { Actions, type StateStore, type TuiState } from "../state";
import { makeAgentUiState, makeTuiState } from "../test";
import type { TuiRoot } from "../types";
import type { TerminalTitle } from "./terminal-title";
import { TuiRendererImpl } from "./renderer";

const INERT_ACTION = Actions.setEnvironment("/tmp", "main", false, "");
const state: TuiState = makeTuiState({});
const unsubscribe = vi.fn();
const stateStore = vi.mocked<StateStore>({
  getState: vi.fn(),
  dispatch: vi.fn(),
  subscribe: vi.fn(() => unsubscribe),
});
const requestRender = vi.fn();
const root = vi.mocked<TuiRoot>({ update: vi.fn() });
const terminalTitle = vi.mocked<TerminalTitle>({
  start: vi.fn(),
  stop: vi.fn(),
});

function notify(): Promise<void> {
  const listener = stateStore.subscribe.mock.calls[0]![0];
  return listener(INERT_ACTION, state, state);
}

function newRenderer(renderTickMs?: number, transientTtlMs?: number): TuiRendererImpl {
  return new TuiRendererImpl(stateStore, requestRender, root, terminalTitle, renderTickMs, transientTtlMs);
}

describe("TuiRendererImpl", () => {
  test("start subscribes to the state store and starts the terminal title", () => {
    const renderer = newRenderer();
    renderer.start();
    expect(stateStore.subscribe).toHaveBeenCalledTimes(1);
    expect(terminalTitle.start).toHaveBeenCalledTimes(1);
    renderer.stop();
  });

  test("requests a render when the root is dirty after a state change", async () => {
    const renderer = newRenderer();
    renderer.start();
    root.update.mockReturnValue(true);
    await notify();
    expect(requestRender).toHaveBeenCalledTimes(1);
    renderer.stop();
  });

  test("skips rendering when the root is not dirty", async () => {
    const renderer = newRenderer();
    renderer.start();
    root.update.mockReturnValue(false);
    await notify();
    expect(requestRender).not.toHaveBeenCalled();
    renderer.stop();
  });

  test("stop unsubscribes and stops the terminal title", () => {
    const renderer = newRenderer();
    renderer.start();
    renderer.stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(terminalTitle.stop).toHaveBeenCalledTimes(1);
  });

  test("does not render before start", () => {
    newRenderer();
    root.update.mockReturnValue(true);
    expect(requestRender).not.toHaveBeenCalled();
  });

  test("tick dispatches clearTransientMessage once the TTL has elapsed", () => {
    const now = 1000;
    vi.useFakeTimers({ now });
    const renderer = newRenderer(10, 50);
    renderer.start();
    stateStore.getState.mockReturnValue(makeTuiState({ transientMessage: "hello", transientSetAt: now }));
    vi.advanceTimersByTime(60);
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.clearTransientMessage());
    renderer.stop();
    vi.useRealTimers();
  });

  test("tick does not clear a fresh transient message", () => {
    const now = 1000;
    vi.useFakeTimers({ now });
    const renderer = newRenderer(10, 50);
    renderer.start();
    stateStore.getState.mockReturnValue(makeTuiState({ transientMessage: "hello", transientSetAt: now }));
    vi.advanceTimersByTime(20);
    expect(stateStore.dispatch).not.toHaveBeenCalledWith(Actions.clearTransientMessage());
    renderer.stop();
    vi.useRealTimers();
  });

  test("tick requests a render while an agent is busy or thinking", () => {
    vi.useFakeTimers();
    const renderer = newRenderer(10);
    renderer.start();
    stateStore.getState.mockReturnValue(makeTuiState({
      agents: new Map([["t:a", makeAgentUiState("t:a", { isLeader: true, status: "busy" })]]),
      focusedAgentId: "t:a",
      leaderAgentId: "t:a",
    }));
    vi.advanceTimersByTime(10);
    expect(requestRender).toHaveBeenCalled();
    renderer.stop();
    vi.useRealTimers();
  });
});
