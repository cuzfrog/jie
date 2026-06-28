import type { EventEnvelope } from "@cuzfrog/jie-platform/event";
import type { TuiState } from "./state";
import { composeAgentId, emptyAgent } from "./state";
import { passesCrossTeamGuard, parseEnvelopeTimestamp, readEventAgentKey, readEventTeamId, rotateTurnIfPopulated } from "./identity";

export const reduceTurnStart = (state: TuiState, env: EventEnvelope): TuiState => {
  if (!passesCrossTeamGuard(state, env)) return state;
  const teamId = readEventTeamId(env);
  const agentKey = readEventAgentKey(env);
  if (teamId === null || agentKey === null) return state;
  const agentId = composeAgentId(teamId, agentKey);
  const newAgents = new Map(state.agents);
  const existing = state.agents.get(agentId);
  const baseAgent = existing ?? emptyAgent(agentId, teamId, agentKey, "", false);
  const rotated = rotateTurnIfPopulated(baseAgent);
  newAgents.set(agentId, { ...rotated, status: "busy" });
  return { ...state, errorBanner: null, agents: newAgents };
};

export const reduceIdle = (state: TuiState, env: EventEnvelope): TuiState => {
  if (!passesCrossTeamGuard(state, env)) return state;
  const teamId = readEventTeamId(env);
  const agentKey = readEventAgentKey(env);
  if (teamId === null || agentKey === null) return state;
  const agentId = composeAgentId(teamId, agentKey);
  const existing = state.agents.get(agentId);
  if (existing === undefined) return state;
  const newAgents = new Map(state.agents);
  newAgents.set(agentId, { ...existing, status: "idle", lastIdleAt: parseEnvelopeTimestamp(env) });
  return { ...state, agents: newAgents };
};