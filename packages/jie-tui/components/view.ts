import { type Component, type Container, type Editor, type Loader, type TUI } from "@earendil-works/pi-tui";
import { Actions, TuiState, type Action, type StateStore } from "../state";
import type { ChatSync } from "../sync";
import { composeLayout } from "./layout";

export interface TuiView {
  stop(): void;
}

const CTRL_T = "\x14";
const CTRL_O = "\x0f";
const CYCLE_PREV_KEYS = new Set<string>(["\x1b[1;2A", "\x1b[1;5A"]);
const CYCLE_NEXT_KEYS = new Set<string>(["\x1b[1;2B", "\x1b[1;5B"]);
const CONSUMED = { consume: true } as const;

export class TuiViewImpl implements TuiView {
  private readonly stateStore: StateStore;
  private readonly workingSlot: Container;
  private readonly workingIndicator: Loader;
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
    const layout = composeLayout(tui, stateStore, todoList, footer, jieEditorFactory);
    this.workingSlot = layout.workingSlot;
    this.workingIndicator = layout.workingIndicator;
    this.unsubscribeKeys = tui.addInputListener((data) => {
      const action = resolveGlobalKey(data);
      if (action === null) return undefined;
      this.stateStore.dispatch(action);
      return CONSUMED;
    });
    this.chatSync = chatSyncFactory(layout.chatContainer, () => tui.requestRender());
    this.unsubscribeActions = stateStore.subscribe(async (): Promise<void> => {
      this.syncWorkingIndicator();
    });
  }

  stop(): void {
    this.workingIndicator.stop();
    this.chatSync.stop();
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
}

function resolveGlobalKey(data: string): Action | null {
  if (data === CTRL_T) return Actions.toggleThinking();
  if (data === CTRL_O) return Actions.toggleToolCards();
  if (CYCLE_PREV_KEYS.has(data)) return Actions.switchCycleAgent(-1);
  if (CYCLE_NEXT_KEYS.has(data)) return Actions.switchCycleAgent(1);
  return null;
}

export { resolveGlobalKey as _resolveGlobalKey };
