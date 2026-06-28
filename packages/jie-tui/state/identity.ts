import type { EventEnvelope } from "@cuzfrog/jie-platform/event";
import type { AgentUiState, TuiState } from "./state";
import { composeAgentId, emptyAgent, freshTurn } from "./state";

export const readEventTeamId = (env: EventEnvelope): string | null => {
  if (env.sender.kind === "agent") return env.sender.identity.teamId;
  const payload = env.payload as Record<string, unknown> | null;
  if (payload !== null && typeof payload === "object" && typeof payload.teamId === "string") {
    return payload.teamId;
  }
  return null;
};

export const readEventAgentKey = (env: EventEnvelope): string | null => {
  if (env.sender.kind === "agent") return env.sender.identity.agentKey;
  const payload = env.payload as Record<string, unknown> | null;
  if (payload !== null && typeof payload === "object" && typeof payload.agentKey === "string") {
    return payload.agentKey;
  }
  return null;
};

export const passesCrossTeamGuard = (state: TuiState, env: EventEnvelope): boolean => {
  const eventTeamId = readEventTeamId(env);
  if (eventTeamId === null) return true;
  if (state.teamId === null) return false;
  return eventTeamId === state.teamId;
};

export const rotateTurnIfPopulated = (agent: AgentUiState): AgentUiState => {
  if (agent.currentTurn === null) return agent;
  const turn = agent.currentTurn;
  const hasContent = turn.cards.length > 0 || turn.blocks.some((b) => b.text.length > 0);
  if (!hasContent) return agent;
  return {
    ...agent,
    history: [...agent.history, turn],
    currentTurn: freshTurn(""),
  };
};

export const upsertAgent = (
  state: TuiState,
  agentId: ReturnType<typeof composeAgentId>,
  teamId: string,
  agentKey: string,
  role: string,
  isLeader: boolean,
): AgentUiState => {
  const existing = state.agents.get(agentId);
  if (existing !== undefined) return existing;
  const created = emptyAgent(agentId, teamId, agentKey, role, isLeader);
  state.agents.set(agentId, created);
  return created;
};

export const parseEnvelopeTimestamp = (env: EventEnvelope): number => {
  const ms = Date.parse(env.timestamp);
  return Number.isNaN(ms) ? 0 : ms;
};