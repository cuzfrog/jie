import { matchesKey, type Component, type Editor, type TUI, type TuiInputListenerResult } from "@earendil-works/pi-tui";
import { Actions, type TuiState, type Action, type StateStore } from "../state";
import type { ChatSync } from "../sync";
import type { TuiRoot, TuiComponent } from "..";

export interface TuiView extends TuiRoot {
  handleInput(data: string): TuiInputListenerResult;
}

const CTRL_T = "\x14";
const CTRL_O = "\x0f";
const CTRL_K = "\x0b";
const CONSUMED = { consume: true } as const;

export class TuiViewImpl implements TuiView {
  private readonly screen: TUI;
  private readonly stateStore: StateStore;
  private readonly chatSync: ChatSync;
  private readonly workingSpinner: TuiComponent;
  private readonly editor: Editor & TuiComponent;
  private readonly welcomeBanner: TuiComponent;
  private readonly statusLine: TuiComponent;
  private readonly queuedPrompts: TuiComponent;
  private readonly teamPanel: TuiComponent;
  private readonly kanbanPanel: TuiComponent;
  private readonly helpPanel: TuiComponent;
  private readonly kanbanList: TuiComponent;
  private readonly footer: TuiComponent;
  private focusedComponent: Component;

  constructor(
    screen: TUI,
    stateStore: StateStore,
    chatSync: ChatSync,
    kanbanList: TuiComponent,
    footer: TuiComponent,
    editor: Editor & TuiComponent,
    welcomeBanner: TuiComponent,
    statusLine: TuiComponent,
    queuedPrompts: TuiComponent,
    teamPanel: TuiComponent,
    kanbanPanel: TuiComponent,
    helpPanel: TuiComponent,
    workingSpinner: TuiComponent,
  ) {
    this.screen = screen;
    this.stateStore = stateStore;
    this.chatSync = chatSync;
    this.workingSpinner = workingSpinner;
    this.editor = editor;
    this.welcomeBanner = welcomeBanner;
    this.statusLine = statusLine;
    this.queuedPrompts = queuedPrompts;
    this.teamPanel = teamPanel;
    this.kanbanPanel = kanbanPanel;
    this.helpPanel = helpPanel;
    this.kanbanList = kanbanList;
    this.footer = footer;
    this.focusedComponent = this.editor;
    screen.addChild(this.chatSync);
    screen.addChild(this.kanbanList);
    screen.addChild(workingSpinner);
    screen.addChild(this.welcomeBanner);
    screen.addChild(this.statusLine);
    screen.addChild(this.queuedPrompts);
    screen.addChild(this.editor);
    screen.addChild(this.footer);
    screen.addChild(this.teamPanel);
    screen.addChild(this.kanbanPanel);
    screen.addChild(this.helpPanel);
    screen.setFocus(this.editor);
  }

  update(): boolean {
    let dirty = this.workingSpinner.update();
    dirty = this.editor.update() || dirty;
    dirty = this.welcomeBanner.update() || dirty;
    dirty = this.statusLine.update() || dirty;
    dirty = this.queuedPrompts.update() || dirty;
    dirty = this.teamPanel.update() || dirty;
    dirty = this.kanbanPanel.update() || dirty;
    dirty = this.helpPanel.update() || dirty;
    dirty = this.kanbanList.update() || dirty;
    dirty = this.footer.update() || dirty;
    dirty = this.chatSync.update() || dirty;
    this.reconcileFocus(this.stateStore.getState());
    return dirty;
  }

  handleInput(data: string): TuiInputListenerResult {
    const state = this.stateStore.getState();
    const popupOpen = this.editor.isShowingAutocomplete();
    const action = resolveGlobalKey(data, state, popupOpen);
    if (action !== null) {
      this.stateStore.dispatch(action);
      return CONSUMED;
    }
    if (this.focusedComponent === this.editor) {
      if (matchesKey(data, "enter") && shouldCommitTeamCursor(state)) {
        this.stateStore.dispatch(Actions.commitTeamCursor());
        return CONSUMED;
      }
      const direction = resolveTeamCursorDirection(data, state, popupOpen);
      if (direction !== null) {
        this.stateStore.dispatch(Actions.switchCycleAgent(direction));
        return CONSUMED;
      }
    }
    return undefined;
  }

  private reconcileFocus(state: TuiState): void {
    const target = resolveFocusTarget(state) === "kanban" ? this.kanbanPanel : this.editor;
    if (target === this.focusedComponent) return;
    this.focusedComponent = target;
    this.screen.setFocus(target);
  }
}

function resolveGlobalKey(data: string, state: TuiState, popupOpen: boolean): Action | null {
  if (data === CTRL_T) return Actions.toggleThinking();
  if (data === CTRL_O) return Actions.toggleToolCards();
  if (data === CTRL_K && state.kanbanEdit === null) return Actions.cycleKanbanView();
  if (matchesKey(data, "left") && state.editorCursorAtStart && state.kanbanView !== "panel" && !popupOpen) return Actions.toggleTeamPanel();
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

function resolveFocusTarget(state: TuiState): "kanban" | "editor" {
  return state.kanbanView === "panel" && state.kanbanEdit === null ? "kanban" : "editor";
}

export {
  resolveGlobalKey as _resolveGlobalKey,
  resolveTeamCursorDirection as _resolveTeamCursorDirection,
  shouldCommitTeamCursor as _shouldCommitTeamCursor,
  resolveFocusTarget as _resolveFocusTarget,
};
