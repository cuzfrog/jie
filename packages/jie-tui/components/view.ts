import { type Container, type Loader, type TUI } from "@earendil-works/pi-tui";
import type { JiePlatform } from "@cuzfrog/jie-platform";
import { Actions, TuiState, type Action, type StateStore } from "../state";
import { createChatSync } from "../sync";
import { composeLayout } from "./layout";

export interface TuiView {
  stop(): void;
}

export interface TuiViewDeps {
  readonly tui: TUI;
  readonly stateStore: StateStore;
  readonly platform: JiePlatform;
  readonly cwd: string;
}

export function createTuiView(deps: TuiViewDeps): TuiView {
  return new TuiViewImpl(deps);
}

const CTRL_T = "\x14";
const CTRL_O = "\x0f";
const CYCLE_PREV_KEYS = new Set<string>(["\x1b[1;2A", "\x1b[1;5A"]);
const CYCLE_NEXT_KEYS = new Set<string>(["\x1b[1;2B", "\x1b[1;5B"]);
const CONSUMED = { consume: true } as const;

class TuiViewImpl implements TuiView {
  private readonly stateStore: StateStore;
  private readonly workingSlot: Container;
  private readonly workingIndicator: Loader;
  private readonly unsubscribeActions: () => void;
  private readonly unsubscribeChatSync: () => void;
  private readonly unsubscribeKeys: () => void;

  constructor(deps: TuiViewDeps) {
    this.stateStore = deps.stateStore;
    const layout = composeLayout(deps.tui, deps.stateStore, deps.cwd, deps.platform);
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
    this.unsubscribeActions = deps.stateStore.subscribe(async (): Promise<void> => {
      this.syncWorkingIndicator();
    });
  }

  stop(): void {
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
}

function resolveGlobalKey(data: string): Action | null {
  if (data === CTRL_T) return Actions.toggleThinking();
  if (data === CTRL_O) return Actions.toggleToolCards();
  if (CYCLE_PREV_KEYS.has(data)) return Actions.switchCycleAgent(-1);
  if (CYCLE_NEXT_KEYS.has(data)) return Actions.switchCycleAgent(1);
  return null;
}

export { resolveGlobalKey as _resolveGlobalKey };
