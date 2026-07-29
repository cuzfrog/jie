import { Container, Loader, matchesKey, type Component, type Editor, type TUI } from "@earendil-works/pi-tui";
import { Actions, TuiState, type Action, type StateStore } from "../state";
import type { ChatSync } from "../sync";
import { SPINNER_FRAMES, SPINNER_INTERVAL_MS, WORKING_LABEL, style } from "./themes";
import { StatusLine } from "./status-line";
import { WelcomeBanner } from "./welcome-banner";
import { TeamPanel } from "./team-panel";

export interface TuiView {
  stop(): void;
}

const CTRL_T = "\x14";
const CTRL_O = "\x0f";
const CONSUMED = { consume: true } as const;
const INTERRUPTED_LABEL = "Interrupted";
const NO_SPINNER_FRAMES: string[] = [];

export class TuiViewImpl implements TuiView {
  private readonly stateStore: StateStore;
  private readonly workingSlot: Container;
  private readonly workingIndicator: Loader;
  private readonly interruptedIndicator: Loader;
  private readonly chatSync: ChatSync;
  private readonly unsubscribeActions: () => void;
  private readonly unsubscribeKeys: () => void;

  constructor(
    tui: TUI,
    stateStore: StateStore,
    chatSyncFactory: (chatContainer: Container, requestRender: () => void) => ChatSync,
    todoList: Component,
    footer: Component,
    jieEditorFactory: (tui: TUI) => Editor,
  ) {
    this.stateStore = stateStore;
    const chatContainer = new Container();
    const editor = jieEditorFactory(tui);
    this.workingSlot = new Container();
    this.workingIndicator = new Loader(tui, style("accent"), style("muted"), WORKING_LABEL, {
      frames: [...SPINNER_FRAMES], intervalMs: SPINNER_INTERVAL_MS,
    });
    this.interruptedIndicator = new Loader(tui, style("muted"), style("muted"), INTERRUPTED_LABEL, {
      frames: NO_SPINNER_FRAMES,
    });
    tui.addChild(chatContainer);
    tui.addChild(todoList);
    tui.addChild(this.workingSlot);
    tui.addChild(new StatusLine(stateStore));
    tui.addChild(new WelcomeBanner(stateStore));
    tui.addChild(editor);
    tui.addChild(footer);
    tui.addChild(new TeamPanel(stateStore));
    tui.setFocus(editor);
    this.unsubscribeKeys = tui.addInputListener((data) => {
      const action = resolveGlobalKey(data);
      if (action !== null) {
        this.stateStore.dispatch(action);
        return CONSUMED;
      }
      const state = this.stateStore.getState();
      if (matchesKey(data, "enter") && shouldCommitTeamCursor(state)) {
        this.stateStore.dispatch(Actions.commitTeamCursor());
        return CONSUMED;
      }
      const direction = resolveTeamCursorDirection(data, state, editor.isShowingAutocomplete());
      if (direction !== null) {
        this.stateStore.dispatch(Actions.switchCycleAgent(direction));
        return CONSUMED;
      }
      return undefined;
    });
    this.chatSync = chatSyncFactory(chatContainer, () => tui.requestRender());
    this.unsubscribeActions = stateStore.subscribe(async (): Promise<void> => {
      if (this.syncWorkingIndicator()) tui.requestRender();
    });
  }

  stop(): void {
    this.workingIndicator.stop();
    this.chatSync.stop();
    this.unsubscribeKeys();
    this.unsubscribeActions();
  }

  private syncWorkingIndicator(): boolean {
    const state = this.stateStore.getState();
    const busy = TuiState.isBusy(state);
    const interrupted = TuiState.isInterrupted(state);
    return syncWorkingSlot(this.workingSlot, this.workingIndicator, this.interruptedIndicator, busy, interrupted);
  }
}

function resolveGlobalKey(data: string): Action | null {
  if (data === CTRL_T) return Actions.toggleThinking();
  if (data === CTRL_O) return Actions.toggleToolCards();
  if (matchesKey(data, "ctrl+down")) return Actions.toggleTeamPanel();
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

function syncWorkingSlot(slot: Container, working: Loader, interrupted: Loader, busy: boolean, showInterrupted: boolean): boolean {
  const current = slot.children[0] ?? null;
  if (busy) {
    if (current === working) return false;
    slot.clear();
    slot.addChild(working);
    working.start();
    return true;
  }
  if (current === working) working.stop();
  if (showInterrupted) {
    if (current === interrupted) return false;
    slot.clear();
    slot.addChild(interrupted);
    return true;
  }
  if (current === null) return false;
  slot.clear();
  return true;
}

export {
  resolveGlobalKey as _resolveGlobalKey,
  resolveTeamCursorDirection as _resolveTeamCursorDirection,
  shouldCommitTeamCursor as _shouldCommitTeamCursor,
  syncWorkingSlot as _syncWorkingSlot,
};
