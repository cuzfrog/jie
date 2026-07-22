import type { TeamInfo } from "@cuzfrog/jie-platform";
import type { AgentId, AgentUiState, TuiState } from "./state";
import { hydrateHistory } from "./hydrate-history";
import { estimateContextTokens } from "./context-tokens";

export function teamLoadReducer(state: TuiState, teamInfo: TeamInfo): TuiState {
  const { id: teamId, agents } = teamInfo;
  const newAgents = new Map(state.agents);
  let leaderId: AgentId | null = state.leaderAgentId;
  let focused: AgentId | null = state.focusedAgentId;
  if (state.teamId !== null && state.teamId !== teamId) {
    newAgents.clear();
    leaderId = null;
    focused = null;
  }
  const incomingIds = new Set<string>();
  for (const agent of agents) {
    const agentId = `${teamId}:${agent.agentKey}` as AgentId;
    incomingIds.add(agentId);
    const existing = newAgents.get(agentId);
    if (existing !== undefined) {
      newAgents.set(agentId, { ...existing, role: agent.role, isLeader: agent.isLeader, model: agent.model ?? existing.model });
    } else {
      newAgents.set(agentId, emptyAgent(agentId, teamId, agent.agentKey, agent.role, agent.isLeader, agent.model));
    }
    if (agent.isLeader) leaderId = agentId;
  }
  for (const id of newAgents.keys()) {
    if (!incomingIds.has(id)) newAgents.delete(id);
  }
  for (const entry of teamInfo.history) {
    if (entry.messages.length === 0) continue;
    const agentId = `${teamId}:${entry.agentKey}` as AgentId;
    const existing = newAgents.get(agentId);
    if (existing === undefined) continue;
    const hydrated = hydrateHistory(entry.messages);
    newAgents.set(agentId, {
      ...existing,
      history: hydrated.history,
      currentTurn: hydrated.currentTurn,
      todos: hydrated.todos,
      contextTokensUsed: estimateContextTokens(hydrated.history, hydrated.currentTurn),
    });
  }
  if (focused !== null && !newAgents.has(focused)) focused = null;
  if (focused === null && leaderId !== null && newAgents.has(leaderId)) focused = leaderId;
  if (leaderId !== null && !newAgents.has(leaderId)) leaderId = null;
  return {
    ...state,
    teamId,
    leaderAgentId: leaderId,
    focusedAgentId: focused,
    agents: newAgents,
    sessionPickerOpen: false,
    sessionPickerQuery: "",
    sessionPickerSessions: [],
    sessionPickerFocus: 0,
  };
}

function emptyAgent(
  agentId: AgentId,
  teamId: string,
  agentKey: string,
  role: string,
  isLeader: boolean,
  model: AgentUiState["model"],
): AgentUiState {
  return {
    agentId,
    teamId,
    agentKey,
    role,
    isLeader,
    status: "idle",
    lastStopReason: null,
    model,
    queue: [],
    history: [],
    currentTurn: null,
    contextTokensUsed: 0,
    lastReportedTotalTokens: null,
    todos: [],
  };
}
