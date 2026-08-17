import { matchesKey, type Component, type Editor, type Focusable, type TUI, type TuiInputListenerResult } from "@earendil-works/pi-tui";
import { Actions, type TuiState, type Action, type StateStore } from "../state";
import type { ChatSync } from "./chat";
import type { TuiRoot, TuiComponent } from "..";

export interface TuiView extends TuiRoot {
  handleInput(data: string): TuiInputListenerResult;
  dispose(): void;
}

const CTRL_T = "\x14";
const CTRL_O = "\x0f";
const CTRL_K = "\x0b";
const FOCUS_IN = "\x1b[I";
const FOCUS_OUT = "\x1b[O";
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
  private readonly mcpPanel: TuiComponent;
  private readonly questionPanel: TuiComponent & Focusable;
  private readonly kanbanList: TuiComponent;
  private readonly footer: TuiComponent;
  private focusedComponent: Component;
  private readonly unsubscribeInput: () => void;

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
    mcpPanel: TuiComponent,
    questionPanel: TuiComponent & Focusable,
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
    this.mcpPanel = mcpPanel;
    this.questionPanel = questionPanel;
    this.kanbanList = kanbanList;
    this.footer = footer;
    this.focusedComponent = this.editor;
    screen.addChild(this.chatSync);
    screen.addChild(this.welcomeBanner);
    screen.addChild(this.kanbanList);
    screen.addChild(this.statusLine);
    screen.addChild(this.queuedPrompts);
    screen.addChild(workingSpinner);
    screen.addChild(this.editor);
    screen.addChild(this.footer);
    screen.addChild(this.teamPanel);
    screen.addChild(this.kanbanPanel);
    screen.addChild(this.helpPanel);
    screen.addChild(this.mcpPanel);
    screen.addChild(this.questionPanel);
    screen.setFocus(this.editor);
    this.unsubscribeInput = screen.addInputListener((data) => this.handleInput(data));
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
    dirty = this.mcpPanel.update() || dirty;
    dirty = this.questionPanel.update() || dirty;
    dirty = this.kanbanList.update() || dirty;
    dirty = this.footer.update() || dirty;
    dirty = this.chatSync.update() || dirty;
    this.reconcileFocus(this.stateStore.getState());
    return dirty;
  }

  handleInput(data: string): TuiInputListenerResult {
    const focusAction = resolveFocusSequence(data);
    if (focusAction !== null) {
      this.stateStore.dispatch(focusAction);
      return CONSUMED;
    }
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

  dispose(): void {
    this.unsubscribeInput();
  }

  private reconcileFocus(state: TuiState): void {
    const targetName = resolveFocusTarget(state);
    const target = targetName === "question" ? this.questionPanel : targetName === "kanban" ? this.kanbanPanel : this.editor;
    if (target === this.focusedComponent) return;
    this.focusedComponent = target;
    this.screen.setFocus(target);
  }
}

function resolveGlobalKey(data: string, state: TuiState, popupOpen: boolean): Action | null {
  if (state.question !== null) return null;
  if (data === CTRL_T) return Actions.toggleThinking();
  if (data === CTRL_O) return Actions.toggleToolCards();
  if (data === CTRL_K && state.kanban.edit === null && state.kanban.board.length > 0) return Actions.cycleKanbanView();
  if (matchesKey(data, "left") && state.editorCursorAtStart && state.kanban.view !== "panel" && !popupOpen) return Actions.toggleTeamPanel();
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

function resolveFocusTarget(state: TuiState): "question" | "kanban" | "editor" {
  if (state.question !== null) return "question";
  return state.kanban.view === "panel" && state.kanban.edit === null ? "kanban" : "editor";
}

function resolveFocusSequence(data: string): Action | null {
  if (data === FOCUS_IN) return Actions.terminalFocusGained();
  if (data === FOCUS_OUT) return Actions.terminalFocusLost();
  return null;
}

export {
  resolveGlobalKey as _resolveGlobalKey,
  resolveTeamCursorDirection as _resolveTeamCursorDirection,
  shouldCommitTeamCursor as _shouldCommitTeamCursor,
  resolveFocusTarget as _resolveFocusTarget,
};
