import { TUI, visibleWidth, type Editor, type Terminal } from "@earendil-works/pi-tui";
import { type JieAutocompleteProvider, type JieSuggestions } from "../../autocomplete";
import { Actions, type AgentId, type StateStore, type TuiState } from "../../state";
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

beforeEach(() => {
  stateStore.getState.mockReturnValue(makeTuiState());
});

interface EditorHarness {
  readonly editor: Editor;
  readonly submitted: string[];
}

function bootEditor(provider: JieAutocompleteProvider = autocompleteProvider): EditorHarness {
  const ui = new TUI(new StubTerminal());
  const editor = new JieEditor(ui, stateStore, provider, promptHistoryStore);
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

describe("JieEditor — autocomplete ghost text", () => {
  test("renders the selected completion's tail dimmed after the cursor", async () => {
    const { editor } = bootEditor(fileGhostProvider());
    for (const ch of "@a") editor.handleInput(ch);
    await untilAutocomplete(editor);
    const line = cursorLine(editor);
    expect(line).toContain(style("dim")("lpha/one.ts"));
    expect(stripAnsi(line)).toContain("@a lpha/one.ts");
    expect(visibleWidth(line)).toBe(80);
  });

  test("the ghost follows the highlighted row as up and down move it", async () => {
    const { editor } = bootEditor(fileGhostProvider());
    for (const ch of "@a") editor.handleInput(ch);
    await untilAutocomplete(editor);
    editor.handleInput("\x1b[B");
    expect(cursorLine(editor)).toContain(style("dim")("lpha/two.ts"));
    editor.handleInput("\x1b[A");
    expect(cursorLine(editor)).toContain(style("dim")("lpha/one.ts"));
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
    expect(cursorLine(editor)).toContain(style("dim")("am"));
  });

  test("the ghost carries the command's argument hint from its description", async () => {
    const items = [{ value: "model", label: "model", description: "<provider/modelId> — set the default model" }];
    const { editor } = bootEditor(fileGhostProvider(items, "/mo"));
    for (const ch of "/mo") editor.handleInput(ch);
    await untilAutocomplete(editor);
    expect(cursorLine(editor)).toContain(style("dim")("del <provider/modelId>"));
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

  test("the scroll info stays plain when no filter count is reported", async () => {
    const items = Array.from({ length: 6 }, (_, index) => ({ value: `m-${index}`, label: `m-${index}` }));
    const { editor } = bootEditor(fileGhostProvider(items, "/mo"));
    for (const ch of "/mo") editor.handleInput(ch);
    await untilAutocomplete(editor);
    const stripped = editor.render(80).map(stripAnsi);
    expect(stripped.some((line) => line.includes("  (1/6)"))).toBe(true);
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
      const next = [...lines];
      next[cursorLine] = before + item.value + after;
      return { lines: next, cursorLine, cursorCol: before.length + item.value.length };
    }),
  };
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
