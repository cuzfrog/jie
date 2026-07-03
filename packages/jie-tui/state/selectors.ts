import type { TuiState, AgentUiState } from "./state";

export const TuiStateSelectors = Object.freeze({
  getFocusedAgent(state: TuiState): AgentUiState | null {
    if (state.focusedAgentId === null) return null;
    return state.agents.get(state.focusedAgentId) ?? null;
  },
} as const);
