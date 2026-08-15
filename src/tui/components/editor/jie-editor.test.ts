import { TuiMainScreen, visibleWidth, type Editor, type Terminal } from "@earendil-works/pi-tui";
import { type KanbanCard } from "../../../platform";
import { type JieAutocompleteProvider, type JieSuggestions } from "../../autocomplete";
import type { CommandCatalog } from "../../command";
import { SLASH_COMMANDS } from "../../command/definitions";
import { Actions, ActionTypes, TuiState, type AgentId, type StateStore } from "../../state";
import { makeAgentUiState, makeTuiState } from "../../test";
import { style } from "../themes";
import { JieEditor } from "./jie-editor";
import type { PromptHistoryStore } from "./prompt-history";

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

const autocompleteProvider = vi.mocked<JieAutocompleteProvider>({
  getSuggestions: vi.fn(() => Promise.resolve(null)),
  applyCompletion: vi.fn(() => ({ lines: [], cursorLine: 0, cursorCol: 0 })),
});

const promptHistoryStore = vi.mocked<PromptHistoryStore>({
  load: vi.fn(() => []),
  append: vi.fn(),
});

function makeCommandCatalog(): CommandCatalog {
  const aliasToCanonical = new Map<string, string>();
  for (const command of SLASH_COMMANDS) {
    for (const alias of command.meta.aliases ?? []) {
      aliasToCanonical.set(alias, command.meta.name);
    }
  }
  return vi.mocked<CommandCatalog>({
    metadata: SLASH_COMMANDS.map((command) => command.meta),
    commandMeta: vi.fn((name) => {
      const canonical = aliasToCanonical.get(name) ?? name;
      return SLASH_COMMANDS.find((command) => command.meta.name === canonical)?.meta ?? null;
    }),
  });
}

beforeEach(() => {
  stateStore.getState.mockReturnValue(makeTuiState());
  promptHistoryStore.load.mockReturnValue([]);
});

interface EditorHarness {
  readonly editor: JieEditor;
  readonly submitted: string[];
}

function bootEditor(provider: JieAutocompleteProvider = autocompleteProvider): EditorHarness {
  const ui = new TuiMainScreen(new StubTerminal());
  const editor = new JieEditor(ui, stateStore, provider, promptHistoryStore, makeCommandCatalog());
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

describe("JieEditor — editorCursorAtStart sync", () => {
  test("typing a character reports the cursor left the buffer start", () => {
    const { editor } = bootEditor();
    editor.handleInput("a");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.setEditorCursorAtStart(false));
  });

  test("moving the cursor away from the start with an arrow reports the change once", () => {
    const { editor } = bootEditor();
    editor.handleInput("a");
    editor.handleInput("b");
    stateStore.dispatch.mockClear();
    editor.handleInput("\x1b[D");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.setEditorCursorAtStart(false));
    stateStore.dispatch.mockClear();
    editor.handleInput("\x1b[D");
    expect(stateStore.dispatch).not.toHaveBeenCalledWith(Actions.setEditorCursorAtStart(false));
  });

  test("deleting back to an empty buffer reports the cursor returned to the start", () => {
    const { editor } = bootEditor();
    editor.handleInput("a");
    stateStore.getState.mockReturnValue(makeTuiState({ editorCursorAtStart: false }));
    stateStore.dispatch.mockClear();
    editor.handleInput("\x7f");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.setEditorCursorAtStart(true));
  });

  test("returning to the start with arrows reports the change", () => {
    const { editor } = bootEditor();
    editor.handleInput("a");
    editor.handleInput("\x1b[D");
    stateStore.getState.mockReturnValue(makeTuiState({ editorCursorAtStart: false }));
    stateStore.dispatch.mockClear();
    editor.handleInput("\x1b[D");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.setEditorCursorAtStart(true));
  });

  test("ctrl+c clearing the buffer reports the cursor returned to the start", () => {
    const { editor } = bootEditor();
    editor.handleInput("a");
    stateStore.getState.mockReturnValue(makeTuiState({ editorCursorAtStart: false }));
    stateStore.dispatch.mockClear();
    editor.handleInput("\x03");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.setEditorCursorAtStart(true));
  });

  test("a no-op left arrow at the start dispatches nothing", () => {
    const { editor } = bootEditor();
    editor.handleInput("\x1b[D");
    expect(stateStore.dispatch).not.toHaveBeenCalledWith(Actions.setEditorCursorAtStart(false));
    expect(stateStore.dispatch).not.toHaveBeenCalledWith(Actions.setEditorCursorAtStart(true));
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

  test("enter on an empty editor does not submit", () => {
    const { editor } = bootEditor();
    editor.handleInput("\r");
    expect(stateStore.dispatch).not.toHaveBeenCalledWith(Actions.submitEditorText(""));
  });

  test("enter on whitespace-only text does not submit", () => {
    const { editor } = bootEditor();
    editor.handleInput(" ");
    editor.handleInput("\r");
    expect(stateStore.dispatch).not.toHaveBeenCalledWith(Actions.submitEditorText(""));
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

describe("JieEditor — session name border label", () => {
  test("renders the session name right-aligned in the top border", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ sessionName: "my-session" }));
    const { editor } = bootEditor();
    const raw = editor.render(80)[0]!;
    expect(stripAnsi(raw).endsWith(" my-session ──")).toBe(true);
    expect(raw).toContain("\x1b[44m my-session \x1b[49m");
  });

  test("renders a plain border when the session is unnamed", () => {
    const { editor } = bootEditor();
    expect(stripAnsi(editor.render(80)[0]!)).toBe("─".repeat(80));
  });

  test("the label chip follows the warning border in bash mode", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ sessionName: "my-session" }));
    const { editor } = bootEditor();
    editor.handleInput("!");
    expect(editor.render(80)[0]).toContain("\x1b[43m my-session \x1b[49m");
  });

  test("truncates a long name so the border keeps the full width", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ sessionName: "x".repeat(100) }));
    const { editor } = bootEditor();
    const border = stripAnsi(editor.render(30)[0]!);
    expect(visibleWidth(border)).toBe(30);
    expect(border.endsWith("──")).toBe(true);
  });

  test("omits the label when the width cannot fit it", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ sessionName: "my-session" }));
    const { editor } = bootEditor();
    expect(stripAnsi(editor.render(5)[0]!)).toBe("─".repeat(5));
  });
});

