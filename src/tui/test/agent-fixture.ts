import type { AgentId, AgentUiState } from "../state";

export function makeAgentUiState(agentId: AgentId, overrides: Partial<AgentUiState> = {}): AgentUiState {
  const colonIndex = agentId.indexOf(":");
  return {
    agentId,
    teamId: agentId.slice(0, colonIndex),
    agentKey: agentId.slice(colonIndex + 1),
    role: "general",
    isLeader: false,
    tools: [],
    subscribe: [],
    skills: [],
    status: "idle",
    model: null,
    queue: [],
    history: [],
    currentTurn: null,
    compactionMarker: null,
    compactionInProgress: false,
    lastStopReason: null,
    contextTokensUsed: 0,
    lastReportedTotalTokens: null,
    sessionInputTokens: 0,
    sessionOutputTokens: 0,
    inflightInputTokens: 0,
    inflightOutputTokens: 0,
    ...overrides,
  };
}
