import type { EventEnvelope } from "@cuzfrog/jie-platform/event";
import type { Card, TuiState } from "./state";
import { composeAgentId, freshTurn } from "./state";
import { passesCrossTeamGuard, readEventAgentKey, readEventTeamId } from "./identity";

interface ToolCallWirePayload {
  tool_call_id: string;
  name: string;
  input: string;
  input_truncated: boolean;
}

interface ToolResultWirePayload {
  tool_call_id: string;
  name: string;
  output: string | null;
  output_truncated: boolean;
  duration_ms: number;
  error: string | null;
}

export const reduceToolCall = (state: TuiState, env: EventEnvelope): TuiState => {
  if (!passesCrossTeamGuard(state, env)) return state;
  const teamId = readEventTeamId(env);
  const agentKey = readEventAgentKey(env);
  if (teamId === null || agentKey === null) return state;
  const payload = env.payload as unknown as ToolCallWirePayload | null;
  if (payload === null) return state;
  const agentId = composeAgentId(teamId, agentKey);
  const existing = state.agents.get(agentId);
  if (existing === undefined) return state;
  const baseTurn = existing.currentTurn ?? freshTurn("");
  const newCard: Card = {
    kind: "toolCall",
    callId: payload.tool_call_id,
    name: payload.name,
    input: payload.input,
    inputTruncated: payload.input_truncated,
    expanded: false,
  };
  const newAgents = new Map(state.agents);
  newAgents.set(agentId, { ...existing, currentTurn: { ...baseTurn, cards: [...baseTurn.cards, newCard] } });
  return { ...state, agents: newAgents };
};

export const reduceToolResult = (state: TuiState, env: EventEnvelope): TuiState => {
  if (!passesCrossTeamGuard(state, env)) return state;
  const teamId = readEventTeamId(env);
  const agentKey = readEventAgentKey(env);
  if (teamId === null || agentKey === null) return state;
  const payload = env.payload as unknown as ToolResultWirePayload | null;
  if (payload === null) return state;
  const agentId = composeAgentId(teamId, agentKey);
  const existing = state.agents.get(agentId);
  if (existing === undefined) return state;
  const baseTurn = existing.currentTurn ?? freshTurn("");
  const cards = [...baseTurn.cards];
  const idx = cards.findIndex((c) => c.kind === "toolCall" && c.callId === payload.tool_call_id);
  const resultCard: Card = {
    kind: "toolResult",
    callId: payload.tool_call_id,
    name: payload.name,
    output: payload.output,
    outputTruncated: payload.output_truncated,
    durationMs: payload.duration_ms,
    error: payload.error,
    expanded: false,
  };
  if (idx >= 0) cards[idx] = resultCard;
  else cards.push(resultCard);
  const newAgents = new Map(state.agents);
  newAgents.set(agentId, { ...existing, currentTurn: { ...baseTurn, cards } });
  return { ...state, agents: newAgents };
};