describe("JieEditor — kanban card edit", () => {
  const BOARD: ReadonlyArray<KanbanCard> = [{ id: "#1", content: "write report", status: "pending", description: "cover Q3" }];

  function editingState(kanbanEdit: string | null, field: "content" | "description" = "content"): TuiState {
    return makeTuiState({ kanbanBoard: BOARD, kanbanEdit, kanbanEditField: field });
  }

  test("committing an edit captures the draft and pre-fills the card content", () => {
    stateStore.getState.mockReturnValue(editingState("#1"));
    const { editor } = bootEditor();
    editor.handleInput("draft");
    applyKanbanState(editor, editingState("#1"));
    expect(editor.getText()).toBe("write report");
  });

  test("typing during an edit extends the card content", () => {
    stateStore.getState.mockReturnValue(editingState("#1"));
    const { editor } = bootEditor();
    applyKanbanState(editor, editingState("#1"));
    editor.handleInput("!");
    expect(editor.getText()).toBe("write report!");
  });

  test("enter saves the edit with the card id and content, then restores the draft", () => {
    stateStore.getState.mockReturnValue(editingState("#1"));
    const { editor } = bootEditor();
    editor.handleInput("draft");
    applyKanbanState(editor, editingState("#1"));
    editor.handleInput("\r");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.saveKanbanEdit("#1", "write report", "content"));
    applyKanbanState(editor, editingState(null));
    expect(editor.getText()).toBe("draft");
  });

  test("ctrl+s saves the edit without submitting a prompt", () => {
    stateStore.getState.mockReturnValue(editingState("#1"));
    const { editor } = bootEditor();
    applyKanbanState(editor, editingState("#1"));
    editor.handleInput("\x13");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.saveKanbanEdit("#1", "write report", "content"));
    expect(stateStore.dispatch).not.toHaveBeenCalledWith(Actions.submitEditorText("write report"));
  });

  test("committing an edit of the description pre-fills and saves the description", () => {
    stateStore.getState.mockReturnValue(editingState("#1", "description"));
    const { editor } = bootEditor();
    editor.handleInput("draft");
    applyKanbanState(editor, editingState("#1", "description"));
    expect(editor.getText()).toBe("cover Q3");
    editor.handleInput(" extended");
    editor.handleInput("\r");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.saveKanbanEdit("#1", "cover Q3 extended", "description"));
  });

  test("esc cancels the edit and restores the draft", () => {
    stateStore.getState.mockReturnValue(editingState("#1"));
    const { editor } = bootEditor();
    editor.handleInput("draft");
    applyKanbanState(editor, editingState("#1"));
    editor.handleInput("\x1b");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.cancelKanbanEdit());
    applyKanbanState(editor, editingState(null));
    expect(editor.getText()).toBe("draft");
  });

  test("ctrl+c cancels the edit instead of quitting", () => {
    stateStore.getState.mockReturnValue(editingState("#1"));
    const { editor } = bootEditor();
    applyKanbanState(editor, editingState("#1"));
    editor.handleInput("\x03");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.cancelKanbanEdit());
    expect(stateStore.dispatch).not.toHaveBeenCalledWith(Actions.requestQuit());
  });

  test("the top border shows an editing chip while the card is being edited", () => {
    stateStore.getState.mockReturnValue(editingState("#1"));
    const { editor } = bootEditor();
    applyKanbanState(editor, editingState("#1"));
    const raw = editor.render(80)[0]!;
    expect(stripAnsi(raw).endsWith(" editing #1 ──")).toBe(true);
    expect(raw).toContain("\x1b[45m editing #1 \x1b[49m");
  });

  test("autocomplete stays off while editing a card", async () => {
    stateStore.getState.mockReturnValue(editingState("#1"));
    const { editor } = bootEditor(fileGhostProvider());
    applyKanbanState(editor, editingState("#1"));
    editor.handleInput("@");
    editor.handleInput("a");
    await sleep(30);
    expect(editor.isShowingAutocomplete()).toBe(false);
  });

  test("up arrow moves the editor cursor instead of browsing while editing", () => {
    stateStore.getState.mockReturnValue(editingState("#1"));
    const { editor } = bootEditor();
    applyKanbanState(editor, editingState("#1"));
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("write report");
    const dequeueType = ActionTypes.REQUEST_DEQUEUE;
    const dequeues = stateStore.dispatch.mock.calls.map((call) => call[0]).filter((action) => action.type === dequeueType);
    expect(dequeues).toEqual([]);
  });

  test("pre-fills an empty string when the description field is missing", () => {
    const boardWithoutDesc: ReadonlyArray<KanbanCard> = [{ id: "#1", content: "write report", status: "pending" }];
    stateStore.getState.mockReturnValue(makeTuiState({ kanbanBoard: boardWithoutDesc, kanbanEdit: "#1", kanbanEditField: "description" }));
    const { editor } = bootEditor();
    applyKanbanState(editor, makeTuiState({ kanbanBoard: boardWithoutDesc, kanbanEdit: "#1", kanbanEditField: "description" }));
    expect(editor.getText()).toBe("");
  });

  test("pre-fills an empty string when the edited card is not on the board", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ kanbanBoard: [], kanbanEdit: "#1", kanbanEditField: "content" }));
    const { editor } = bootEditor();
    applyKanbanState(editor, makeTuiState({ kanbanBoard: [], kanbanEdit: "#1", kanbanEditField: "content" }));
    expect(editor.getText()).toBe("");
  });
});

