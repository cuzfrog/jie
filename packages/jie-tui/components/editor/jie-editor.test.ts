import { TUI, type AutocompleteProvider, type Editor, type Terminal } from "@earendil-works/pi-tui";
import { Actions, type AgentId, type StateStore, type TuiState } from "../../state";
import { makeAgentUiState, makeTuiState } from "../../test";
import { JieEditor } from "./jie-editor";

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

const LEADER_ID: AgentId = "my-team:general-1";

const stateStore = vi.mocked<StateStore>({ getState: vi.fn(), dispatch: vi.fn(), subscribe: vi.fn(() => () => undefined) });

const autocompleteProvider = vi.mocked<AutocompleteProvider>({
  getSuggestions: vi.fn(() => Promise.resolve(null)),
  applyCompletion: vi.fn(() => ({ lines: [], cursorLine: 0, cursorCol: 0 })),
});

beforeEach(() => {
  stateStore.getState.mockReturnValue(makeTuiState());
});

interface EditorHarness {
  readonly editor: Editor;
  readonly submitted: string[];
}

function bootEditor(): EditorHarness {
  const ui = new TUI(new StubTerminal());
  const editor = new JieEditor(ui, stateStore, autocompleteProvider);
  const submitted: string[] = [];
  const submit = editor.onSubmit;
  editor.onSubmit = (text: string): void => {
    submitted.push(text);
    submit?.(text);
  };
  return { editor, submitted };
}

describe("JieEditor — onChange wiring", () => {
  test("typing keeps the editorText store slice in sync", () => {
    const { editor } = bootEditor();
    editor.handleInput("h");
    editor.handleInput("i");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.setEditorText("hi"));
  });

  test("typing while an error banner shows clears the banners", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ errorBanner: "bad" }));
    const { editor } = bootEditor();
    editor.handleInput("x");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.clearBanners());
  });

  test("the post-submit clear does not clear a freshly set error banner", () => {
    const { editor } = bootEditor();
    editor.handleInput("x");
    editor.handleInput("\r");
    stateStore.getState.mockReturnValue(makeTuiState({ errorBanner: "unknown slash command: x" }));
    editor.onChange?.("");
    expect(stateStore.dispatch).not.toHaveBeenCalledWith(Actions.clearBanners());
  });
});

describe("JieEditor — onSubmit wiring", () => {
  test("enter submits the text and the editor self-clears", () => {
    const { editor, submitted } = bootEditor();
    editor.handleInput("h");
    editor.handleInput("i");
    editor.handleInput("\r");
    expect(submitted).toEqual(["hi"]);
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.submitEditorText("hi"));
    expect(editor.getText()).toBe("");
  });
});

describe("JieEditor — control keys", () => {
  test("esc interrupts the focused busy agent", () => {
    stateStore.getState.mockReturnValue(stateWithTeam("busy"));
    const { editor } = bootEditor();
    editor.handleInput("\x1b");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.requestInterrupt("my-team", "general-1"));
  });

  test("esc does nothing when the focused agent is idle", () => {
    stateStore.getState.mockReturnValue(stateWithTeam("idle"));
    const { editor } = bootEditor();
    editor.handleInput("\x1b");
    expect(stateStore.dispatch).not.toHaveBeenCalled();
  });

  test("ctrl+c clears a non-empty editor without quitting", () => {
    const { editor } = bootEditor();
    editor.handleInput("a");
    editor.handleInput("\x03");
    expect(editor.getText()).toBe("");
    expect(stateStore.dispatch).not.toHaveBeenCalledWith(Actions.requestQuit());
  });

  test("ctrl+c on an empty editor requests quit", () => {
    const { editor } = bootEditor();
    editor.handleInput("\x03");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.requestQuit());
  });

  test("ctrl+d on an empty editor requests quit", () => {
    const { editor } = bootEditor();
    editor.handleInput("\x04");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.requestQuit());
  });

  test("ctrl+d with text does not quit", () => {
    const { editor } = bootEditor();
    editor.handleInput("a");
    editor.handleInput("\x04");
    expect(stateStore.dispatch).not.toHaveBeenCalledWith(Actions.requestQuit());
  });
});

describe("JieEditor — bash mode border", () => {
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

describe("JieEditor — prompt history", () => {
  test("up and down arrows walk submitted prompts and keep the store in sync", () => {
    const { editor } = bootEditor();
    editor.handleInput("a");
    editor.handleInput("\r");
    editor.handleInput("b");
    editor.handleInput("\r");
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("b");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.setEditorText("b"));
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

function stateWithTeam(status: "idle" | "busy"): TuiState {
  return makeTuiState({
    teamId: "my-team",
    leaderAgentId: LEADER_ID,
    focusedAgentId: LEADER_ID,
    agents: new Map([[LEADER_ID, makeAgentUiState(LEADER_ID, { isLeader: true, status })]]),
  });
}
