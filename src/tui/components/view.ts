import { matchesKey, type Editor, type TUI } from "@earendil-works/pi-tui";
import { Actions, type TuiState, type Action, type StateStore } from "../state";
import type { ChatSync } from "../sync";
import type { TuiRoot, TuiComponent } from "..";
import type { WorkingSpinner } from "./working-spinner";

type StoppableComponent = TuiComponent & { stop(): void };

export interface TuiView extends TuiRoot {
  stop(): void;
}

const CTRL_T = "\x14";
const CTRL_O = "\x0f";
const CTRL_K = "\x0b";
const CONSUMED = { consume: true } as const;

export class TuiViewImpl implements TuiView {
  private readonly stateStore: StateStore;
  private readonly chatSync: ChatSync;
  private readonly workingSpinner: WorkingSpinner;
  private readonly editor: Editor & TuiComponent;
  private readonly welcomeBanner: TuiComponent;
  private readonly statusLine: TuiComponent;
  private readonly queuedPrompts: TuiComponent;
  private readonly teamPanel: TuiComponent;
  private readonly kanbanPanel: TuiComponent;
  private readonly helpPanel: TuiComponent;
  private readonly kanbanList: TuiComponent;
  private readonly footer: TuiComponent;
  private readonly transientAger: StoppableComponent;
  private readonly thinkingTicker: StoppableComponent;
  private readonly unsubscribeKeys: () => void;

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
    workingSpinner: WorkingSpinner,
    transientAger: StoppableComponent,
    thinkingTicker: StoppableComponent,
  ) {
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
    this.transientAger = transientAger;
    this.thinkingTicker = thinkingTicker;
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
    this.unsubscribeKeys = screen.addInputListener((data) => {
      const state = this.stateStore.getState();
      const popupOpen = this.editor.isShowingAutocomplete();
      const kanbanAction = this.kanbanPanel.resolveKey?.(data, state, popupOpen) ?? null;
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
    dirty = this.transientAger.update() || dirty;
    dirty = this.thinkingTicker.update() || dirty;
    return dirty;
  }

  stop(): void {
    this.workingSpinner.stop();
    this.transientAger.stop();
    this.thinkingTicker.stop();
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
  resolveTeamCursorDirection as _resolveTeamCursorDirection,
  shouldCommitTeamCursor as _shouldCommitTeamCursor,
};
