import { Actions } from "../state";
import { makeTuiState } from "../test";
import { _resolveGlobalKey, _resolveTeamCursorDirection, _shouldCommitTeamCursor } from "./view";

describe("resolveGlobalKey", () => {
  test("ctrl+t maps to toggleThinking", () => {
    expect(_resolveGlobalKey("\x14", makeTuiState(), false)).toEqual(Actions.toggleThinking());
  });

  test("ctrl+o maps to toggleToolCards", () => {
    expect(_resolveGlobalKey("\x0f", makeTuiState(), false)).toEqual(Actions.toggleToolCards());
  });

  test("ctrl+k maps to cycleKanbanView", () => {
    expect(_resolveGlobalKey("\x0b", makeTuiState(), false)).toEqual(Actions.cycleKanbanView());
  });

  test("ctrl+t, ctrl+o and ctrl+k stay active while the autocomplete popup is open", () => {
    expect(_resolveGlobalKey("\x14", makeTuiState(), true)).toEqual(Actions.toggleThinking());
    expect(_resolveGlobalKey("\x0f", makeTuiState(), true)).toEqual(Actions.toggleToolCards());
    expect(_resolveGlobalKey("\x0b", makeTuiState(), true)).toEqual(Actions.cycleKanbanView());
  });

  test("left maps to toggling the team panel while the editor cursor sits at the buffer start", () => {
    expect(_resolveGlobalKey("\x1b[D", makeTuiState({ editorCursorAtStart: true }), false)).toEqual(Actions.toggleTeamPanel());
  });

  test("left stays with the kanban panel while the kanban panel view is shown", () => {
    expect(_resolveGlobalKey("\x1b[D", makeTuiState({ editorCursorAtStart: true, kanbanView: "panel" }), false)).toBeNull();
    expect(_resolveGlobalKey("\x1b[D", makeTuiState({ editorCursorAtStart: true, kanbanView: "list" }), false)).toEqual(Actions.toggleTeamPanel());
  });

  test("left is left to the editor once the cursor moves away from the buffer start", () => {
    expect(_resolveGlobalKey("\x1b[D", makeTuiState({ editorCursorAtStart: false }), false)).toBeNull();
  });

  test("left is left to the editor while the autocomplete popup is open", () => {
    expect(_resolveGlobalKey("\x1b[D", makeTuiState({ editorCursorAtStart: true }), true)).toBeNull();
  });

  test("ctrl+down no longer toggles the team panel", () => {
    expect(_resolveGlobalKey("\x1b[1;5B", makeTuiState({ editorCursorAtStart: true }), false)).toBeNull();
  });

  test("plain, shift and other ctrl arrows are left to the editor", () => {
    const state = makeTuiState({ editorCursorAtStart: true });
    expect(_resolveGlobalKey("\x1b[A", state, false)).toBeNull();
    expect(_resolveGlobalKey("\x1b[B", state, false)).toBeNull();
    expect(_resolveGlobalKey("\x1b[C", state, false)).toBeNull();
    expect(_resolveGlobalKey("\x1b[1;2A", state, false)).toBeNull();
    expect(_resolveGlobalKey("\x1b[1;2B", state, false)).toBeNull();
    expect(_resolveGlobalKey("\x1b[1;5A", state, false)).toBeNull();
    expect(_resolveGlobalKey("\x1b[1;2D", state, false)).toBeNull();
    expect(_resolveGlobalKey("\x1b[1;5D", state, false)).toBeNull();
  });

  test("any other key is left to the editor", () => {
    const state = makeTuiState({ editorCursorAtStart: true });
    expect(_resolveGlobalKey("a", state, false)).toBeNull();
    expect(_resolveGlobalKey("\r", state, false)).toBeNull();
  });
});

describe("resolveTeamCursorDirection", () => {
  test("down maps to 1 and up to -1 while the strip is shown", () => {
    const state = makeTuiState({ teamPanelVisible: true });
    expect(_resolveTeamCursorDirection("\x1b[B", state, false)).toBe(1);
    expect(_resolveTeamCursorDirection("\x1b[A", state, false)).toBe(-1);
  });

  test("null while the strip is hidden, so the editor keeps history navigation", () => {
    const state = makeTuiState({ teamPanelVisible: false });
    expect(_resolveTeamCursorDirection("\x1b[B", state, false)).toBeNull();
    expect(_resolveTeamCursorDirection("\x1b[A", state, false)).toBeNull();
  });

  test("null while the autocomplete popup is open, so the popup keeps navigation", () => {
    const state = makeTuiState({ teamPanelVisible: true });
    expect(_resolveTeamCursorDirection("\x1b[B", state, true)).toBeNull();
    expect(_resolveTeamCursorDirection("\x1b[A", state, true)).toBeNull();
  });

  test("null for any other key", () => {
    const state = makeTuiState({ teamPanelVisible: true });
    expect(_resolveTeamCursorDirection("a", state, false)).toBeNull();
    expect(_resolveTeamCursorDirection("\r", state, false)).toBeNull();
    expect(_resolveTeamCursorDirection("\x1b[1;5B", state, false)).toBeNull();
  });
});

describe("shouldCommitTeamCursor", () => {
  test("true when the strip is visible and the cursor differs from the focused agent", () => {
    const state = makeTuiState({ teamPanelVisible: true, focusedAgentId: "t:a-1", teamCursorAgentId: "t:b-1" });
    expect(_shouldCommitTeamCursor(state)).toBe(true);
  });

  test("false when the cursor matches the focused agent", () => {
    const state = makeTuiState({ teamPanelVisible: true, focusedAgentId: "t:a-1", teamCursorAgentId: "t:a-1" });
    expect(_shouldCommitTeamCursor(state)).toBe(false);
  });

  test("false when there is no cursor", () => {
    const state = makeTuiState({ teamPanelVisible: true, focusedAgentId: "t:a-1" });
    expect(_shouldCommitTeamCursor(state)).toBe(false);
  });

  test("false when the strip is hidden", () => {
    const state = makeTuiState({ teamPanelVisible: false, focusedAgentId: "t:a-1", teamCursorAgentId: "t:b-1" });
    expect(_shouldCommitTeamCursor(state)).toBe(false);
  });
});
