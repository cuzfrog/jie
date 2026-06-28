import type { EventEnvelope } from "@cuzfrog/jie-platform/event";
import type { TuiState } from "./state";
import { passesCrossTeamGuard, readEventAgentKey, readEventTeamId } from "./identity";

interface QueueUpdateWirePayload {
  prompts: string[];
}

export const reduceQueueUpdate = (state: TuiState, env: EventEnvelope): TuiState => {
  if (!passesCrossTeamGuard(state, env)) return state;
  const teamId = readEventTeamId(env);
  const agentKey = readEventAgentKey(env);
  if (teamId === null || agentKey === null) return state;
  if (state.leaderAgentId === null) return state;
  const leader = state.agents.get(state.leaderAgentId);
  if (leader === undefined || leader.agentKey !== agentKey) return state;
  const payload = env.payload as unknown as QueueUpdateWirePayload | null;
  if (payload === null) return state;
  return { ...state, queue: [...payload.prompts] };
};