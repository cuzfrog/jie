import { type Container, type Loader, type OverlayHandle, type TUI } from "@earendil-works/pi-tui";
import type { SessionSummary } from "@cuzfrog/jie-platform";
import { Actions, TuiState, type Action, type StateStore } from "../state";
import { createChatSync } from "../sync";
import { SessionPicker } from "./session-picker";
import { composeLayout } from "./layout";

export interface TuiView {
  stop(): void;
}

export interface TuiViewDeps {
  readonly tui: TUI;
  readonly stateStore: StateStore;
  readonly cwd: string;
}

export function createTuiView(deps: TuiViewDeps): TuiView {
  return new TuiViewImpl(deps);
}

const OPEN_SESSION_PICKER = Actions.openSessionPicker([]).type;
const CLOSE_SESSION_PICKER = Actions.closeSessionPicker().type;
const SELECT_PICKED_SESSION = Actions.selectPickedSession("", "").type;
const CTRL_T = "\x14";
const CTRL_O = "\x0f";
const CYCLE_PREV_KEYS = new Set<string>(["\x1b[1;2A", "\x1b[1;5A"]);
const CYCLE_NEXT_KEYS = new Set<string>(["\x1b[1;2B", "\x1b[1;5B"]);
const CONSUMED = { consume: true } as const;

class TuiViewImpl implements TuiView {
  private readonly tui: TUI;
  private readonly stateStore: StateStore;
  private readonly workingSlot: Container;
  private readonly workingIndicator: Loader;
  private readonly unsubscribeActions: () => void;
  private readonly unsubscribeChatSync: () => void;
  private readonly unsubscribeKeys: () => void;
  private sessionPickerHandle: OverlayHandle | null = null;

  constructor(deps: TuiViewDeps) {
    this.tui = deps.tui;
    this.stateStore = deps.stateStore;
    const layout = composeLayout(deps.tui, deps.stateStore, deps.cwd);
    this.workingSlot = layout.workingSlot;
    this.workingIndicator = layout.workingIndicator;
    this.unsubscribeKeys = deps.tui.addInputListener((data) => {
      const action = resolveGlobalKey(data);
      if (action === null) return undefined;
      this.stateStore.dispatch(action);
      return CONSUMED;
    });
    this.unsubscribeChatSync = createChatSync(deps.stateStore, layout.chatContainer, () => {
      deps.tui.requestRender();
    });
    this.unsubscribeActions = deps.stateStore.subscribe(async (action): Promise<void> => {
      this.syncWorkingIndicator();
      if (action.type === OPEN_SESSION_PICKER) {
        this.showSessionPicker(action.payload.sessions);
        return;
      }
      if (action.type === CLOSE_SESSION_PICKER) {
        this.hideSessionPicker();
        return;
      }
      if (action.type === SELECT_PICKED_SESSION) {
        this.hideSessionPicker();
        this.stateStore.dispatch(Actions.closeSessionPicker());
        return;
      }
    });
  }

  stop(): void {
    this.sessionPickerHandle = null;
    this.workingIndicator.stop();
    this.unsubscribeChatSync();
    this.unsubscribeKeys();
    this.unsubscribeActions();
  }

  private syncWorkingIndicator(): void {
    const busy = TuiState.isBusy(this.stateStore.getState());
    const mounted = this.workingSlot.children.length > 0;
    if (busy && !mounted) {
      this.workingSlot.addChild(this.workingIndicator);
      this.workingIndicator.start();
    } else if (!busy && mounted) {
      this.workingIndicator.stop();
      this.workingSlot.removeChild(this.workingIndicator);
    }
  }

  private showSessionPicker(sessions: ReadonlyArray<SessionSummary>): void {
    const teamId = this.stateStore.getState().teamId;
    if (teamId === null) return;
    const picker = new SessionPicker(sessions, this.stateStore, {
      onSelect: (sessionId) => {
        this.stateStore.dispatch(Actions.selectPickedSession(teamId, sessionId));
      },
      onCancel: () => {
        this.stateStore.dispatch(Actions.closeSessionPicker());
      },
    });
    this.sessionPickerHandle = this.tui.showOverlay(picker, { width: "100%", maxHeight: "60%" });
  }

  private hideSessionPicker(): void {
    if (this.sessionPickerHandle !== null) {
      this.sessionPickerHandle.hide();
      this.sessionPickerHandle = null;
    }
  }
}

function resolveGlobalKey(data: string): Action | null {
  if (data === CTRL_T) return Actions.toggleThinking();
  if (data === CTRL_O) return Actions.toggleToolCards();
  if (CYCLE_PREV_KEYS.has(data)) return Actions.switchCycleAgent(-1);
  if (CYCLE_NEXT_KEYS.has(data)) return Actions.switchCycleAgent(1);
  return null;
}

export { resolveGlobalKey as _resolveGlobalKey };
