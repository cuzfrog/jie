import { logger } from "@cuzfrog/jie-platform";
import type { TuiState, AgentUiState } from "./state";
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
  showTeamRailPanel: false,
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
  getFocusedAgent(): AgentUiState | null;
  isBusy(): boolean;
}

export function createStateStore(): StateStore {
  let state: TuiState = INITIAL_TUI_STATE;
  const callbacks = new Set<ActionCallback>();
  return {
    getState(): TuiState {
      return state;
    },
    dispatch(action: Action): void {
      const beforeState = state;
      const afterState = reduce(beforeState, action);
      state = afterState;
      for (const callback of callbacks) {
        void Promise.resolve(callback(action, afterState, beforeState)).catch((error: unknown) => {
          log.error({ action, error }, "subscriber callback failed");
        });
      }
    },
    subscribe(listener: ActionCallback): () => void {
      callbacks.add(listener);
      return (): void => {
        callbacks.delete(listener);
      };
    },
    getFocusedAgent(): AgentUiState | null {
      if (state.focusedAgentId === null) return null;
      return state.agents.get(state.focusedAgentId) ?? null;
    },
    isBusy(): boolean {
      for (const agent of state.agents.values()) {
        if (agent.status === "busy") return true;
      }
      return false;
    },
  };
}
