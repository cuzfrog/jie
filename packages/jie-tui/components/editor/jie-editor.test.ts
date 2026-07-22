import { TUI, type Terminal } from "@earendil-works/pi-tui";
import { Events, type EventEnvelope, type EventType, type JiePlatform } from "@cuzfrog/jie-platform";
import { Actions, createStateStore, type StateStore } from "../../state";
import { createJieEditor } from "./jie-editor";

class StubTerminal implements Terminal {
  columns = 80;
  rows = 24;
  start(): void {}
  stop(): void {}
  drainInput(): Promise<void> { return Promise.resolve(); }
  write(): void {}
  get kittyProtocolActive(): boolean { return false; }
  moveBy(): void {}
  hideCursor(): void {}
  showCursor(): void {}
  clearLine(): void {}
  clearFromCursor(): void {}
  clearScreen(): void {}
  setTitle(): void {}
  setProgress(): void {}
}

interface EditorHarness {
  readonly store: StateStore;
  readonly editor: ReturnType<typeof createJieEditor>;
  readonly submitted: string[];
}

function bootEditor(): EditorHarness {
  const store = createStateStore();
  const submitted: string[] = [];
  const ui = new TUI(new StubTerminal());
  const editor = createJieEditor(ui, store, "/nonexistent-jie-test", nullPlatform());
  const submit = editor.onSubmit;
  editor.onSubmit = (text: string): void => {
    submitted.push(text);
    submit?.(text);
  };
  return { store, editor, submitted };
}

function nullPlatform(): JiePlatform {
  return {
    settings: { defaultTeam: undefined, defaultProvider: undefined, defaultModel: undefined },
    subscribe: <T extends EventType>(_topic: T, _callback: (event: EventEnvelope<T>) => void): (() => void) => () => undefined,
    prompt: () => undefined,
    interrupt: () => undefined,
    teams: () => [],
    execute: (async () => null) as JiePlatform["execute"],
  };
}

function seedBusyTeam(store: StateStore): void {
  store.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, {
    id: "my-team",
    leaderKey: "general-1",
    history: [],
    agents: [{ teamId: "my-team", role: "general", agentKey: "general-1", isLeader: true, model: null }],
  })));
  store.dispatch(Actions.receiveEvent(Events.agentTurnStart({ kind: "agent", teamId: "my-team", agentKey: "general-1" })));
}

describe("createJieEditor — onChange wiring", () => {
  test("typing keeps the editorText store slice in sync", () => {
    const { store, editor } = bootEditor();
    editor.handleInput("h");
    editor.handleInput("i");
    expect(store.getState().editorText).toBe("hi");
  });

  test("typing while an error banner shows clears the banners", () => {
    const { store, editor } = bootEditor();
    store.dispatch(Actions.setErrorMessage("bad"));
    editor.handleInput("x");
    expect(store.getState().errorBanner).toBeNull();
  });

  test("the post-submit clear does not clear a freshly set error banner", () => {
    const { store, editor } = bootEditor();
    editor.handleInput("x");
    editor.handleInput("\r");
    store.dispatch(Actions.setErrorMessage("unknown slash command: x"));
    editor.onChange?.("");
    expect(store.getState().errorBanner).toBe("unknown slash command: x");
  });
});

describe("createJieEditor — onSubmit wiring", () => {
  test("enter submits the text and the editor self-clears", () => {
    const { store, editor, submitted } = bootEditor();
    editor.handleInput("h");
    editor.handleInput("i");
    editor.handleInput("\r");
    expect(submitted).toEqual(["hi"]);
    expect(store.getState().editorText).toBe("");
    expect(editor.getText()).toBe("");
  });
});

describe("createJieEditor — control keys", () => {
  test("esc interrupts the focused busy agent", () => {
    const { store, editor } = bootEditor();
    seedBusyTeam(store);
    const interrupts: Array<{ teamId: string; agentKey: string }> = [];
    const interruptType = Actions.requestInterrupt("", "").type;
    const unsubscribe = store.subscribe(async (action): Promise<void> => {
      if (action.type === interruptType) interrupts.push(action.payload);
    });
    editor.handleInput("\x1b");
    unsubscribe();
    expect(interrupts).toEqual([{ teamId: "my-team", agentKey: "general-1" }]);
  });

  test("esc does nothing when the focused agent is idle", () => {
    const { store, editor } = bootEditor();
    store.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, {
      id: "my-team",
      leaderKey: "general-1",
      history: [],
      agents: [{ teamId: "my-team", role: "general", agentKey: "general-1", isLeader: true, model: null }],
    })));
    const types: string[] = [];
    const unsubscribe = store.subscribe(async (action): Promise<void> => { types.push(action.type); });
    editor.handleInput("\x1b");
    unsubscribe();
    expect(types).toEqual([]);
  });

  test("ctrl+c clears a non-empty editor without quitting", () => {
    const { store, editor } = bootEditor();
    editor.handleInput("a");
    editor.handleInput("\x03");
    expect(editor.getText()).toBe("");
    expect(store.getState().editorText).toBe("");
    expect(store.getState().pendingQuit).toBe(false);
  });

  test("ctrl+c on an empty editor requests quit", () => {
    const { store, editor } = bootEditor();
    editor.handleInput("\x03");
    expect(store.getState().pendingQuit).toBe(true);
  });

  test("ctrl+d on an empty editor requests quit", () => {
    const { store, editor } = bootEditor();
    editor.handleInput("\x04");
    expect(store.getState().pendingQuit).toBe(true);
  });

  test("ctrl+d with text does not quit", () => {
    const { store, editor } = bootEditor();
    editor.handleInput("a");
    editor.handleInput("\x04");
    expect(store.getState().pendingQuit).toBe(false);
  });
});

describe("createJieEditor — bash mode border", () => {
  test("a leading ! flips the border to the warning color", () => {
    const { editor } = bootEditor();
    editor.handleInput("!");
    expect(editor.borderColor("t")).toBe("\x1b[33mt\x1b[39m");
  });

  test("clearing the text restores the default border", () => {
    const { editor } = bootEditor();
    editor.handleInput("!");
    editor.handleInput("\x03");
    expect(editor.borderColor("t")).toBe("\x1b[34mt\x1b[39m");
  });
});

describe("createJieEditor — prompt history", () => {
  test("up and down arrows walk submitted prompts and keep the store in sync", () => {
    const { store, editor } = bootEditor();
    editor.handleInput("a");
    editor.handleInput("\r");
    editor.handleInput("b");
    editor.handleInput("\r");
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("b");
    expect(store.getState().editorText).toBe("b");
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("a");
    editor.handleInput("\x1b[B");
    expect(editor.getText()).toBe("b");
  });

  test("a draft in progress is restored when browsing back down", () => {
    const { editor } = bootEditor();
    editor.handleInput("a");
    editor.handleInput("\r");
    for (const ch of "draft") editor.handleInput(ch);
    editor.handleInput("\x1b[A");
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("a");
    editor.handleInput("\x1b[B");
    expect(editor.getText()).toBe("draft");
  });
});