describe("JieEditor.update", () => {
  const BOARD: ReadonlyArray<KanbanCard> = [{ id: "#1", content: "write report", status: "pending" }];

  test("reports dirty when a kanban edit begins", () => {
    const { editor } = bootEditor();
    stateStore.getState.mockReturnValue(makeTuiState({ kanbanBoard: BOARD, kanbanEdit: "#1" }));
    expect(editor.update()).toBe(true);
  });

  test("reports dirty when a kanban edit ends", () => {
    const { editor } = bootEditor();
    applyKanbanState(editor, makeTuiState({ kanbanBoard: BOARD, kanbanEdit: "#1" }));
    stateStore.getState.mockReturnValue(makeTuiState({ kanbanBoard: BOARD, kanbanEdit: null }));
    expect(editor.update()).toBe(true);
  });

  test("reports clean when the kanban edit id is unchanged", () => {
    const { editor } = bootEditor();
    applyKanbanState(editor, makeTuiState({ kanbanBoard: BOARD, kanbanEdit: "#1" }));
    expect(editor.update()).toBe(false);
  });
});

function applyKanbanState(editor: JieEditor, afterState: TuiState): void {
  stateStore.getState.mockReturnValue(afterState);
  editor.update();
}

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

  test("construction seeds the walk from the persisted store, most recent first", () => {
    promptHistoryStore.load.mockReturnValue(["first", "second"]);
    const { editor } = bootEditor();
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("second");
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("first");
  });

  test("submitting a prompt appends the trimmed text to the store", () => {
    const { editor } = bootEditor();
    for (const ch of " hi ") editor.handleInput(ch);
    editor.handleInput("\r");
    expect(promptHistoryStore.append).toHaveBeenCalledWith("hi");
  });

  test("consecutive duplicate submits append only once", () => {
    const { editor } = bootEditor();
    editor.handleInput("dup");
    editor.handleInput("\r");
    editor.handleInput("dup");
    editor.handleInput("\r");
    expect(promptHistoryStore.append).toHaveBeenCalledTimes(1);
  });

  test("submitting the last seeded prompt does not re-append it", () => {
    promptHistoryStore.load.mockReturnValue(["again"]);
    const { editor } = bootEditor();
    editor.handleInput("again");
    editor.handleInput("\r");
    expect(promptHistoryStore.append).not.toHaveBeenCalled();
  });

  test("a whitespace-only submit does not append", () => {
    const { editor } = bootEditor();
    editor.handleInput(" ");
    editor.handleInput("\r");
    expect(promptHistoryStore.append).not.toHaveBeenCalled();
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

function userEntry(text: string, chained = false): { text: string; source: "user" | "peer"; chained: boolean } {
  return { text, source: "user", chained };
}

function peerEntry(text: string, chained = false): { text: string; source: "user" | "peer"; chained: boolean } {
  return { text, source: "peer", chained };
}

function stateWithQueue(queue: ReadonlyArray<{ text: string; source: "user" | "peer"; chained: boolean }>): TuiState {
  return makeTuiState({
    teamId: "my-team",
    leaderAgentId: LEADER_ID,
    focusedAgentId: LEADER_ID,
    agents: new Map([[LEADER_ID, makeAgentUiState(LEADER_ID, { isLeader: true, queue })]]),
  });
}

function wireQueueRoundTrip(initial: TuiState): void {
  let current = initial;
  stateStore.getState.mockImplementation(() => current);
  stateStore.dispatch.mockImplementation((action) => {
    const focused = TuiState.getFocusedAgent(current);
    if (focused === null) return;
    let queue = [...focused.queue];
    if (action.type === ActionTypes.REQUEST_DEQUEUE) {
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i]!.source === "user" && !queue[i]!.chained && queue[i]!.text === action.payload.prompt) {
          queue.splice(i, 1);
          break;
        }
      }
    } else if (action.type === ActionTypes.REQUEST_REQUEUE) {
      queue = [...queue, { text: action.payload.prompt, source: "user" as const, chained: false as const }];
    } else {
      return;
    }
    const agents = new Map(current.agents);
    agents.set(focused.agentId, { ...focused, queue });
    current = { ...current, agents };
  });
}

