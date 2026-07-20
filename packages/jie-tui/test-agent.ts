import type { AgentUiState } from "./state";

export function makeAgentUiState(overrides: Partial<AgentUiState> = {}): AgentUiState {
  const base: AgentUiState = {
    agentId: "demo:g",
    teamId: "demo",
    agentKey: "g",
    role: "general",
    isLeader: true,
    status: "idle",
    model: null,
    queue: [],
    history: [],
    currentTurn: null,
    lastStopReason: null,
    contextTokensUsed: 0,
    lastReportedTotalTokens: null,
    todos: [],
  };
  return { ...base, ...overrides };
}
