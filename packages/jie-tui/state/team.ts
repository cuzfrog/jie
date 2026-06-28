import type { EventEnvelope } from "@cuzfrog/jie-platform/event";
import type { AgentId, AgentUiState, TuiState } from "./state";
import { composeAgentId, emptyAgent, freshTurn } from "./state";
import { passesCrossTeamGuard, upsertAgent } from "./identity";

interface TeamLoadedWireAgent {
  role: string;
  agent_key: string;
  is_leader: boolean;
}

interface TeamLoadedWirePayload {
  teamId: string;
  agents: TeamLoadedWireAgent[];
}

interface PromptWirePayload {
  teamId: string;
  agentKey: string;
  prompt: string;
}

const parseAgentPromptMiddle = (middle: string): { teamId: string; agentKey: string } | null => {
  const sep = middle.indexOf(".agent.");
  if (sep < 1) return null;
  const teamId = middle.slice(0, sep);
  const agentKey = middle.slice(sep + ".agent.".length);
  if (teamId.length === 0 || agentKey.length === 0 || teamId.includes(".") || agentKey.includes(".")) return null;
  return { teamId, agentKey };
};

export const extractTeamIdFromTeamLoadedTopic = (topic: string): string | null => {
  if (!topic.startsWith("team.") || !topic.endsWith(".loaded")) return null;
  const middle = topic.slice("team.".length, topic.length - ".loaded".length);
  if (middle.length === 0 || middle.includes(".")) return null;
  return middle;
};

export const extractTeamAndAgentFromPromptTopic = (topic: string): { teamId: string; agentKey: string } | null => {
  if (topic.startsWith("team.")) {
    return parseAgentPromptMiddle(topic.slice("team.".length, topic.length - ".prompt".length));
  }
  if (topic.startsWith("system.teams.") && topic.endsWith(".prompt")) {
    return parseAgentPromptMiddle(topic.slice("system.teams.".length, topic.length - ".prompt".length));
  }
  return null;
};

export const reduceSystemTeams = (state: TuiState, env: EventEnvelope): TuiState => {
  const payload = env.payload as unknown as TeamLoadedWirePayload | null;
  if (payload === null) return state;
  const { teamId, agents } = payload;
  const newAgents = new Map(state.agents);
  let leaderId: AgentId | null = state.leaderAgentId;
  let focused: AgentId | null = state.focusedAgentId;
  if (state.teamId !== null && state.teamId !== teamId) {
    newAgents.clear();
    leaderId = null;
    focused = null;
  }
  for (const a of agents) {
    const agentId = composeAgentId(teamId, a.agent_key);
    const existing = newAgents.get(agentId);
    if (existing !== undefined) {
      newAgents.set(agentId, { ...existing, role: a.role, isLeader: a.is_leader });
    } else {
      newAgents.set(agentId, emptyAgent(agentId, teamId, a.agent_key, a.role, a.is_leader));
    }
    if (a.is_leader) leaderId = agentId;
  }
  if (focused === null && leaderId !== null) focused = leaderId;
  return { ...state, teamId, leaderAgentId: leaderId, focusedAgentId: focused, agents: newAgents };
};

export const reducePrompt = (state: TuiState, env: EventEnvelope): TuiState => {
  if (!passesCrossTeamGuard(state, env)) return state;
  const payload = env.payload as unknown as PromptWirePayload | null;
  if (payload === null) return state;
  const agentId = composeAgentId(payload.teamId, payload.agentKey);
  const newAgents = new Map(state.agents);
  const existing = state.agents.get(agentId);
  const baseAgent: AgentUiState =
    existing ?? upsertAgent({ ...state, agents: newAgents }, agentId, payload.teamId, payload.agentKey, "", false);
  if (baseAgent.currentTurn !== null) {
    const turn = baseAgent.currentTurn;
    const hasContent = turn.cards.length > 0 || turn.blocks.some((b) => b.text.length > 0);
    if (hasContent) {
      newAgents.set(agentId, { ...baseAgent, history: [...baseAgent.history, turn], currentTurn: freshTurn(payload.prompt) });
      return { ...state, agents: newAgents };
    }
  }
  newAgents.set(agentId, { ...baseAgent, currentTurn: freshTurn(payload.prompt) });
  return { ...state, agents: newAgents };
};

export const reduceTeamLoadedLegacy = (state: TuiState, env: EventEnvelope): TuiState => {
  const teamId = extractTeamIdFromTeamLoadedTopic(env.topic);
  if (teamId === null) return state;
  const payload = env.payload as unknown as TeamLoadedWirePayload | null;
  if (payload === null || payload.teamId !== teamId) return state;
  return reduceSystemTeams(state, env);
};

export const reducePromptLegacy = (state: TuiState, env: EventEnvelope): TuiState => {
  const match = extractTeamAndAgentFromPromptTopic(env.topic);
  if (match === null) return state;
  const payload = env.payload as unknown as PromptWirePayload | null;
  if (payload === null || payload.teamId !== match.teamId || payload.agentKey !== match.agentKey) return state;
  return reducePrompt(state, env);
};