type PromptRequestAction = ReturnType<typeof Actions.requestDequeue> | ReturnType<typeof Actions.requestRequeue>;

function dispatchedActions(type: string): ReadonlyArray<PromptRequestAction> {
  return stateStore.dispatch.mock.calls.map((call) => call[0]).filter((action): action is PromptRequestAction => action.type === type);
}

describe("JieEditor — queue browse", () => {
  test("up skips chained user prompts and does not dispatch requestDequeue for them", () => {
    const { editor } = bootEditor();
    wireQueueRoundTrip(stateWithQueue([userEntry("first", true), userEntry("second")]));
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("second");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.requestDequeue("my-team", "general-1", "second"));
    const dequeueCount = stateStore.dispatch.mock.calls.filter((call) => call[0].type === ActionTypes.REQUEST_DEQUEUE).length;
    expect(dequeueCount).toBe(1);
  });

  test("up with an empty editor pulls the most recently queued user prompt", () => {
    const { editor } = bootEditor();
    wireQueueRoundTrip(stateWithQueue([userEntry("first"), userEntry("second")]));
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("second");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.requestDequeue("my-team", "general-1", "second"));
  });

  test("a second up pulls the next user prompt from the tail", () => {
    const { editor } = bootEditor();
    wireQueueRoundTrip(stateWithQueue([userEntry("first"), userEntry("second")]));
    editor.handleInput("\x1b[A");
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("first");
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.requestDequeue("my-team", "general-1", "first"));
  });

  test("rapid up before the dequeue round-trip skips already dispatched entries", () => {
    const { editor } = bootEditor();
    stateStore.getState.mockReturnValue(stateWithQueue([userEntry("first"), userEntry("second")]));
    editor.handleInput("\x1b[A");
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("first");
    const dequeueType = ActionTypes.REQUEST_DEQUEUE;
    const dequeues = stateStore.dispatch.mock.calls.map((call) => call[0]).filter((action) => action.type === dequeueType);
    expect(dequeues).toEqual([
      Actions.requestDequeue("my-team", "general-1", "second"),
      Actions.requestDequeue("my-team", "general-1", "first"),
    ]);
  });

  test("down walks back to the draft and ends the session", () => {
    const { editor } = bootEditor();
    wireQueueRoundTrip(stateWithQueue([userEntry("first"), userEntry("second")]));
    editor.handleInput("\x1b[A");
    editor.handleInput("\x1b[A");
    editor.handleInput("\x1b[B");
    expect(editor.getText()).toBe("second");
    editor.handleInput("\x1b[B");
    expect(editor.getText()).toBe("");
    editor.handleInput("\x1b[B");
    expect(editor.getText()).toBe("");
  });

  test("up with editor content dequeues and down restores the draft", () => {
    const { editor } = bootEditor();
    wireQueueRoundTrip(stateWithQueue([userEntry("queued")]));
    for (const ch of "draft") editor.handleInput(ch);
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("queued");
    editor.handleInput("\x1b[B");
    expect(editor.getText()).toBe("draft");
  });

  test("down requeues an abandoned dequeued prompt", () => {
    const { editor } = bootEditor();
    wireQueueRoundTrip(stateWithQueue([userEntry("queued")]));
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("queued");
    editor.handleInput("\x1b[B");
    expect(editor.getText()).toBe("");
    expect(dispatchedActions(ActionTypes.REQUEST_REQUEUE)).toEqual([
      Actions.requestRequeue("my-team", "general-1", "queued"),
    ]);
  });

  test("a requeued prompt is dequeued again by the next up", () => {
    const { editor } = bootEditor();
    wireQueueRoundTrip(stateWithQueue([userEntry("queued")]));
    editor.handleInput("\x1b[A");
    editor.handleInput("\x1b[B");
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("queued");
  });

  test("down requeues each abandoned prompt in turn", () => {
    const { editor } = bootEditor();
    wireQueueRoundTrip(stateWithQueue([userEntry("first"), userEntry("second")]));
    editor.handleInput("\x1b[A");
    editor.handleInput("\x1b[A");
    editor.handleInput("\x1b[B");
    editor.handleInput("\x1b[B");
    expect(editor.getText()).toBe("");
    expect(dispatchedActions(ActionTypes.REQUEST_REQUEUE)).toEqual([
      Actions.requestRequeue("my-team", "general-1", "first"),
      Actions.requestRequeue("my-team", "general-1", "second"),
    ]);
  });

  test("submitting a dequeued prompt does not requeue it", () => {
    const { editor } = bootEditor();
    wireQueueRoundTrip(stateWithQueue([userEntry("queued")]));
    editor.handleInput("\x1b[A");
    editor.handleInput("\r");
    expect(dispatchedActions(ActionTypes.REQUEST_REQUEUE)).toEqual([]);
  });

  test("editing a dequeued prompt adopts it without requeue", () => {
    const { editor } = bootEditor();
    wireQueueRoundTrip(stateWithQueue([userEntry("queued")]));
    editor.handleInput("\x1b[A");
    editor.handleInput("x");
    editor.handleInput("\x1b[B");
    expect(editor.getText()).toBe("queuedx");
    expect(dispatchedActions(ActionTypes.REQUEST_REQUEUE)).toEqual([]);
  });

  test("ctrl+c discards a dequeued prompt without requeue", () => {
    const { editor } = bootEditor();
    wireQueueRoundTrip(stateWithQueue([userEntry("queued")]));
    editor.handleInput("\x1b[A");
    editor.handleInput("\x03");
    expect(editor.getText()).toBe("");
    expect(dispatchedActions(ActionTypes.REQUEST_REQUEUE)).toEqual([]);
  });

  test("up with content and an empty queue saves the draft to history before walking it", () => {
    promptHistoryStore.load.mockReturnValue(["old"]);
    const { editor } = bootEditor();
    wireQueueRoundTrip(stateWithQueue([]));
    for (const ch of "draft") editor.handleInput(ch);
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("old");
    editor.handleInput("\x1b[B");
    expect(editor.getText()).toBe("draft");
    editor.handleInput("\x03");
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("draft");
  });

  test("an exhausted queue continues into prompt history, most recent first", () => {
    promptHistoryStore.load.mockReturnValue(["h1", "h2"]);
    const { editor } = bootEditor();
    wireQueueRoundTrip(stateWithQueue([userEntry("q1")]));
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("q1");
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("h2");
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("h1");
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("h1");
    editor.handleInput("\x1b[B");
    expect(editor.getText()).toBe("h2");
    editor.handleInput("\x1b[B");
    expect(editor.getText()).toBe("q1");
    editor.handleInput("\x1b[B");
    expect(editor.getText()).toBe("");
  });

  test("peer notifications are skipped and never dequeued", () => {
    const { editor } = bootEditor();
    wireQueueRoundTrip(stateWithQueue([userEntry("u1"), peerEntry("[peer]: note"), userEntry("u2")]));
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("u2");
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("u1");
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("u1");
    expect(stateStore.dispatch).not.toHaveBeenCalledWith(Actions.requestDequeue("my-team", "general-1", "[peer]: note"));
  });

  test("editing mid-browse abandons the session", () => {
    const { editor } = bootEditor();
    wireQueueRoundTrip(stateWithQueue([userEntry("b"), userEntry("a")]));
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("a");
    editor.handleInput("x");
    expect(editor.getText()).toBe("ax");
    editor.handleInput("\x1b[B");
    expect(editor.getText()).toBe("ax");
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("b");
    editor.handleInput("\x1b[B");
    expect(editor.getText()).toBe("ax");
  });

  test("up from the top line dequeues regardless of the cursor column", () => {
    const { editor } = bootEditor();
    wireQueueRoundTrip(stateWithQueue([userEntry("queued")]));
    editor.handleInput("a");
    editor.handleInput("b");
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("queued");
  });

  test("up moves the cursor up from a lower line before dequeuing", () => {
    const { editor } = bootEditor();
    wireQueueRoundTrip(stateWithQueue([userEntry("queued")]));
    editor.handleInput("a");
    editor.handleInput("\n");
    editor.handleInput("b");
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("a\nb");
    expect(editor.getCursor()).toEqual({ line: 0, col: 1 });
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("queued");
  });

  test("down restores the draft only from the last line", () => {
    const { editor } = bootEditor();
    wireQueueRoundTrip(stateWithQueue([userEntry("l1\nl2")]));
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("l1\nl2");
    editor.handleInput("\x1b[A");
    expect(editor.getCursor().line).toBe(0);
    editor.handleInput("\x1b[B");
    expect(editor.getText()).toBe("l1\nl2");
    expect(editor.getCursor().line).toBe(1);
    editor.handleInput("\x1b[B");
    expect(editor.getText()).toBe("");
  });

  test("up with an empty queue falls back to native history", () => {
    promptHistoryStore.load.mockReturnValue(["old"]);
    const { editor } = bootEditor();
    wireQueueRoundTrip(stateWithQueue([]));
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("old");
  });

  test("up does nothing special when no agent is focused", () => {
    const { editor } = bootEditor();
    editor.handleInput("x");
    editor.handleInput("\x1b[D");
    editor.handleInput("\x1b[A");
    expect(editor.getText()).toBe("x");
  });
});

