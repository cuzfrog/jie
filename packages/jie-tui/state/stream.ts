import type { EventEnvelope } from "@cuzfrog/jie-platform/event";
import type { TuiState } from "./state";
import { composeAgentId, freshTurn } from "./state";
import { passesCrossTeamGuard, readEventAgentKey, readEventTeamId } from "./identity";

interface StreamChunkWirePayload {
  stream_id: number;
  seq: number;
  block_type: "text" | "thinking";
  text: string;
}

export const reduceStreamChunk = (state: TuiState, env: EventEnvelope): TuiState => {
  if (!passesCrossTeamGuard(state, env)) return state;
  const teamId = readEventTeamId(env);
  const agentKey = readEventAgentKey(env);
  if (teamId === null || agentKey === null) return state;
  const payload = env.payload as unknown as StreamChunkWirePayload | null;
  if (payload === null) return state;
  const agentId = composeAgentId(teamId, agentKey);
  const existing = state.agents.get(agentId);
  if (existing === undefined) return state;
  const baseTurn = existing.currentTurn ?? freshTurn("");
  const blocks = [...baseTurn.blocks];
  const last = blocks[blocks.length - 1];
  if (baseTurn.streamId !== payload.stream_id) {
    blocks.push({ kind: payload.block_type, text: payload.text, expanded: false });
  } else if (last !== undefined && last.kind === payload.block_type) {
    blocks[blocks.length - 1] = { ...last, text: last.text + payload.text };
  } else {
    blocks.push({ kind: payload.block_type, text: payload.text, expanded: false });
  }
  const newAgents = new Map(state.agents);
  newAgents.set(agentId, { ...existing, currentTurn: { ...baseTurn, blocks, streamId: payload.stream_id } });
  return { ...state, agents: newAgents };
};

export const reduceStreamEnd = (state: TuiState): TuiState => state;