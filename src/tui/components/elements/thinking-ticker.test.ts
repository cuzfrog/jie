import { Actions, type StateStore, type TuiState } from "../../state";
import { makeAgentUiState, makeTuiState } from "../../test";
import { ThinkingTickerImpl } from "./thinking-ticker";

type Listener = Parameters<StateStore["subscribe"]>[0];

function thinkingState(): TuiState {
  const agent = makeAgentUiState("demo:general-1", {
    status: "busy",
    currentTurn: { userPrompt: "q", cards: [], blocks: [{ kind: "thinking", text: "pondering" }], streamId: 1, seq: 0 },
  });
  return makeTuiState({ agents: new Map([["demo:general-1", agent]]) });
}

function stampedState(): TuiState {
  const agent = makeAgentUiState("demo:general-1", {
    status: "busy",
    currentTurn: { userPrompt: "q", cards: [], blocks: [{ kind: "thinking", text: "pondering", durationMs: 300 }], streamId: 1, seq: 0 },
  });
  return makeTuiState({ agents: new Map([["demo:general-1", agent]]) });
}

function createMockStateStore(): { readonly store: StateStore; readonly notify: (state: TuiState) => void } {
  let listener: Listener | null = null;
  let current = makeTuiState();
  const store = vi.mocked<StateStore>({
    getState: () => current,
    dispatch: vi.fn(),
    subscribe: (next) => {
      listener = next;
      return (): void => {
        listener = null;
      };
    },
  });
  const notify = (state: TuiState): void => {
    current = state;
    if (listener !== null) void listener(Actions.setEditorText(""), state, state);
  };
  return { store, notify };
}

describe("ThinkingTicker", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("does not tick while no agent is thinking", () => {
    const { store } = createMockStateStore();
    const requestRender = vi.fn();
    const ticker = new ThinkingTickerImpl(store, requestRender, 100);
    ticker.update();
    vi.advanceTimersByTime(500);
    expect(requestRender).not.toHaveBeenCalled();
    ticker.stop();
  });

  test("ticks periodically once an agent starts thinking", () => {
    const { store, notify } = createMockStateStore();
    const requestRender = vi.fn();
    const ticker = new ThinkingTickerImpl(store, requestRender, 100);
    ticker.update();
    notify(thinkingState());
    ticker.update();
    vi.advanceTimersByTime(350);
    expect(requestRender).toHaveBeenCalledTimes(3);
    ticker.stop();
  });

  test("stops ticking once the thinking block is stamped with a duration", () => {
    const { store, notify } = createMockStateStore();
    const requestRender = vi.fn();
    const ticker = new ThinkingTickerImpl(store, requestRender, 100);
    ticker.update();
    notify(thinkingState());
    ticker.update();
    vi.advanceTimersByTime(150);
    expect(requestRender).toHaveBeenCalledTimes(1);
    notify(stampedState());
    ticker.update();
    vi.advanceTimersByTime(1000);
    expect(requestRender).toHaveBeenCalledTimes(1);
    ticker.stop();
  });

  test("restarts ticking when thinking resumes after stopping", () => {
    const { store, notify } = createMockStateStore();
    const requestRender = vi.fn();
    const ticker = new ThinkingTickerImpl(store, requestRender, 100);
    ticker.update();
    notify(thinkingState());
    ticker.update();
    notify(stampedState());
    ticker.update();
    vi.advanceTimersByTime(1000);
    expect(requestRender).not.toHaveBeenCalled();
    notify(thinkingState());
    ticker.update();
    vi.advanceTimersByTime(250);
    expect(requestRender).toHaveBeenCalledTimes(2);
    ticker.stop();
  });

  test("stop clears the timer", () => {
    const { store, notify } = createMockStateStore();
    const requestRender = vi.fn();
    const ticker = new ThinkingTickerImpl(store, requestRender, 100);
    ticker.update();
    notify(thinkingState());
    ticker.update();
    vi.advanceTimersByTime(150);
    const callsBefore = requestRender.mock.calls.length;
    ticker.stop();
    vi.advanceTimersByTime(1000);
    expect(requestRender.mock.calls.length).toBe(callsBefore);
  });
});
