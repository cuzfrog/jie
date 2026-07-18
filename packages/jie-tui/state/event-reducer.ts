import type { AnyEventEnvelope } from "@cuzfrog/jie-platform";
import type { AgentId, AgentUiState, MessageCard, TuiState, MessageTurn } from "./state";
import { teamLoadReducer } from "./team-load-reducer";
import { estimateContextTokens } from "./context-tokens";
import { isTodoDetails } from "../todo";

export function reduce(state: TuiState, event: AnyEventEnvelope): TuiState {
  switch (event.type) {
    case "system.team.loaded": return reduceTeamLoaded(state, event);
    case "system.error": return reduceSystemError(state, event);
    case "user.prompt": return reduceUserPrompt(state, event);
    case "agent.model.assigned": return reduceModelAssigned(state, event);
    case "agent.prompt.queue.update": return reduceQueueUpdate(state, event);
    case "agent.turn.start": return reduceTurnStart(state, event);
    case "agent.idle": return reduceIdle(state, event);
    case "agent.usage": return reduceUsage(state, event);
    case "agent.stream.chunk": return reduceStreamChunk(state, event);
    case "agent.tool.call": return reduceToolCall(state, event);
    case "agent.tool.result": return reduceToolResult(state, event);
    default: return state;
  }
}

function reduceTeamLoaded(state: TuiState, event: AnyEventEnvelope): TuiState {
  if (event.type !== "system.team.loaded") return state;
  return teamLoadReducer(state, event.payload);
}

function reduceSystemError(state: TuiState, event: AnyEventEnvelope): TuiState {
  if (event.type !== "system.error") return state;
  const stopReason = findRecentStopReason(state);
  return { ...state, errorBanner: formatSystemError(stopReason, event.payload.error) };
}

function findRecentStopReason(state: TuiState): string | null {
  for (const agent of state.agents.values()) {
    if (agent.lastStopReason !== null) return agent.lastStopReason;
  }
  return null;
}

function formatSystemError(stopReason: string | null, error: string): string {
  return stopReason === null ? error : `[stop: ${stopReason}] ${error}`;
}

function reduceUserPrompt(state: TuiState, event: AnyEventEnvelope): TuiState {
  if (event.type !== "user.prompt") return state;
  if (state.teamId === null) return state;
  if (event.payload.teamId !== state.teamId) return state;
  const agentId = composeAgentId(event.payload.teamId, event.payload.agentKey);
  const existing = state.agents.get(agentId);
  if (existing === undefined) return state;
  const newAgents = new Map(state.agents);
  const turn = existing.currentTurn;
  if (turnIsPopulated(turn)) {
    const nextTurn = freshTurn(event.payload.prompt);
    const contextTokensUsed = estimateContextTokens([...existing.history, turn!], nextTurn);
    newAgents.set(agentId, { ...existing, history: [...existing.history, turn!], currentTurn: nextTurn, contextTokensUsed });
    return { ...state, agents: newAgents };
  }
  const nextTurn = freshTurn(event.payload.prompt);
  const contextTokensUsed = estimateContextTokens(existing.history, nextTurn);
  newAgents.set(agentId, { ...existing, currentTurn: nextTurn, contextTokensUsed });
  return { ...state, agents: newAgents };
}

function reduceModelAssigned(state: TuiState, event: AnyEventEnvelope): TuiState {
  const resolved = resolveAgent(state, event);
  if (resolved === null) return state;
  if (event.type !== "agent.model.assigned") return state;
  const { agentId, agent } = resolved;
  const priorContextWindow = agent.model === null ? null : agent.model.contextWindow;
  return withAgent(state, agentId, { ...agent, model: { provider: event.payload.provider, id: event.payload.model, effort: event.payload.effort, contextWindow: priorContextWindow } });
}

function reduceQueueUpdate(state: TuiState, event: AnyEventEnvelope): TuiState {
  const resolved = resolveAgent(state, event);
  if (resolved === null) return state;
  if (event.type !== "agent.prompt.queue.update") return state;
  const { agentId, agent } = resolved;
  return withAgent(state, agentId, { ...agent, queue: event.payload.prompts });
}

function reduceTurnStart(state: TuiState, event: AnyEventEnvelope): TuiState {
  const resolved = resolveAgent(state, event);
  if (resolved === null) return state;
  const { agentId, agent } = resolved;
  const rotated = rotateTurnIfPopulated(agent);
  const next: AgentUiState = { ...rotated, status: "busy" };
  return withAgent(state, agentId, next, { errorBanner: null });
}

function reduceIdle(state: TuiState, event: AnyEventEnvelope): TuiState {
  const resolved = resolveAgent(state, event);
  if (resolved === null) return state;
  if (event.type !== "agent.idle") return state;
  const { agentId, agent } = resolved;
  const contextTokensUsed = agent.lastReportedTotalTokens ?? estimateContextTokens(agent.history, agent.currentTurn);
  const next: AgentUiState = { ...agent, status: "idle", lastStopReason: event.payload, contextTokensUsed };
  return withAgent(state, agentId, next);
}

