import { Container, matchesKey, type Component, type Editor, type TUI } from "@earendil-works/pi-tui";
import { Actions, type TuiState, type Action, type StateStore } from "../state";
import type { ChatSync } from "../sync";
import type { WorkingSpinner } from "./working-spinner";

export interface TuiView {
  start(): void;
  stop(): void;
}

const CTRL_T = "\x14";
const CTRL_O = "\x0f";
const CTRL_K = "\x0b";
const CTRL_E = "\x05";
const CONSUMED = { consume: true } as const;

export class TuiViewImpl implements TuiView {
  private readonly stateStore: StateStore;
  private readonly chatSync: ChatSync;
  private readonly workingSpinner: WorkingSpinner;
  private readonly unsubscribeKeys: () => void;

  constructor(
    screen: TUI,
    stateStore: StateStore,
    chatContainer: Container,
    chatSync: ChatSync,
    kanbanList: Component,
    footer: Component,
    editor: Editor,
    welcomeBanner: Component,
    statusLine: Component,
    queuedPrompts: Component,
    teamPanel: Component,
    kanbanPanel: Component,
    helpPanel: Component,
    workingSpinner: WorkingSpinner,
  ) {
    this.stateStore = stateStore;
    this.chatSync = chatSync;
    this.workingSpinner = workingSpinner;
    screen.addChild(chatContainer);
    screen.addChild(kanbanList);
    screen.addChild(workingSpinner);
    screen.addChild(welcomeBanner);
    screen.addChild(statusLine);
    screen.addChild(queuedPrompts);
    screen.addChild(editor);
    screen.addChild(footer);
    screen.addChild(teamPanel);
    screen.addChild(kanbanPanel);
    screen.addChild(helpPanel);
    screen.setFocus(editor);
    this.unsubscribeKeys = screen.addInputListener((data) => {
      const state = this.stateStore.getState();
      const popupOpen = editor.isShowingAutocomplete();
      const kanbanAction = resolveKanbanKey(data, state, popupOpen);
      if (kanbanAction !== null) {
        this.stateStore.dispatch(kanbanAction);
        return CONSUMED;
      }
      const action = resolveGlobalKey(data, state, popupOpen);
      if (action !== null) {
        this.stateStore.dispatch(action);
        return CONSUMED;
      }
      if (matchesKey(data, "enter") && shouldCommitTeamCursor(state)) {
        this.stateStore.dispatch(Actions.commitTeamCursor());
        return CONSUMED;
      }
      const direction = resolveTeamCursorDirection(data, state, popupOpen);
      if (direction !== null) {
        this.stateStore.dispatch(Actions.switchCycleAgent(direction));
        return CONSUMED;
      }
      return undefined;
    });
  }

  start(): void {
    this.chatSync.start();
    this.workingSpinner.start();
  }

  stop(): void {
    this.workingSpinner.stop();
    this.chatSync.stop();
    this.unsubscribeKeys();
  }
}

function resolveGlobalKey(data: string, state: TuiState, popupOpen: boolean): Action | null {
  if (data === CTRL_T) return Actions.toggleThinking();
  if (data === CTRL_O) return Actions.toggleToolCards();
  if (data === CTRL_K && state.kanbanEdit === null) return Actions.cycleKanbanView();
  if (matchesKey(data, "left") && state.editorCursorAtStart && state.kanbanView !== "panel" && !popupOpen) return Actions.toggleTeamPanel();
  return null;
}

function resolveKanbanKey(data: string, state: TuiState, popupOpen: boolean): Action | null {
  if (state.kanbanView !== "panel" || state.kanbanEdit !== null || popupOpen) return null;
  if (matchesKey(data, "esc") && state.kanbanExpanded) return Actions.toggleKanbanExpand();
  if (matchesKey(data, "tab")) return Actions.toggleKanbanExpand();
  if (state.kanbanExpanded) {
    if (matchesKey(data, "up")) return Actions.moveKanbanEditField("up");
    if (matchesKey(data, "down")) return Actions.moveKanbanEditField("down");
    if (data === CTRL_E && state.kanbanCursor !== null) return Actions.commitKanbanEdit(state.kanbanCursor, state.kanbanEditField);
    return null;
  }
  if (matchesKey(data, "up")) return Actions.moveKanbanCursor("up");
  if (matchesKey(data, "down")) return Actions.moveKanbanCursor("down");
  if (matchesKey(data, "left")) return Actions.moveKanbanCursor("left");
  if (matchesKey(data, "right")) return Actions.moveKanbanCursor("right");
  if (data === CTRL_E && state.kanbanCursor !== null) return Actions.commitKanbanEdit(state.kanbanCursor);
  return null;
}

function resolveTeamCursorDirection(data: string, state: TuiState, popupOpen: boolean): 1 | -1 | null {
  if (!state.teamPanelVisible || popupOpen) return null;
  if (matchesKey(data, "down")) return 1;
  if (matchesKey(data, "up")) return -1;
  return null;
}

function shouldCommitTeamCursor(state: TuiState): boolean {
  return state.teamPanelVisible && state.teamCursorAgentId !== null && state.teamCursorAgentId !== state.focusedAgentId;
}

export {
  resolveGlobalKey as _resolveGlobalKey,
  resolveKanbanKey as _resolveKanbanKey,
  resolveTeamCursorDirection as _resolveTeamCursorDirection,
  shouldCommitTeamCursor as _shouldCommitTeamCursor,
};
