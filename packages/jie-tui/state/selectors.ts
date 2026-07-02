import type { TuiState, AgentUiState } from "./state";

export const TuiStateSelectors = Object.freeze({
  getFocusedAgent(state: TuiState): AgentUiState | null {
    if (state.focusedAgentId === null) return null;
    return state.agents.get(state.focusedAgentId) ?? null;
  },
  getTargetAgentForPrompt(state: TuiState): AgentUiState | null {
    const focused = TuiStateSelectors.getFocusedAgent(state);
    if (focused !== null) return focused;
    if (state.leaderAgentId === null) return null;
    return state.agents.get(state.leaderAgentId) ?? null;
  },
} as const);
