import type { AgentInfo, TeamInfo } from "@cuzfrog/jie-platform";
import type { AgentId, AgentUiState, TuiState } from "./state";
import { hydrateHistory } from "./hydrate-history";
import { estimateContextTokens } from "./context-tokens";

export function teamLoadReducer(state: TuiState, teamInfo: TeamInfo): TuiState {
  const { id: teamId, agents } = teamInfo;
  const switching = state.teamId !== null && state.teamId !== teamId;
  const newAgents = new Map(state.agents);
  let leaderId: AgentId | null = state.leaderAgentId;
  let focused: AgentId | null = state.focusedAgentId;
  if (switching) {
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
      newAgents.set(agentId, {
        ...existing,
        role: agent.role,
        isLeader: agent.isLeader,
        tools: agent.tools,
        subscribe: agent.subscribe,
        skills: agent.skills,
        model: agent.model ?? existing.model,
      });
    } else {
      newAgents.set(agentId, emptyAgent(agentId, teamId, agent));
    }
    if (agent.isLeader) leaderId = agentId;
  }
  for (const id of newAgents.keys()) {
    if (!incomingIds.has(id)) newAgents.delete(id);
  }
  let nextEntrySeq = switching ? 0 : state.nextEntrySeq;
  for (const entry of teamInfo.history) {
    if (entry.messages.length === 0) continue;
    const agentId = `${teamId}:${entry.agentKey}` as AgentId;
    const existing = newAgents.get(agentId);
    if (existing === undefined) continue;
    const hydrated = hydrateHistory(entry.messages, nextEntrySeq);
    nextEntrySeq = hydrated.nextSeq;
    newAgents.set(agentId, {
      ...existing,
      history: hydrated.history,
      currentTurn: hydrated.currentTurn,
      compactionMarker: hydrated.compactionMarker,
      cards: hydrated.cards,
      contextTokensUsed: estimateContextTokens(hydrated.history, hydrated.currentTurn),
    });
  }
  if (focused !== null && !newAgents.has(focused)) focused = null;
  if (focused === null && leaderId !== null && newAgents.has(leaderId)) focused = leaderId;
  if (leaderId !== null && !newAgents.has(leaderId)) leaderId = null;
  let cursor = switching ? null : state.teamCursorAgentId;
  if (cursor !== null && !newAgents.has(cursor)) cursor = null;
  return {
    ...state,
    teamId,
    sessionName: teamInfo.sessionName,
    leaderAgentId: leaderId,
    focusedAgentId: focused,
    teamCursorAgentId: cursor,
    interruptedAgentId: null,
    infoEntries: switching ? [] : state.infoEntries,
    nextEntrySeq,
    agents: newAgents,
  };
}

function emptyAgent(agentId: AgentId, teamId: string, agent: AgentInfo): AgentUiState {
  return {
    agentId,
    teamId,
    agentKey: agent.agentKey,
    role: agent.role,
    isLeader: agent.isLeader,
    tools: agent.tools,
    subscribe: agent.subscribe,
    skills: agent.skills,
    status: "idle",
    lastStopReason: null,
    model: agent.model,
    queue: [],
    history: [],
    currentTurn: null,
    compactionMarker: null,
    contextTokensUsed: 0,
    lastReportedTotalTokens: null,
    cards: [],
  };
}