function reduceUsage(state: TuiState, event: AnyEventEnvelope): TuiState {
  const resolved = resolveAgent(state, event);
  if (resolved === null) return state;
  if (event.type !== "agent.usage") return state;
  const { agentId, agent } = resolved;
  return withAgent(state, agentId, { ...agent, contextTokensUsed: event.payload.totalTokens, lastReportedTotalTokens: event.payload.totalTokens });
}

function reduceStreamChunk(state: TuiState, event: AnyEventEnvelope): TuiState {
  const resolved = resolveAgent(state, event);
  if (resolved === null) return state;
  if (event.type !== "agent.stream.chunk") return state;
  const { agentId, agent } = resolved;
  if (agent.currentTurn === null) return state;
  const { stream_id, block_type, text } = event.payload;
  const blocks = [...agent.currentTurn.blocks];
  const last = blocks[blocks.length - 1];
  if (agent.currentTurn.streamId !== stream_id) {
    blocks.push({ kind: block_type, text });
  } else if (last !== undefined && last.kind === block_type) {
    blocks[blocks.length - 1] = { ...last, text: last.text + text };
  } else {
    blocks.push({ kind: block_type, text });
  }
  const nextTurn = { ...agent.currentTurn, blocks, streamId: stream_id };
  const contextTokensUsed = estimateContextTokens(agent.history, nextTurn);
  const next: AgentUiState = { ...agent, currentTurn: nextTurn, contextTokensUsed };
  return withAgent(state, agentId, next);
}

function reduceToolCall(state: TuiState, event: AnyEventEnvelope): TuiState {
  const resolved = resolveAgent(state, event);
  if (resolved === null) return state;
  if (event.type !== "agent.tool.call") return state;
  const { agentId, agent } = resolved;
  if (agent.currentTurn === null) return state;
  const { tool_call_id, name, input, input_truncated } = event.payload;
  if (agent.currentTurn.cards.some((card) => card.kind === "toolCall" && card.callId === tool_call_id)) return state;
  const toolCallCard: MessageCard = { kind: "toolCall", callId: tool_call_id, name, input, inputTruncated: input_truncated };
  const nextTurn = { ...agent.currentTurn, cards: [...agent.currentTurn.cards, toolCallCard] };
  const contextTokensUsed = estimateContextTokens(agent.history, nextTurn);
  const next: AgentUiState = { ...agent, currentTurn: nextTurn, contextTokensUsed };
  return withAgent(state, agentId, next);
}

function reduceToolResult(state: TuiState, event: AnyEventEnvelope): TuiState {
  const resolved = resolveAgent(state, event);
  if (resolved === null) return state;
  if (event.type !== "agent.tool.result") return state;
  const { agentId, agent } = resolved;
  const { tool_call_id, name, output, output_truncated, duration_ms, error, details } = event.payload;
  if (isTodoDetails(details)) {
    return withAgent(state, agentId, withTodoDetails(agent, details));
  }
  if (agent.currentTurn === null) return state;
  const cards = [...agent.currentTurn.cards];
  const index = cards.findIndex((card) => card.kind === "toolCall" && card.callId === tool_call_id);
  if (index === -1) return state;
  const prior = cards[index];
  cards[index] = {
    kind: "toolResult",
    callId: tool_call_id,
    name,
    input: prior?.input,
    inputTruncated: prior?.inputTruncated,
    output,
    outputTruncated: output_truncated,
    durationMs: duration_ms,
    error,
    details,
  };
  const nextTurn = { ...agent.currentTurn, cards };
  const contextTokensUsed = estimateContextTokens(agent.history, nextTurn);
  const next: AgentUiState = { ...agent, currentTurn: nextTurn, contextTokensUsed };
  return withAgent(state, agentId, next);
}

function withTodoDetails(agent: AgentUiState, details: unknown): AgentUiState {
  if (!isTodoDetails(details)) return agent;
  return { ...agent, todos: details.todos };
}

function resolveAgent(
  state: TuiState,
  event: AnyEventEnvelope,
): { agentId: AgentId; agent: AgentUiState } | null {
  if (state.teamId === null) return null;
  if (event.sender.kind !== "agent") return null;
  if (event.sender.teamId !== state.teamId) return null;
  const agentId = composeAgentId(event.sender.teamId, event.sender.agentKey);
  const agent = state.agents.get(agentId);
  return agent === undefined ? null : { agentId, agent };
}

function withAgent(state: TuiState, agentId: AgentId, agent: AgentUiState, extra: Partial<TuiState> = {}): TuiState {
  const agents = new Map(state.agents);
  agents.set(agentId, agent);
  return { ...state, ...extra, agents };
}

function freshTurn(userPrompt: string): MessageTurn {
  return { userPrompt, cards: [], blocks: [], streamId: null };
}

function rotateTurnIfPopulated(agent: AgentUiState): AgentUiState {
  if (agent.currentTurn === null) return agent;
  const turn = agent.currentTurn;
  if (!turnIsPopulated(turn)) return agent;
  return { ...agent, history: [...agent.history, turn], currentTurn: { userPrompt: "", cards: [], blocks: [], streamId: null } };
}

function turnIsPopulated(turn: MessageTurn | null): boolean {
  if (turn === null) return false;
  if (turn.cards.length > 0) return true;
  return turn.blocks.some((block) => block.text.length > 0);
}

function composeAgentId(teamId: string, agentKey: string): AgentId {
  return `${teamId}:${agentKey}` as AgentId;
}
