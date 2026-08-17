import { type Editor, type Focusable, type TUI } from "@earendil-works/pi-tui";
import { Actions } from "../state";
import { type StateStore, type TuiState } from "../state";
import { makeTuiState } from "../test";
import type { TuiComponent } from "..";
import type { ChatSync } from "./chat";
import { TuiViewImpl, _resolveFocusTarget, _resolveGlobalKey, _resolveTeamCursorDirection, _shouldCommitTeamCursor } from "./view";
import type { QuestionItem } from "../../platform";

function makeActiveQuestion(): NonNullable<TuiState["question"]> {
  return {
    requestId: "req-1",
    agentId: "t1:a1",
    questions: [] as ReadonlyArray<QuestionItem>,
    questionIndex: 0,
    optionCursor: 0,
    selections: [] as ReadonlyArray<ReadonlyArray<number>>,
    otherText: [] as ReadonlyArray<string | null>,
    editingOther: false,
  };
}

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

  test("global keys are ignored while a question is active", () => {
    const state = makeTuiState({ question: makeActiveQuestion() });
    expect(_resolveGlobalKey("\x14", state, false)).toBeNull();
    expect(_resolveGlobalKey("\x0f", state, false)).toBeNull();
    expect(_resolveGlobalKey("\x1b[D", makeTuiState({ question: makeActiveQuestion(), editorCursorAtStart: true }), false)).toBeNull();
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

  test("question when a question is active", () => {
    const question = makeActiveQuestion();
    expect(_resolveFocusTarget(makeTuiState({ question }))).toBe("question");
  });

  test("question takes priority over a visible kanban panel", () => {
    const question = makeActiveQuestion();
    expect(_resolveFocusTarget(makeTuiState({ kanbanView: "panel", question }))).toBe("question");
  });

  test("mcp when the mcp panel is visible", () => {
    expect(_resolveFocusTarget(makeTuiState({ mcpPanelVisible: true }))).toBe("mcp");
  });

  test("mcp takes priority over a visible kanban panel", () => {
    expect(_resolveFocusTarget(makeTuiState({ mcpPanelVisible: true, kanbanView: "panel" }))).toBe("mcp");
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

  function stubQuestionPanel(): TuiComponent & Focusable {
    return { ...stubComponent(), focused: false };
  }

  function stubScreen() {
    return { addChild: vi.fn(), setFocus: vi.fn(), getFocusedComponent: vi.fn(), addInputListener: vi.fn(() => vi.fn()) };
  }

  function makeStateStore(state: TuiState) {
    return vi.mocked<StateStore>({ getState: vi.fn(() => state), dispatch: vi.fn(), subscribe: vi.fn(() => () => undefined) });
  }

  function bootView(state: TuiState, popupOpen = false) {
    const screen = stubScreen();
    const stateStore = makeStateStore(state);
    const editor = stubEditor(popupOpen);
    const kanbanPanel = stubComponent();
    const mcpPanel = stubComponent();
    const questionPanel = stubQuestionPanel();
    const welcomeBanner = stubComponent();
    const kanbanList = stubComponent();
    const queuedPrompts = stubComponent();
    const workingSpinner = stubComponent();
    const view = new TuiViewImpl(
      screen as unknown as TUI,
      stateStore,
      stubChatSync(),
      kanbanList,
      stubComponent(),
      editor as unknown as Editor & TuiComponent,
      welcomeBanner,
      stubComponent(),
      queuedPrompts,
      stubComponent(),
      kanbanPanel,
      stubComponent(),
      mcpPanel,
      questionPanel,
      workingSpinner,
    );
    return { screen, stateStore, editor, kanbanPanel, mcpPanel, questionPanel, welcomeBanner, kanbanList, queuedPrompts, workingSpinner, view };
  }

  test("constructor focuses the editor", () => {
    const { screen } = bootView(makeTuiState());
    expect(screen.setFocus).toHaveBeenCalledTimes(1);
  });

  test("constructor adds welcome banner before the kanban list", () => {
    const { screen, welcomeBanner, kanbanList } = bootView(makeTuiState());
    const calls = screen.addChild.mock.calls.map(([component]) => component);
    const welcomeIndex = calls.indexOf(welcomeBanner);
    const kanbanIndex = calls.indexOf(kanbanList);
    expect(welcomeIndex).toBeGreaterThan(-1);
    expect(kanbanIndex).toBeGreaterThan(-1);
    expect(welcomeIndex).toBeLessThan(kanbanIndex);
  });

  test("constructor adds the working spinner between queued prompts and the editor", () => {
    const { screen, queuedPrompts, workingSpinner, editor } = bootView(makeTuiState());
    const calls = screen.addChild.mock.calls.map(([component]) => component);
    const queuedIndex = calls.indexOf(queuedPrompts);
    const spinnerIndex = calls.indexOf(workingSpinner);
    const editorIndex = calls.indexOf(editor);
    expect(queuedIndex).toBeGreaterThan(-1);
    expect(spinnerIndex).toBeGreaterThan(-1);
    expect(editorIndex).toBeGreaterThan(-1);
    expect(queuedIndex).toBeLessThan(spinnerIndex);
    expect(spinnerIndex).toBeLessThan(editorIndex);
  });

  test("update focuses the kanban panel when it should receive keys", () => {
    const { screen, view, kanbanPanel } = bootView(makeTuiState({ kanbanView: "panel" }));
    view.update();
    expect(screen.setFocus).toHaveBeenLastCalledWith(kanbanPanel);
  });

  test("update focuses the mcp panel over the kanban panel when both are visible", () => {
    const { screen, view, mcpPanel } = bootView(makeTuiState({ mcpPanelVisible: true, kanbanView: "panel" }));
    view.update();
    expect(screen.setFocus).toHaveBeenLastCalledWith(mcpPanel);
  });

  test("update focuses the question panel when a question is active", () => {
    const { screen, view, questionPanel } = bootView(makeTuiState({ question: makeActiveQuestion() }));
    view.update();
    expect(screen.setFocus).toHaveBeenLastCalledWith(questionPanel);
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

  test("handleInput dispatches terminal focus gained on focus-in", () => {
    const { view, stateStore } = bootView(makeTuiState());
    expect(view.handleInput("\x1b[I")).toEqual({ consume: true });
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.terminalFocusGained());
  });

  test("handleInput dispatches terminal focus lost on focus-out", () => {
    const { view, stateStore } = bootView(makeTuiState());
    expect(view.handleInput("\x1b[O")).toEqual({ consume: true });
    expect(stateStore.dispatch).toHaveBeenCalledWith(Actions.terminalFocusLost());
  });
});