describe("JieEditor — autocomplete ghost text", () => {
  test("renders the selected completion's tail dimmed after the cursor", async () => {
    const { editor } = bootEditor(fileGhostProvider());
    for (const ch of "@a") editor.handleInput(ch);
    await untilAutocomplete(editor);
    const line = cursorLine(editor);
    expect(line).toContain("\x1b[7ml\x1b[0m");
    expect(stripAnsi(line)).toContain("@alpha/one.ts");
    expect(visibleWidth(line)).toBe(80);
  });

  test("the ghost's first character sits inside the cursor cell instead of pushing it", async () => {
    const { editor } = bootEditor(fileGhostProvider());
    for (const ch of "@a") editor.handleInput(ch);
    await untilAutocomplete(editor);
    const line = cursorLine(editor);
    expect(line).toContain("\x1b[7ml\x1b[0m");
    expect(line).not.toContain("\x1b[7m \x1b[0m");
  });

  test("the ghost follows the highlighted row as up and down move it", async () => {
    const { editor } = bootEditor(fileGhostProvider());
    for (const ch of "@a") editor.handleInput(ch);
    await untilAutocomplete(editor);
    editor.handleInput("\x1b[B");
    expect(stripAnsi(cursorLine(editor))).toContain("@alpha/two.ts");
    editor.handleInput("\x1b[A");
    expect(stripAnsi(cursorLine(editor))).toContain("@alpha/one.ts");
  });

  test("tab completion clears the ghost once the popup closes", async () => {
    const { editor } = bootEditor(fileGhostProvider());
    for (const ch of "@a") editor.handleInput(ch);
    await untilAutocomplete(editor);
    editor.handleInput("\t");
    expect(editor.getText()).toBe("@alpha/one.ts");
    expect(cursorLine(editor)).not.toContain(style("dim")("lpha/one.ts"));
  });

  test("esc dismisses the popup and the ghost together", async () => {
    const { editor } = bootEditor(fileGhostProvider());
    for (const ch of "@a") editor.handleInput(ch);
    await untilAutocomplete(editor);
    editor.handleInput("\x1b");
    expect(editor.getText()).toBe("@a");
    expect(cursorLine(editor)).not.toContain(style("dim")("lpha/one.ts"));
  });

  test("shows no ghost when the selected value does not extend the typed prefix", async () => {
    const provider = fileGhostProvider([{ value: "@unrelated.ts", label: "unrelated.ts" }]);
    const { editor } = bootEditor(provider);
    for (const ch of "@zz") editor.handleInput(ch);
    await untilAutocomplete(editor);
    expect(cursorLine(editor)).not.toContain(style("dim")("unrelated.ts"));
  });

  test("a slash command completion ghosts the command name past the typed prefix", async () => {
    const provider = fileGhostProvider([{ value: "team", label: "team" }], "/te");
    const { editor } = bootEditor(provider);
    for (const ch of "/te") editor.handleInput(ch);
    await untilAutocomplete(editor);
    expect(stripAnsi(cursorLine(editor))).toContain("/team");
  });

  test("the ghost carries the command's argument hint from its description", async () => {
    const items = [{ value: "model", label: "model", description: "<provider/modelId> — set the default model" }];
    const { editor } = bootEditor(fileGhostProvider(items, "/mo"));
    for (const ch of "/mo") editor.handleInput(ch);
    await untilAutocomplete(editor);
    expect(stripAnsi(cursorLine(editor))).toContain("/model <provider/modelId>");
  });

  test("an exact command match still ghosts its argument hint", async () => {
    const items = [
      { value: "model", label: "model", description: "<provider/modelId> — set the default model" },
      { value: "model-filter", label: "model-filter", description: "<add|remove|list> <pattern> — manage model filters" },
    ];
    const { editor } = bootEditor(fileGhostProvider(items, "/model"));
    for (const ch of "/model") editor.handleInput(ch);
    await untilAutocomplete(editor);
    expect(stripAnsi(cursorLine(editor))).toContain("/model <provider/modelId>");
  });

  test("tab-committing a slash command leaves a static argument hint", async () => {
    const items = [
      { value: "model", label: "model", description: "<provider/modelId> — set the default model" },
      { value: "model-filter", label: "model-filter", description: "<add|remove|list> <pattern> — manage model filters" },
    ];
    const { editor } = bootEditor(fileGhostProvider(items, "/model"));
    for (const ch of "/model") editor.handleInput(ch);
    await untilAutocomplete(editor);
    editor.handleInput("\x1b[B");
    editor.handleInput("\t");
    expect(editor.getText()).toBe("/model-filter ");
    expect(editor.isShowingAutocomplete()).toBe(false);
    expect(stripAnsi(cursorLine(editor))).toContain("/model-filter <add|remove|list> <pattern>");
  });

  test("the ghost omits a description that is not an argument hint", async () => {
    const items = [{ value: "team", label: "team", description: "switch the active team" }];
    const { editor } = bootEditor(fileGhostProvider(items, "/te"));
    for (const ch of "/te") editor.handleInput(ch);
    await untilAutocomplete(editor);
    expect(stripAnsi(cursorLine(editor))).not.toContain("switch the active team");
  });

  test("the scroll info gains the filtered-out count when suggestions carry it", async () => {
    const items = Array.from({ length: 6 }, (_, index) => ({ value: `m-${index}`, label: `m-${index}` }));
    const { editor } = bootEditor(fileGhostProvider(items, "/mo", 4));
    for (const ch of "/mo") editor.handleInput(ch);
    await untilAutocomplete(editor);
    const stripped = editor.render(80).map(stripAnsi);
    expect(stripped.some((line) => line.includes("  (1/6 | 4 filtered)"))).toBe(true);
  });

  test("the filtered count shows below the popup even when the list does not scroll", async () => {
    const items = Array.from({ length: 3 }, (_, index) => ({ value: `m-${index}`, label: `m-${index}` }));
    const { editor } = bootEditor(fileGhostProvider(items, "/mo", 5));
    for (const ch of "/mo") editor.handleInput(ch);
    await untilAutocomplete(editor);
    const stripped = editor.render(80).map(stripAnsi);
    expect(stripped.some((line) => line.includes("  (1/3 | 5 filtered)"))).toBe(true);
  });

  test("the scroll info stays plain when no filter count is reported", async () => {
    const items = Array.from({ length: 6 }, (_, index) => ({ value: `m-${index}`, label: `m-${index}` }));
    const { editor } = bootEditor(fileGhostProvider(items, "/mo"));
    for (const ch of "/mo") editor.handleInput(ch);
    await untilAutocomplete(editor);
    const stripped = editor.render(80).map(stripAnsi);
    expect(stripped.some((line) => line.includes("  (1/6)"))).toBe(true);
  });

  test("tab commits an exact file mention and adds a trailing space", async () => {
    const { editor } = bootEditor(exactMentionProvider());
    for (const ch of "@f") editor.handleInput(ch);
    await untilAutocomplete(editor);
    editor.handleInput("\t");
    expect(editor.getText()).toBe("@file1.md ");
    expect(editor.isShowingAutocomplete()).toBe(false);
  });

  test("a space after an exact file mention commits and closes the popup", async () => {
    const provider = exactMentionProvider();
    const { editor } = bootEditor(provider);
    for (const ch of "@file1.md") editor.handleInput(ch);
    await untilAutocomplete(editor);
    await sleep(30);
    editor.handleInput(" ");
    await sleep(10);
    expect(editor.getText()).toBe("@file1.md ");
    expect(editor.isShowingAutocomplete()).toBe(false);
    const lastCall = provider.getSuggestions.mock.calls.at(-1);
    const lastLine = (lastCall?.[0] as string[] | undefined)?.[0];
    expect(lastLine).toBe("@file1.md");
  });
});

