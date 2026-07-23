import { logger } from "@cuzfrog/jie-platform";
import type { TuiState } from "./state";
import { reduce } from "./reducer";
import type { Action } from "./actions";

const log = logger.getSubLogger({ name: "jie.tui.state-store" });

const INITIAL_TUI_STATE: TuiState = Object.freeze({
  cwd: null,
  gitBranch: null,
  gitDirty: false,
  teamId: null,
  leaderAgentId: null,
  agents: new Map(),
  focusedAgentId: null,
  transientMessage: null,
  errorBanner: null,
  thinkingExpanded: false,
  toolCardsExpanded: false,
  pendingQuit: false,
  editorText: "",
} as const);

/** a subscriber can perform side effect */
type ActionCallback = (action: Action, afterState: TuiState, beforeState: TuiState) => Promise<void>;

export interface StateStore {
  getState(): TuiState;
  dispatch(action: Action): void;
  /** a subscriber can perform side effect upon action; return unsubscribe stub. */
  subscribe(listener: ActionCallback): () => void;
}

export class StateStoreImpl implements StateStore {
  private state: TuiState = INITIAL_TUI_STATE;
  private readonly callbacks = new Set<ActionCallback>();

  getState(): TuiState {
    return this.state;
  }

  dispatch(action: Action): void {
    const beforeState = this.state;
    const afterState = reduce(beforeState, action);
    this.state = afterState;
    for (const callback of this.callbacks) {
      void Promise.resolve(callback(action, afterState, beforeState)).catch((error: unknown) => {
        log.error({ action, error }, "subscriber callback failed");
      });
    }
  }

  subscribe(listener: ActionCallback): () => void {
    this.callbacks.add(listener);
    return (): void => {
      this.callbacks.delete(listener);
    };
  }
}
