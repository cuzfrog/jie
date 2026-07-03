import { createKeyboardHandler, type KeyboardHandlerDeps } from "./keyboard-handler";
import { Actions, createStateStore, type StateStore, type TuiState } from "./state";
import { createEventManager, type EventManager } from "@cuzfrog/jie-platform/event";

interface DepsHandle {
  deps: KeyboardHandlerDeps;
  setState: (next: Partial<TuiState>) => void;
  eventManager: EventManager;
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
  const eventManager: EventManager = createEventManager();
  const deps: KeyboardHandlerDeps = {
    eventManager,
    stateStore,
  };
  return {
    deps,
    setState: (next) => { current = { ...current, ...next }; },
    eventManager,
    dispatch,
  };
}

describe("createKeyboardHandler — Esc Esc interrupt", () => {
  test("Esc twice within window publishes interrupt", () => {
    const h = makeDeps();
    h.setState({ teamId: "default" });
    const handler = createKeyboardHandler(h.deps, { now: () => 1000 });
    const published: Array<{ topic: string }> = [];
    h.eventManager.subscribe("system.interrupted", (e) => published.push({ topic: e.topic }));
    handler.handle("\x1b");
    handler.handle("\x1b");
    expect(published).toHaveLength(1);
  });

  test("Esc twice outside window does NOT publish", () => {
    let t = 1000;
    const h = makeDeps();
    h.setState({ teamId: "default" });
    const handler = createKeyboardHandler(h.deps, { now: () => t });
    const published: Array<{ topic: string }> = [];
    h.eventManager.subscribe("system.interrupted", (e) => published.push({ topic: e.topic }));
    handler.handle("\x1b");
    t = 2000;
    handler.handle("\x1b");
    expect(published).toHaveLength(0);
  });

  test("Esc twice but no team loaded does NOT publish", () => {
    const h = makeDeps();
    h.setState({ teamId: null });
    const handler = createKeyboardHandler(h.deps, { now: () => 1000 });
    const published: Array<{ topic: string }> = [];
    h.eventManager.subscribe("system.interrupted", (e) => published.push({ topic: e.topic }));
    handler.handle("\x1b");
    handler.handle("\x1b");
    expect(published).toHaveLength(0);
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
  test("Ctrl+C dispatches requestRender", () => {
    const h = makeDeps();
    const handler = createKeyboardHandler(h.deps);
    const out = handler.handle("\x03");
    expect(h.dispatch).toHaveBeenCalledWith(Actions.requestRender());
    expect(out?.consume).toBe(true);
  });
});

describe("createKeyboardHandler — default keymap", () => {
  test("ctrl+left dispatches toggleTeamRail", () => {
    const h = makeDeps();
    const handler = createKeyboardHandler(h.deps);
    const out = handler.handle("\x1b[1;5D");
    expect(h.dispatch).toHaveBeenCalledWith(Actions.toggleTeamRail());
    expect(out?.consume).toBe(true);
  });

  test("ctrl+up dispatches switchCycleAgent(-1)", () => {
    const h = makeDeps();
    createKeyboardHandler(h.deps).handle("\x1b[1;5A");
    expect(h.dispatch).toHaveBeenCalledWith(Actions.switchCycleAgent(-1));
  });

  test("unmatched key returns undefined", () => {
    const h = makeDeps();
    expect(createKeyboardHandler(h.deps).handle("plain text")).toBeUndefined();
  });
});