function fileGhostProvider(
  items?: ReadonlyArray<{ value: string; label: string; description?: string }>,
  prefix?: string,
  filteredOut?: number,
): JieAutocompleteProvider {
  const suggestions = items ?? [{ value: "@alpha/one.ts", label: "alpha/one.ts" }, { value: "@alpha/two.ts", label: "alpha/two.ts" }];
  return {
    triggerCharacters: ["@"],
    getSuggestions: vi.fn((lines: string[], cursorLine: number, cursorCol: number) => {
      const text = (lines[cursorLine] ?? "").slice(0, cursorCol);
      if (prefix !== undefined ? !text.startsWith(prefix.slice(0, 1)) : !text.includes("@")) return Promise.resolve(null);
      const result: JieSuggestions = { items: [...suggestions], prefix: prefix ?? `@${/@(\w*)$/.exec(text)?.[1] ?? ""}` };
      return Promise.resolve(filteredOut === undefined ? result : { ...result, filteredOut });
    }),
    applyCompletion: vi.fn((lines: string[], cursorLine: number, cursorCol: number, item: { value: string }, completionPrefix: string) => {
      const line = lines[cursorLine] ?? "";
      const before = line.slice(0, cursorCol - completionPrefix.length);
      const after = line.slice(cursorCol);
      const inserted = completionPrefix.startsWith("/") ? `/${item.value} ` : item.value;
      const next = [...lines];
      next[cursorLine] = before + inserted + after;
      return { lines: next, cursorLine, cursorCol: before.length + inserted.length };
    }),
  };
}

