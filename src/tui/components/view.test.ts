import { type Editor, type TUI } from "@earendil-works/pi-tui";
import { Actions } from "../state";
import { type StateStore, type TuiState } from "../state";
import { makeTuiState } from "../test";
import type { TuiComponent } from "..";
import type { ChatSync } from "./chat";
import { TuiViewImpl, _resolveFocusTarget, _resolveGlobalKey, _resolveTeamCursorDirection, _shouldCommitTeamCursor } from "./view";

describe("resolveGlobalKey", () => {
  test("ctrl+t maps to toggleThinking", () => {
    expect(_resolveGlobalKey("\x14", makeTuiState(), false)).toEqual(Actions.toggleThinking());
  });

  test("ctrl+o maps to toggleToolCards", () => {
    expect(_resolveGlobalKey("\x0f", makeTuiState(), false)).toEqual(Actions.toggleToolCards());
  });

  test("ctrl+k maps to cycleKanbanView when the board has cards", () => {
    expect(_resolveGlobalKey("\x0b", makeTuiState({ kanbanBoard: [{ id: "1", content: "x", status: "pending" }] }), false)).toEqual(Actions.cycleKanbanView());
  });

  test("ctrl+k is ignored when the kanban board is empty", () => {
    expect(_resolveGlobalKey("\x0b", makeTuiState(), false)).toBeNull();
  });

  test("ctrl+t, ctrl+o and ctrl+k stay active while the autocomplete popup is open", () => {
    const withCards = makeTuiState({ kanbanBoard: [{ id: "1", content: "x", status: "pending" }] });
    expect(_resolveGlobalKey("\x14", withCards, true)).toEqual(Actions.toggleThinking());
    expect(_resolveGlobalKey("\x0f", withCards, true)).toEqual(Actions.toggleToolCards());
    expect(_resolveGlobalKey("\x0b", withCards, true)).toEqual(Actions.cycleKanbanView());
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

describe("resolveFocusTarget", () => {
  test("kanban when the panel is shown and not editing", () => {
    expect(_resolveFocusTarget(makeTuiState({ kanbanView: "panel" }))).toBe("kanban");
  });

  test("editor when the panel is hidden", () => {
    expect(_resolveFocusTarget(makeTuiState({ kanbanView: "hidden" }))).toBe("editor");
  });

  test("editor when the panel is a list", () => {
    expect(_resolveFocusTarget(makeTuiState({ kanbanView: "list" }))).toBe("editor");
  });

  test("editor while editing a kanban card", () => {
    expect(_resolveFocusTarget(makeTuiState({ kanbanView: "panel", kanbanEdit: "#1" }))).toBe("editor");
  });
});

describe("TuiViewImpl", () => {
  function stubComponent(): TuiComponent {
    return { render: () => [], update: () => false, invalidate: () => undefined } as unknown as TuiComponent;
  }

  function stubEditor(popupOpen = false) {
    return { ...stubComponent(), isShowingAutocomplete: vi.fn(() => popupOpen), getText: () => "" };
  }

  function stubChatSync(): ChatSync {
    return stubComponent() as unknown as ChatSync;
  }

  function stubScreen() {
    return { addChild: vi.fn(), setFocus: vi.fn(), getFocusedComponent: vi.fn() };
  }

  function makeStateStore(state: TuiState) {
    return vi.mocked<StateStore>({ getState: vi.fn(() => state), dispatch: vi.fn(), subscribe: vi.fn(() => () => undefined) });
  }

  function bootView(state: TuiState, popupOpen = false) {
    const screen = stubScreen();
    const stateStore = makeStateStore(state);
    const editor = stubEditor(popupOpen);
    const kanbanPanel = stubComponent();
    const view = new TuiViewImpl(
      screen as unknown as TUI,
      stateStore,
      stubChatSync(),
      stubComponent(),
      stubComponent(),
      editor as unknown as Editor & TuiComponent,
      stubComponent(),
      stubComponent(),
      stubComponent(),
      stubComponent(),
      kanbanPanel,
      stubComponent(),
      stubComponent(),
    );
    return { screen, stateStore, editor, kanbanPanel, view };
  }

  test("constructor focuses the editor", () => {
    const { screen } = bootView(makeTuiState());
    expect(screen.setFocus).toHaveBeenCalledTimes(1);
  });

  test("update focuses the kanban panel when it should receive keys", () => {
    const { screen, view, kanbanPanel } = bootView(makeTuiState({ kanbanView: "panel" }));
    view.update();
    expect(screen.setFocus).toHaveBeenLastCalledWith(kanbanPanel);
  });

  test("update returns focus to the editor when editing a kanban card", () => {
    const { screen, view, editor, stateStore, kanbanPanel } = bootView(makeTuiState({ kanbanView: "panel" }));
    view.update();
    expect(screen.setFocus).toHaveBeenLastCalledWith(kanbanPanel);
    stateStore.getState.mockReturnValue(makeTuiState({ kanbanView: "panel", kanbanEdit: "#1" }));
    view.update();
    expect(screen.setFocus).toHaveBeenLastCalledWith(editor);
  });

  test("update does not call setFocus when the target is unchanged", () => {
    const { screen, view } = bootView(makeTuiState({ kanbanView: "panel" }));
    view.update();
    const count = screen.setFocus.mock.calls.length;
    view.update();
    expect(screen.setFocus).toHaveBeenCalledTimes(count);
  });

  test("handleInput consumes global keys regardless of focus", () => {
    const { view, stateStore } = bootView(makeTuiState({ kanbanView: "panel" }));
    view.update();
    expect(view.handleInput("\x14")).toEqual({ consume: true });
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.toggleThinking());
  });

  test("handleInput handles team cursor only when the editor is focused", () => {
    const { view, stateStore } = bootView(makeTuiState({ teamPanelVisible: true, focusedAgentId: "t:a-1", teamCursorAgentId: "t:b-1" }));
    expect(view.handleInput("\r")).toEqual({ consume: true });
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.commitTeamCursor());
    stateStore.dispatch.mockClear();
    const focused = bootView(makeTuiState({ kanbanView: "panel", teamPanelVisible: true, focusedAgentId: "t:a-1", teamCursorAgentId: "t:b-1" }));
    focused.view.update();
    expect(focused.view.handleInput("\r")).toBeUndefined();
    expect(focused.stateStore.dispatch).not.toHaveBeenCalledWith(Actions.commitTeamCursor());
  });

  test("handleInput leaves panel keys for the focused kanban panel", () => {
    const { view, stateStore } = bootView(makeTuiState({ kanbanView: "panel" }));
    view.update();
    expect(view.handleInput("\x1b[A")).toBeUndefined();
    expect(stateStore.dispatch).not.toHaveBeenCalledWith(Actions.moveKanbanCursor("up"));
  });
});
