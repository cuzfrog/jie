import type { TuiState, AgentUiState } from "./state";
import { reduce } from "./reducer";
import type { Action } from "./actions";

const INITIAL_TUI_STATE: TuiState = Object.freeze({
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

export interface StateStore {
  getState(): TuiState;
  dispatch(action: Action): void;
  subscribe(listener: () => void): () => void;
  getFocusedAgent(): AgentUiState | null;
  isBusy(): boolean;
}

export function createStateStore(): StateStore {
  let state: TuiState = INITIAL_TUI_STATE;
  const listeners = new Set<() => void>();
  return {
    getState(): TuiState {
      return state;
    },
    dispatch(action: Action): void {
      state = reduce(state, action);
      for (const listener of listeners) listener();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
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
