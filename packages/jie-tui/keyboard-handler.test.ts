import { createKeyboardHandler, type KeyboardHandler, type KeyboardHandlerDeps } from "./keyboard-handler";
import { Actions, INITIAL_TUI_STATE, type StateStore, type TuiState } from "./state";
import { createEventManager, type EventManager } from "@cuzfrog/jie-platform/event";

interface DepsHandle {
  deps: KeyboardHandlerDeps;
  setState: (next: Partial<TuiState>) => void;
  eventManager: EventManager;
  dispatch: ReturnType<typeof vi.fn>;
  confirmQuit: ReturnType<typeof vi.fn>;
  cancelQuit: ReturnType<typeof vi.fn>;
  requestQuit: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
}

function makeDeps(): DepsHandle {
  let current: TuiState = { ...INITIAL_TUI_STATE, agents: new Map(INITIAL_TUI_STATE.agents) };
  const dispatch = vi.fn();
  const stateStore: StateStore = {
    getState: () => current,
    dispatch: (action) => { dispatch(action); },
    subscribe: vi.fn(() => (): void => undefined),
  };
  const confirmQuit = vi.fn(() => { current = { ...current, pendingQuit: false }; });
  const cancelQuit = vi.fn(() => { current = { ...current, pendingQuit: false }; });
  const requestQuit = vi.fn();
  const render = vi.fn();
  const eventManager: EventManager = createEventManager();
  const deps: KeyboardHandlerDeps = {
    eventManager,
    stateStore,
    confirmQuit,
    cancelQuit,
    requestQuit,
    render,
  };
  return {
    deps,
    setState: (next) => { current = { ...current, ...next }; },
    eventManager,
    dispatch,
    confirmQuit,
    cancelQuit,
    requestQuit,
    render,
  };
}

describe("createKeyboardHandler — pendingQuit branch", () => {
  test("'y' calls confirmQuit", () => {
    const h = makeDeps();
    h.setState({ pendingQuit: true });
    const handler: KeyboardHandler = createKeyboardHandler(h.deps);
    const out = handler.handle("y");
    expect(h.confirmQuit).toHaveBeenCalledTimes(1);
    expect(out?.consume).toBe(true);
  });

  test("'Y' (uppercase) also calls confirmQuit", () => {
    const h = makeDeps();
    h.setState({ pendingQuit: true });
    createKeyboardHandler(h.deps).handle("Y");
    expect(h.confirmQuit).toHaveBeenCalledTimes(1);
  });

  test("'n' calls cancelQuit", () => {
    const h = makeDeps();
    h.setState({ pendingQuit: true });
    const handler = createKeyboardHandler(h.deps);
    const out = handler.handle("n");
    expect(h.cancelQuit).toHaveBeenCalledTimes(1);
    expect(out?.consume).toBe(true);
  });

  test("Enter calls cancelQuit", () => {
    const h = makeDeps();
    h.setState({ pendingQuit: true });
    createKeyboardHandler(h.deps).handle("\r");
    expect(h.cancelQuit).toHaveBeenCalledTimes(1);
  });

  test("an unrelated key while pendingQuit does NOT call confirm/cancel and falls through", () => {
    const h = makeDeps();
    h.setState({ pendingQuit: true });
    const out = createKeyboardHandler(h.deps).handle("x");
    expect(h.confirmQuit).not.toHaveBeenCalled();
    expect(h.cancelQuit).not.toHaveBeenCalled();
    expect(h.dispatch).not.toHaveBeenCalled();
    expect(out).toBeUndefined();
  });
});

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
  test("Ctrl+D twice within window calls requestQuit", () => {
    const h = makeDeps();
    const handler = createKeyboardHandler(h.deps, { now: () => 1000 });
    handler.handle("\x04");
    handler.handle("\x04");
    expect(h.requestQuit).toHaveBeenCalledTimes(1);
  });

  test("single Ctrl+D does NOT call requestQuit", () => {
    const h = makeDeps();
    createKeyboardHandler(h.deps, { now: () => 1000 }).handle("\x04");
    expect(h.requestQuit).not.toHaveBeenCalled();
  });

  test("Ctrl+D twice outside window does NOT call requestQuit", () => {
    let t = 1000;
    const h = makeDeps();
    const handler = createKeyboardHandler(h.deps, { now: () => t });
    handler.handle("\x04");
    t = 2000;
    handler.handle("\x04");
    expect(h.requestQuit).not.toHaveBeenCalled();
  });
});

describe("createKeyboardHandler — Ctrl+C", () => {
  test("Ctrl+C renders without dispatching", () => {
    const h = makeDeps();
    const handler = createKeyboardHandler(h.deps);
    const out = handler.handle("\x03");
    expect(h.render).toHaveBeenCalledTimes(1);
    expect(h.dispatch).not.toHaveBeenCalled();
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