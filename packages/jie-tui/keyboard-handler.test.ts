import { createKeyboardHandler, type KeyboardHandlerDeps } from "./keyboard-handler";
import { Actions, createStateStore, type StateStore, type TuiState } from "./state";

interface DepsHandle {
  deps: KeyboardHandlerDeps;
  setState: (next: Partial<TuiState>) => void;
  interrupt: ReturnType<typeof vi.fn>;
  dispatch: ReturnType<typeof vi.fn>;
}

function makeDeps(): DepsHandle {
  const baseStore = createStateStore();
  let current: TuiState = baseStore.getState();
  const dispatch = vi.fn((action: Parameters<StateStore["dispatch"]>[0]) => {
    baseStore.dispatch(action);
    current = baseStore.getState();
  });
  const stateStore: StateStore = {
    getState: () => current,
    dispatch: (action) => { dispatch(action); },
    subscribe: vi.fn(() => (): void => undefined),
    getFocusedAgent: () => {
      if (current.focusedAgentId === null) return null;
      return current.agents.get(current.focusedAgentId) ?? null;
    },
    isBusy: () => {
      for (const agent of current.agents.values()) {
        if (agent.status === "busy") return true;
      }
      return false;
    },
  };
  const interrupt = vi.fn();
  const deps: KeyboardHandlerDeps = {
    platform: { interrupt },
    stateStore,
  };
  return {
    deps,
    setState: (next) => { current = { ...current, ...next }; },
    interrupt,
    dispatch,
  };
}

describe("createKeyboardHandler — Esc Esc interrupt", () => {
  test("Esc twice within window calls platform.interrupt(teamId, agentKey) for the focused agent", () => {
    const h = makeDeps();
    h.setState({
      teamId: "default",
      leaderAgentId: "default:general-1",
      focusedAgentId: "default:general-1",
      agents: new Map([["default:general-1", { agentId: "default:general-1", teamId: "default", agentKey: "general-1", role: "general", isLeader: true, status: "busy", model: null, queue: [], history: [], currentTurn: null, lastStopReason: null }]]),
    });
    const handler = createKeyboardHandler(h.deps, { now: () => 1000 });
    handler.handle("\x1b");
    handler.handle("\x1b");
    expect(h.interrupt).toHaveBeenCalledTimes(1);
    expect(h.interrupt).toHaveBeenCalledWith("default", "general-1");
  });

  test("Esc twice outside window does NOT call platform.interrupt()", () => {
    let t = 1000;
    const h = makeDeps();
    h.setState({
      teamId: "default",
      leaderAgentId: "default:general-1",
      focusedAgentId: "default:general-1",
      agents: new Map([["default:general-1", { agentId: "default:general-1", teamId: "default", agentKey: "general-1", role: "general", isLeader: true, status: "busy", model: null, queue: [], history: [], currentTurn: null, lastStopReason: null }]]),
    });
    const handler = createKeyboardHandler(h.deps, { now: () => t });
    handler.handle("\x1b");
    t = 2000;
    handler.handle("\x1b");
    expect(h.interrupt).not.toHaveBeenCalled();
  });

  test("Esc twice but no team loaded does NOT call platform.interrupt()", () => {
    const h = makeDeps();
    h.setState({ teamId: null });
    const handler = createKeyboardHandler(h.deps, { now: () => 1000 });
    handler.handle("\x1b");
    handler.handle("\x1b");
    expect(h.interrupt).not.toHaveBeenCalled();
  });

  test("Esc twice but no focused agent does NOT call platform.interrupt()", () => {
    const h = makeDeps();
    h.setState({ teamId: "default", focusedAgentId: null });
    const handler = createKeyboardHandler(h.deps, { now: () => 1000 });
    handler.handle("\x1b");
    handler.handle("\x1b");
    expect(h.interrupt).not.toHaveBeenCalled();
  });

  test("single Esc returns consume: false", () => {
    const h = makeDeps();
    const handler = createKeyboardHandler(h.deps, { now: () => 1000 });
    expect(handler.handle("\x1b")?.consume).toBe(false);
  });
});

describe("createKeyboardHandler — Ctrl+D×2 quit", () => {
  test("Ctrl+D twice within window dispatches requestQuit", () => {
    const h = makeDeps();
    const handler = createKeyboardHandler(h.deps, { now: () => 1000 });
    handler.handle("\x04");
    handler.handle("\x04");
    expect(h.dispatch).toHaveBeenCalledWith(Actions.requestQuit());
  });

  test("single Ctrl+D does NOT dispatch requestQuit", () => {
    const h = makeDeps();
    createKeyboardHandler(h.deps, { now: () => 1000 }).handle("\x04");
    expect(h.dispatch).not.toHaveBeenCalledWith(Actions.requestQuit());
  });

  test("Ctrl+D twice outside window does NOT dispatch requestQuit", () => {
    let t = 1000;
    const h = makeDeps();
    const handler = createKeyboardHandler(h.deps, { now: () => t });
    handler.handle("\x04");
    t = 2000;
    handler.handle("\x04");
    expect(h.dispatch).not.toHaveBeenCalledWith(Actions.requestQuit());
  });
});

describe("createKeyboardHandler — Ctrl+C", () => {
  test("Ctrl+C with non-empty editor dispatches setEditorText('') which clears via reducer", () => {
    const h = makeDeps();
    h.setState({ editorText: "hello" });
    const handler = createKeyboardHandler(h.deps);
    const out = handler.handle("\x03");
    expect(h.dispatch).toHaveBeenCalledWith(Actions.setEditorText(""));
    expect(out?.consume).toBe(true);
  });

  test("Ctrl+C with empty editor dispatches requestQuit", () => {
    const h = makeDeps();
    const handler = createKeyboardHandler(h.deps);
    const out = handler.handle("\x03");
    expect(h.dispatch).toHaveBeenCalledWith(Actions.requestQuit());
    expect(out?.consume).toBe(true);
  });
});

describe("createKeyboardHandler — default keymap", () => {
  test("shift+left dispatches toggleTeamRail", () => {
    const h = makeDeps();
    const handler = createKeyboardHandler(h.deps);
    const out = handler.handle("\x1b[1;2D");
    expect(h.dispatch).toHaveBeenCalledWith(Actions.toggleTeamRail());
    expect(out?.consume).toBe(true);
  });

  test("ctrl+up dispatches switchCycleAgent(-1)", () => {
    const h = makeDeps();
    createKeyboardHandler(h.deps).handle("\x1b[1;5A");
    expect(h.dispatch).toHaveBeenCalledWith(Actions.switchCycleAgent(-1));
  });

  test("shift+up dispatches switchCycleAgent(-1)", () => {
    const h = makeDeps();
    createKeyboardHandler(h.deps).handle("\x1b[1;2A");
    expect(h.dispatch).toHaveBeenCalledWith(Actions.switchCycleAgent(-1));
  });

  test("shift+down dispatches switchCycleAgent(1)", () => {
    const h = makeDeps();
    createKeyboardHandler(h.deps).handle("\x1b[1;2B");
    expect(h.dispatch).toHaveBeenCalledWith(Actions.switchCycleAgent(1));
  });

  test("unmatched key returns undefined", () => {
    const h = makeDeps();
    expect(createKeyboardHandler(h.deps).handle("plain text")).toBeUndefined();
  });
});