function exactMentionProvider() {
  const item = { value: "@file1.md", label: "file1.md" };
  const getSuggestions = vi.fn<JieAutocompleteProvider["getSuggestions"]>(
    (lines: string[], cursorLine: number, cursorCol: number) => {
      const text = (lines[cursorLine] ?? "").slice(0, cursorCol);
      if (text.endsWith(" ")) return new Promise<null>(() => undefined);
      return Promise.resolve<JieSuggestions | null>({ items: [item], prefix: text });
    },
  );
  const applyCompletion = vi.fn<JieAutocompleteProvider["applyCompletion"]>(
    (lines: string[], cursorLine: number, cursorCol: number, selected: { value: string }, completionPrefix: string) => {
      const line = lines[cursorLine] ?? "";
      const before = line.slice(0, cursorCol - completionPrefix.length);
      const after = line.slice(cursorCol);
      const inserted = `${selected.value} `;
      const next = [...lines];
      next[cursorLine] = before + inserted + after;
      return { lines: next, cursorLine, cursorCol: before.length + inserted.length };
    },
  );
  return { triggerCharacters: ["@"], getSuggestions, applyCompletion };
}

async function untilAutocomplete(editor: Editor): Promise<void> {
  for (let i = 0; i < 100 && !editor.isShowingAutocomplete(); i++) await sleep(2);
  expect(editor.isShowingAutocomplete()).toBe(true);
}

function cursorLine(editor: Editor): string {
  const line = editor.render(80).find((candidate) => candidate.includes("\x1b[7m"));
  expect(line).toBeDefined();
  return line ?? "";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
