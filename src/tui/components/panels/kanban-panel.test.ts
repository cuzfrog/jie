import { visibleWidth } from "@earendil-works/pi-tui";
import type { KanbanCard } from "../../../platform";
import { Actions, type Action, type StateStore, type TuiState } from "../../state";
import { makeTuiState } from "../../test";
import { KanbanPanel } from "./kanban-panel";
import { style } from "../themes";

const stateStore = vi.mocked<StateStore>({ getState: vi.fn(), dispatch: vi.fn(), subscribe: vi.fn(() => () => undefined) });

function makeEditorFallback() {
  return { handleInput: vi.fn(), isShowingAutocomplete: vi.fn(() => false) };
}

describe("KanbanPanel", () => {
  beforeEach(() => {
    stateStore.getState.mockReturnValue(makeTuiState());
  });

  test("renders nothing before a team is loaded", () => {
    expect(new KanbanPanel(stateStore, makeEditorFallback()).render(80)).toEqual([]);
  });

  test("renders nothing while the view is hidden or list", () => {
    stateStore.getState.mockReturnValue(boardState([], { kanbanView: "hidden" }));
    expect(new KanbanPanel(stateStore, makeEditorFallback()).render(80)).toEqual([]);
    stateStore.getState.mockReturnValue(boardState([], { kanbanView: "list" }));
    expect(new KanbanPanel(stateStore, makeEditorFallback()).render(80)).toEqual([]);
  });

  test("shows only the column headers when the board is empty", () => {
    stateStore.getState.mockReturnValue(boardState([]));
    const lines = new KanbanPanel(stateStore, makeEditorFallback()).render(120);
    expect(lines[1]).toContain(style("dim")("Pending (0)"));
    expect(lines[1]).toContain(style("dim")("In Progress (0)"));
    expect(lines[1]).toContain(style("dim")("In Review (0)"));
    expect(lines[1]).toContain(style("dim")("Done (0)"));
  });

  test("draws a thin full box around dim column headers above one row per card", () => {
    stateStore.getState.mockReturnValue(boardState([{ id: "#1", content: "write spec", status: "pending" }]));
    const lines = new KanbanPanel(stateStore, makeEditorFallback()).render(120);
    expect(lines[0]).toBe(style("borderMuted")(`┌${"─".repeat(118)}┐`));
    expect(lines[3]).toBe(style("borderMuted")(`└${"─".repeat(118)}┘`));
    expect(lines[1]).toContain(style("dim")("Pending (1)"));
  });

  test("lists each card under its status column left to right", () => {
    stateStore.getState.mockReturnValue(boardState([
      { id: "#1", content: "write spec", status: "pending" },
      { id: "#2", content: "implement tool", status: "in_progress" },
      { id: "#3", content: "rename todo", status: "completed" },
    ]));
    const row = stripAnsi(new KanbanPanel(stateStore, makeEditorFallback()).render(120)[2]);
    expect(row.indexOf("write spec")).toBeGreaterThanOrEqual(0);
    expect(row.indexOf("write spec")).toBeLessThan(row.indexOf("implement tool"));
    expect(row.indexOf("implement tool")).toBeLessThan(row.indexOf("rename todo"));
  });

  test("styles cards by status: pending text, in-progress accent, completed muted", () => {
    stateStore.getState.mockReturnValue(boardState([
      { id: "#1", content: "write spec", status: "pending" },
      { id: "#2", content: "implement tool", status: "in_progress" },
      { id: "#3", content: "rename todo", status: "completed" },
    ]));
    const row = new KanbanPanel(stateStore, makeEditorFallback()).render(120)[2];
    expect(row).toContain(style("text")("write spec"));
    expect(row).toContain(style("accent")("implement tool"));
    expect(row).toContain(style("muted")("rename todo"));
  });

  test("renders an external reference next to the card content", () => {
    stateStore.getState.mockReturnValue(boardState([{ id: "#1", content: "issue", status: "pending", externalRef: "J#7" }]));
    const row = new KanbanPanel(stateStore, makeEditorFallback()).render(120)[2];
    expect(stripAnsi(row)).toContain("J#7");
  });

  test("renders an E badge for session-scoped ephemeral cards", () => {
    stateStore.getState.mockReturnValue(boardState([{ id: "#1", content: "ephemeral", status: "pending", scope: "session" }]));
    const row = new KanbanPanel(stateStore, makeEditorFallback()).render(120)[2];
    expect(stripAnsi(row)).toContain("E ephemeral");
  });

  test("marks the cursor card with a triangle, indents the others, and renders no backgrounds", () => {
    stateStore.getState.mockReturnValue(boardState([
      { id: "#1", content: "write spec", status: "pending" },
      { id: "#2", content: "implement tool", status: "in_progress" },
    ], { kanbanCursor: "#2" }));
    const row = new KanbanPanel(stateStore, makeEditorFallback()).render(120)[2];
    expect(row).toContain(`${style("accent")("▸")}${style("accent")("implement tool")}`);
    expect(stripAnsi(row)).toContain(" write spec");
    expect(row).not.toContain("\x1b[48;5;");
  });

  test("caps each column at eight cards and reports the overflow", () => {
    const cards: ReadonlyArray<KanbanCard> = Array.from({ length: 12 }, (_, index) => ({ id: `#${index + 1}`, content: `pending ${index}`, status: "pending" }));
    stateStore.getState.mockReturnValue(boardState(cards));
    const text = new KanbanPanel(stateStore, makeEditorFallback()).render(120).map(stripAnsi);
    expect(text.some((line) => line.includes("Pending (12)"))).toBe(true);
    expect(text.some((line) => line.includes("pending 7"))).toBe(true);
    expect(text.some((line) => line.includes("pending 8"))).toBe(false);
    expect(text.some((line) => line.includes("+4 more"))).toBe(true);
  });

  test("pads every framed line to the full width so the box sides align", () => {
    stateStore.getState.mockReturnValue(boardState([{ id: "#1", content: "a", status: "pending" }]));
    const lines = new KanbanPanel(stateStore, makeEditorFallback()).render(120);
    for (const line of lines.slice(0, lines.length - 1)) expect(visibleWidth(line)).toBe(120);
  });

  test("truncates card content wider than its column", () => {
    stateStore.getState.mockReturnValue(boardState([{ id: "#1", content: "x".repeat(200), status: "pending" }]));
    for (const line of new KanbanPanel(stateStore, makeEditorFallback()).render(80)) expect(visibleWidth(line)).toBeLessThanOrEqual(80);
  });

  test("shows a shortcut hint below the panel", () => {
    stateStore.getState.mockReturnValue(boardState([{ id: "#1", content: "a", status: "pending" }]));
    const lines = new KanbanPanel(stateStore, makeEditorFallback()).render(80);
    expect(lines[lines.length - 1]).toContain("tab expand");
    expect(lines[lines.length - 1]).toContain("ctrl+e edit");
  });

  test("expanded mode shows the focused card detail full width with the id chip on the top border", () => {
    stateStore.getState.mockReturnValue(boardState([
      { id: "#1", content: "write spec", status: "in_progress", active_form: "drafting", description: "cover storage and events" },
    ], { kanbanExpanded: true, kanbanCursor: "#1" }));
    const lines = new KanbanPanel(stateStore, makeEditorFallback()).render(120);
    expect(lines.join("")).not.toContain("\x1b[48;5;");
    const text = lines.map(stripAnsi);
    expect(text[0]).toContain("┌ #1 ");
    expect(text.some((line) => line.includes("▸write spec"))).toBe(true);
    expect(text.some((line) => line.includes("description: cover storage and events"))).toBe(true);
    expect(text.some((line) => line.includes("status: in_progress"))).toBe(true);
    expect(text.some((line) => line.includes("active: drafting"))).toBe(true);
    expect(text[text.length - 1]).toContain("tab collapse");
  });

  test("expanded mode pads every framed line to the full panel width", () => {
    stateStore.getState.mockReturnValue(boardState([
      { id: "#1", content: "write spec", status: "in_progress", active_form: "drafting", description: "cover storage and events" },
    ], { kanbanExpanded: true, kanbanCursor: "#1" }));
    const lines = new KanbanPanel(stateStore, makeEditorFallback()).render(120);
    for (const line of lines.slice(0, lines.length - 1)) {
      expect(visibleWidth(line)).toBe(120);
    }
  });

  test("expanded mode shows a cursor on the selected field for editing", () => {
    stateStore.getState.mockReturnValue(boardState([
      { id: "#1", content: "write spec", status: "in_progress", description: "cover storage and events" },
    ], { kanbanExpanded: true, kanbanCursor: "#1", kanbanEditField: "content" }));
    const text = new KanbanPanel(stateStore, makeEditorFallback()).render(120).map(stripAnsi);
    expect(text.some((line) => line.includes("▸write spec"))).toBe(true);
    expect(text.some((line) => line.includes(" description: cover storage and events"))).toBe(true);
  });

  test("expanded mode selects the description row when the edit field is description", () => {
    stateStore.getState.mockReturnValue(boardState([
      { id: "#1", content: "write spec", status: "in_progress", description: "cover storage and events" },
    ], { kanbanExpanded: true, kanbanCursor: "#1", kanbanEditField: "description" }));
    const text = new KanbanPanel(stateStore, makeEditorFallback()).render(120).map(stripAnsi);
    expect(text.some((line) => line.includes(" write spec"))).toBe(true);
    expect(text.some((line) => line.includes("▸description: cover storage and events"))).toBe(true);
  });

  test("expanded mode renders a dim placeholder when the card has no description", () => {
    stateStore.getState.mockReturnValue(boardState([
      { id: "#1", content: "write spec", status: "in_progress" },
    ], { kanbanExpanded: true, kanbanCursor: "#1", kanbanEditField: "description" }));
    const lines = new KanbanPanel(stateStore, makeEditorFallback()).render(120);
    const text = lines.map(stripAnsi);
    const line = text.find((line) => line.includes("description:"));
    expect(line).toBeDefined();
    const inner = stripAnsi(line!).replace(/[│]/g, "").trim();
    expect(inner).toBe("▸description:");
    expect(lines.some((line) => line.includes(style("dim")("description:")))).toBe(true);
  });

  test("expanded mode with no cursor shows a placeholder", () => {
    stateStore.getState.mockReturnValue(boardState([{ id: "#1", content: "a", status: "pending" }], { kanbanExpanded: true }));
    const lines = new KanbanPanel(stateStore, makeEditorFallback()).render(80);
    expect(stripAnsi(lines[1])).toContain("no task selected");
  });

  test("truncates every line to the available width", () => {
    stateStore.getState.mockReturnValue(boardState([
      { id: "#1", content: "write spec", status: "pending" },
      { id: "#2", content: "implement tool", status: "in_progress" },
    ]));
    for (const width of [1, 6, 12, 80]) {
      for (const line of new KanbanPanel(stateStore, makeEditorFallback()).render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});

describe("KanbanPanel.update", () => {
  test("reports dirty when kanbanView changes", () => {
    const board: ReadonlyArray<KanbanCard> = [{ id: "#1", content: "a", status: "pending" }];
    stateStore.getState.mockReturnValue(boardState(board, { kanbanView: "hidden" }));
    const panel = new KanbanPanel(stateStore, makeEditorFallback());
    panel.update();
    stateStore.getState.mockReturnValue(boardState(board, { kanbanView: "panel" }));
    expect(panel.update()).toBe(true);
  });

  test("reports dirty when the board changes", () => {
    stateStore.getState.mockReturnValue(boardState([{ id: "#1", content: "a", status: "pending" }]));
    const panel = new KanbanPanel(stateStore, makeEditorFallback());
    panel.update();
    stateStore.getState.mockReturnValue(boardState([{ id: "#2", content: "b", status: "pending" }]));
    expect(panel.update()).toBe(true);
  });

  test("reports dirty when the cursor moves", () => {
    const board: ReadonlyArray<KanbanCard> = [{ id: "#1", content: "a", status: "pending" }];
    stateStore.getState.mockReturnValue(boardState(board, { kanbanCursor: null }));
    const panel = new KanbanPanel(stateStore, makeEditorFallback());
    panel.update();
    stateStore.getState.mockReturnValue(boardState(board, { kanbanCursor: "#1" }));
    expect(panel.update()).toBe(true);
  });

  test("reports dirty when kanbanEdit changes", () => {
    const board: ReadonlyArray<KanbanCard> = [{ id: "#1", content: "a", status: "pending" }];
    stateStore.getState.mockReturnValue(boardState(board, { kanbanEdit: null }));
    const panel = new KanbanPanel(stateStore, makeEditorFallback());
    panel.update();
    stateStore.getState.mockReturnValue(boardState(board, { kanbanEdit: "#1" }));
    expect(panel.update()).toBe(true);
  });

  test("reports clean when the watched slice is unchanged", () => {
    const state = boardState([{ id: "#1", content: "a", status: "pending" }], { kanbanCursor: "#1" });
    stateStore.getState.mockReturnValue(state);
    const panel = new KanbanPanel(stateStore, makeEditorFallback());
    expect(panel.update()).toBe(true);
    expect(panel.update()).toBe(false);
  });

  test("reports clean when only an unwatched field changes", () => {
    const board: ReadonlyArray<KanbanCard> = [{ id: "#1", content: "a", status: "pending" }];
    stateStore.getState.mockReturnValue(boardState(board));
    const panel = new KanbanPanel(stateStore, makeEditorFallback());
    panel.update();
    stateStore.getState.mockReturnValue(boardState(board, { focusedAgentId: "my-team:general-1" }));
    expect(panel.update()).toBe(false);
  });
});

describe("KanbanPanel.handleInput", () => {
  function handle(data: string, state: TuiState, popupOpen = false) {
    const editor = makeEditorFallback();
    editor.isShowingAutocomplete.mockReturnValue(popupOpen);
    stateStore.getState.mockReturnValue(state);
    stateStore.dispatch.mockClear();
    editor.handleInput.mockClear();
    new KanbanPanel(stateStore, editor).handleInput(data);
    return editor;
  }

  function assertDispatch(data: string, state: TuiState, action: Action) {
    const editor = handle(data, state);
    expect(stateStore.dispatch).toHaveBeenCalledWith(action);
    expect(editor.handleInput).not.toHaveBeenCalled();
  }

  test("tab toggles the kanban expand while the panel is shown", () => {
    assertDispatch("\t", makeTuiState({ kanbanView: "panel" }), Actions.toggleKanbanExpand());
  });

  test("esc collapses the expanded kanban panel", () => {
    assertDispatch("\x1b", makeTuiState({ kanbanView: "panel", kanbanExpanded: true }), Actions.toggleKanbanExpand());
  });

  test("arrows move the kanban cursor", () => {
    const state = makeTuiState({ kanbanView: "panel" });
    assertDispatch("\x1b[A", state, Actions.moveKanbanCursor("up"));
    stateStore.dispatch.mockClear();
    assertDispatch("\x1b[B", state, Actions.moveKanbanCursor("down"));
    stateStore.dispatch.mockClear();
    assertDispatch("\x1b[C", state, Actions.moveKanbanCursor("right"));
    stateStore.dispatch.mockClear();
    assertDispatch("\x1b[D", state, Actions.moveKanbanCursor("left"));
  });

  test("left at the buffer start still moves the kanban cursor", () => {
    assertDispatch("\x1b[D", makeTuiState({ kanbanView: "panel", editorCursorAtStart: true }), Actions.moveKanbanCursor("left"));
  });

  test("ctrl+e commits the edit at the cursor", () => {
    assertDispatch("\x05", makeTuiState({ kanbanView: "panel", kanbanCursor: "#1" }), Actions.commitKanbanEdit("#1"));
  });

  test("arrows select title and description while expanded", () => {
    const state = makeTuiState({ kanbanView: "panel", kanbanExpanded: true, kanbanEditField: "content" });
    assertDispatch("\x1b[B", state, Actions.moveKanbanEditField("down"));
    stateStore.dispatch.mockClear();
    assertDispatch("\x1b[A", makeTuiState({ kanbanView: "panel", kanbanExpanded: true, kanbanEditField: "description" }), Actions.moveKanbanEditField("up"));
    stateStore.dispatch.mockClear();
    let editor = handle("\x1b[C", state);
    expect(editor.handleInput).toHaveBeenCalledWith("\x1b[C");
    editor = handle("\x1b[D", state);
    expect(editor.handleInput).toHaveBeenCalledWith("\x1b[D");
  });

  test("ctrl+e commits the selected field while expanded", () => {
    const state = makeTuiState({ kanbanView: "panel", kanbanExpanded: true, kanbanCursor: "#1", kanbanEditField: "description" });
    assertDispatch("\x05", state, Actions.commitKanbanEdit("#1", "description"));
  });

  test("ctrl+e without a cursor forwards to the editor", () => {
    const editor = handle("\x05", makeTuiState({ kanbanView: "panel" }));
    expect(stateStore.dispatch).not.toHaveBeenCalled();
    expect(editor.handleInput).toHaveBeenCalledWith("\x05");
  });

  test("enter falls through to the editor while the panel is shown", () => {
    const editor = handle("\r", makeTuiState({ kanbanView: "panel", kanbanCursor: "#1" }));
    expect(stateStore.dispatch).not.toHaveBeenCalled();
    expect(editor.handleInput).toHaveBeenCalledWith("\r");
  });

  test("forwards while the view is hidden or list", () => {
    let editor = handle("\t", makeTuiState());
    expect(editor.handleInput).toHaveBeenCalledWith("\t");
    editor = handle("\x1b[A", makeTuiState());
    expect(editor.handleInput).toHaveBeenCalledWith("\x1b[A");
    editor = handle("\t", makeTuiState({ kanbanView: "list" }));
    expect(editor.handleInput).toHaveBeenCalledWith("\t");
    editor = handle("\x1b[A", makeTuiState({ kanbanView: "list" }));
    expect(editor.handleInput).toHaveBeenCalledWith("\x1b[A");
  });

  test("forwards while the autocomplete popup is open, so the popup keeps navigation", () => {
    const state = makeTuiState({ kanbanView: "panel" });
    let editor = handle("\t", state, true);
    expect(editor.handleInput).toHaveBeenCalledWith("\t");
    editor = handle("\x1b[A", state, true);
    expect(editor.handleInput).toHaveBeenCalledWith("\x1b[A");
    editor = handle("\x05", state, true);
    expect(editor.handleInput).toHaveBeenCalledWith("\x05");
  });

  test("forwards while editing a card, so every key reaches the editor", () => {
    const state = makeTuiState({ kanbanView: "panel", kanbanEdit: "#1" });
    let editor = handle("\t", state);
    expect(editor.handleInput).toHaveBeenCalledWith("\t");
    editor = handle("\x1b", state);
    expect(editor.handleInput).toHaveBeenCalledWith("\x1b");
    editor = handle("\x1b[A", state);
    expect(editor.handleInput).toHaveBeenCalledWith("\x1b[A");
    editor = handle("\x05", state);
    expect(editor.handleInput).toHaveBeenCalledWith("\x05");
  });

  test("forwards any other key", () => {
    const state = makeTuiState({ kanbanView: "panel" });
    let editor = handle("a", state);
    expect(editor.handleInput).toHaveBeenCalledWith("a");
    editor = handle("\x1b[1;5B", state);
    expect(editor.handleInput).toHaveBeenCalledWith("\x1b[1;5B");
  });
});

function boardState(cards: ReadonlyArray<KanbanCard>, overrides: Partial<TuiState> = {}): TuiState {
  return makeTuiState({
    teamId: "my-team",
    kanbanBoard: cards,
    kanbanView: "panel",
    ...overrides,
  });
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
