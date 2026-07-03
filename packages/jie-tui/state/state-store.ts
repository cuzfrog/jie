import type { TuiState, AgentUiState } from "./types";
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
} as const);

export interface StateStore {
  readonly getState: () => TuiState;
  readonly dispatch: (action: Action) => void;
  readonly subscribe: (listener: () => void) => () => void;
  readonly getFocusedAgent: () => AgentUiState | null;
  readonly isBusy: () => boolean;
}

export function createStateStore(): StateStore {
  let state: TuiState = INITIAL_TUI_STATE;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    dispatch: (action) => {
      state = reduce(state, action);
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
    getFocusedAgent: () => {
      if (state.focusedAgentId === null) return null;
      return state.agents.get(state.focusedAgentId) ?? null;
    },
    isBusy: () => {
      for (const agent of state.agents.values()) {
        if (agent.status === "busy") return true;
      }
      return false;
    },
  };
}
