import { Container, Loader, matchesKey, type Component, type Editor, type TUI } from "@earendil-works/pi-tui";
import { Actions, TuiState, type Action, type StateStore } from "../state";
import type { ChatSync } from "../sync";
import { SPINNER_FRAMES, SPINNER_INTERVAL_MS, WORKING_LABEL, style } from "./themes";
import { StatusLine } from "./status-line";
import { QueuedPrompts } from "./queued-prompts";
import { WelcomeBanner } from "./welcome-banner";
import { TeamPanel } from "./team-panel";
import { KanbanPanel } from "./kanban-panel";

export interface TuiView {
  stop(): void;
}

const CTRL_T = "\x14";
const CTRL_O = "\x0f";
const CTRL_K = "\x0b";
const CTRL_E = "\x05";
const CONSUMED = { consume: true } as const;
const INTERRUPTED_LABEL = "Interrupted";
const TEAM_WORKING_LABEL = "Team working…";
const TEAM_SPINNER_INTERVAL_MS = 1000;
const NO_SPINNER_FRAMES: string[] = [];

export class TuiViewImpl implements TuiView {
  private readonly stateStore: StateStore;
  private readonly workingSlot: Container;
  private readonly workingIndicator: Loader;
  private readonly teamWorkingIndicator: Loader;
  private readonly interruptedIndicator: Loader;
  private readonly chatSync: ChatSync;
  private readonly unsubscribeActions: () => void;
  private readonly unsubscribeKeys: () => void;

  constructor(
    tui: TUI,
    stateStore: StateStore,
    chatSyncFactory: (chatContainer: Container, requestRender: () => void) => ChatSync,
    kanbanList: Component,
    footer: Component,
    jieEditorFactory: (tui: TUI) => Editor,
  ) {
    this.stateStore = stateStore;
    const chatContainer = new Container();
    const editor = jieEditorFactory(tui);
    this.workingSlot = new Container();
    this.workingIndicator = new FlushLoader(tui, style("accent"), style("muted"), WORKING_LABEL, {
      frames: [...SPINNER_FRAMES], intervalMs: SPINNER_INTERVAL_MS,
    });
    this.teamWorkingIndicator = new FlushLoader(tui, style("accent"), style("muted"), TEAM_WORKING_LABEL, {
      frames: [...SPINNER_FRAMES], intervalMs: TEAM_SPINNER_INTERVAL_MS,
    });
    this.interruptedIndicator = new FlushLoader(tui, style("muted"), style("muted"), INTERRUPTED_LABEL, {
      frames: NO_SPINNER_FRAMES,
    });
    tui.addChild(chatContainer);
    tui.addChild(kanbanList);
    tui.addChild(this.workingSlot);
    tui.addChild(new WelcomeBanner(stateStore));
    tui.addChild(new StatusLine(stateStore));
    tui.addChild(new QueuedPrompts(stateStore));
    tui.addChild(editor);
    tui.addChild(footer);
    tui.addChild(new TeamPanel(stateStore));
    tui.addChild(new KanbanPanel(stateStore));
    tui.setFocus(editor);
    this.unsubscribeKeys = tui.addInputListener((data) => {
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
    this.chatSync = chatSyncFactory(chatContainer, () => tui.requestRender());
    this.unsubscribeActions = stateStore.subscribe(async (): Promise<void> => {
      if (this.syncWorkingIndicator()) tui.requestRender();
    });
  }

  stop(): void {
    this.workingIndicator.stop();
    this.teamWorkingIndicator.stop();
    this.chatSync.stop();
    this.unsubscribeKeys();
    this.unsubscribeActions();
  }

  private syncWorkingIndicator(): boolean {
    const state = this.stateStore.getState();
    const kind = TuiState.workingKind(state);
    const mode = kind === "none" && TuiState.isInterrupted(state) ? "interrupted" : kind;
    return syncWorkingSlot(this.workingSlot, this.workingIndicator, this.teamWorkingIndicator, this.interruptedIndicator, mode);
  }
}

class FlushLoader extends Loader {
  render(width: number): string[] {
    return super.render(width).map((line) => (line.startsWith(" ") ? line.slice(1) : line));
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

type WorkingSlotMode = ReturnType<typeof TuiState.workingKind> | "interrupted";

function syncWorkingSlot(slot: Container, working: Loader, teamWorking: Loader, interrupted: Loader, mode: WorkingSlotMode): boolean {
  const target = mode === "focused" ? working : mode === "team" ? teamWorking : mode === "interrupted" ? interrupted : null;
  const current = slot.children[0] ?? null;
  if (current === target) return false;
  if (current === working) working.stop();
  if (current === teamWorking) teamWorking.stop();
  slot.clear();
  if (target === null) return true;
  slot.addChild(target);
  if (mode === "focused" || mode === "team") target.start();
  return true;
}

export {
  FlushLoader as _FlushLoader,
  resolveGlobalKey as _resolveGlobalKey,
  resolveKanbanKey as _resolveKanbanKey,
  resolveTeamCursorDirection as _resolveTeamCursorDirection,
  shouldCommitTeamCursor as _shouldCommitTeamCursor,
  syncWorkingSlot as _syncWorkingSlot,
};
