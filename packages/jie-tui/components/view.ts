import { Container, Loader, type Component, type Editor, type TUI } from "@earendil-works/pi-tui";
import { Actions, TuiState, type Action, type StateStore } from "../state";
import type { ChatSync } from "../sync";
import { SPINNER_FRAMES, SPINNER_INTERVAL_MS, WORKING_LABEL, style } from "./themes";
import { StatusLine } from "./status-line";
import { WelcomeBanner } from "./welcome-banner";
import { SplitPane, panelWidth } from "./split-pane";
import { TeamPanel } from "./team-panel";

export interface TuiView {
  stop(): void;
}

const CTRL_T = "\x14";
const CTRL_O = "\x0f";
const CYCLE_PREV_KEYS = new Set<string>(["\x1b[1;2A", "\x1b[1;5A"]);
const CYCLE_NEXT_KEYS = new Set<string>(["\x1b[1;2B", "\x1b[1;5B"]);
const TOGGLE_PANEL_KEYS = new Set<string>(["\x1b[1;2D", "\x1b[1;5D"]);
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
    const panelWidthWhenVisible = (columns: number) => (stateStore.getState().teamPanelVisible ? panelWidth(columns) : null);
    tui.addChild(new SplitPane(new TeamPanel(stateStore), chatContainer, panelWidthWhenVisible));
    tui.addChild(todoList);
    tui.addChild(this.workingSlot);
    tui.addChild(new StatusLine(stateStore));
    tui.addChild(new WelcomeBanner(stateStore));
    tui.addChild(editor);
    tui.addChild(footer);
    tui.setFocus(editor);
    this.unsubscribeKeys = tui.addInputListener((data) => {
      const action = resolveGlobalKey(data);
      if (action === null) return undefined;
      this.stateStore.dispatch(action);
      return CONSUMED;
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
  if (CYCLE_PREV_KEYS.has(data)) return Actions.switchCycleAgent(-1);
  if (CYCLE_NEXT_KEYS.has(data)) return Actions.switchCycleAgent(1);
  if (TOGGLE_PANEL_KEYS.has(data)) return Actions.toggleTeamPanel();
  return null;
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

export { resolveGlobalKey as _resolveGlobalKey, syncWorkingSlot as _syncWorkingSlot };
