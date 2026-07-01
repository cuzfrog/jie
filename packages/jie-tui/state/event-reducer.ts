import { type EventEnvelope } from "@cuzfrog/jie-platform/event";
import type { AgentId, AgentUiState, MessageCard, ModelReference, TuiState, MessageTurn } from "./state";
import type { AnyEventEnvelope } from "./actions";

export function reduce(state: TuiState, event: AnyEventEnvelope): TuiState {
  if (event.type === "system.team.loaded") return reduceTeamLoaded(state, event);
  if (event.type === "system.error") return reduceSystemError(state, event);
  if (event.type === "user.prompt") return reduceUserPrompt(state, event);
  if (event.type === "agent.model.assigned") return reduceModelAssigned(state, event);
  if (event.type === "agent.prompt.queue.update") return reduceQueueUpdate(state, event);
  if (event.type === "agent.turn.start") return reduceTurnStart(state, event);
  if (event.type === "agent.idle") return reduceIdle(state, event);
  if (event.type === "agent.stream.chunk") return reduceStreamChunk(state, event);
  if (event.type === "agent.tool.call") return reduceToolCall(state, event);
  if (event.type === "agent.tool.result") return reduceToolResult(state, event);
  return state;
}

function reduceTeamLoaded(state: TuiState, event: EventEnvelope<"system.team.loaded">): TuiState {
  const { teamId, agents } = event.payload;
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
    const agentId = composeAgentId(teamId, agent.agent_key);
    incomingIds.add(agentId);
    const existing = newAgents.get(agentId);
    if (existing !== undefined) {
      newAgents.set(agentId, { ...existing, role: agent.role, isLeader: agent.is_leader });
    } else {
      newAgents.set(agentId, emptyAgent(agentId, teamId, agent.agent_key, agent.role, agent.is_leader));
    }
    if (agent.is_leader) leaderId = agentId;
  }
  for (const id of newAgents.keys()) {
    if (!incomingIds.has(id)) newAgents.delete(id);
  }
  if (focused !== null && !newAgents.has(focused)) focused = null;
  if (focused === null && leaderId !== null && newAgents.has(leaderId)) focused = leaderId;
  if (leaderId !== null && !newAgents.has(leaderId)) leaderId = null;
  return { ...state, teamId, leaderAgentId: leaderId, focusedAgentId: focused, agents: newAgents };
}

function reduceSystemError(state: TuiState, event: EventEnvelope<"system.error">): TuiState {
  const stopReason = findRecentStopReason(state);
  const text = stopReason === null ? event.payload.error : `[stop: ${stopReason}] ${event.payload.error}`;
  return { ...state, errorBanner: text };
}

function findRecentStopReason(state: TuiState): string | null {
  for (const agent of state.agents.values()) {
    if (agent.lastStopReason !== null) return agent.lastStopReason;
  }
  return null;
}

function reduceUserPrompt(state: TuiState, event: EventEnvelope<"user.prompt">): TuiState {
  if (state.teamId === null) return state;
  if (event.payload.teamId !== state.teamId) return state;
  const agentId = composeAgentId(event.payload.teamId, event.payload.agentKey);
  const existing = state.agents.get(agentId);
  if (existing === undefined) return state;
  const newAgents = new Map(state.agents);
  const turn = existing.currentTurn;
  const hasContent = turn !== null && (turn.cards.length > 0 || turn.blocks.some((block) => block.text.length > 0));
  if (hasContent) {
    newAgents.set(agentId, { ...existing, history: [...existing.history, turn!], currentTurn: freshTurn(event.payload.prompt) });
    return { ...state, agents: newAgents };
  }
  newAgents.set(agentId, { ...existing, currentTurn: freshTurn(event.payload.prompt) });
  return { ...state, agents: newAgents };
}

function reduceModelAssigned(state: TuiState, event: EventEnvelope<"agent.model.assigned">): TuiState {
  if (state.teamId === null) return state;
  if (event.sender.kind !== "agent") return state;
  if (event.sender.identity.teamId !== state.teamId) return state;
  const agentId = composeAgentId(event.sender.identity.teamId, event.sender.identity.agentKey);
  const existing = state.agents.get(agentId);
  if (existing === undefined) return state;
  const model: ModelReference = {
    provider: event.payload.provider,
    id: event.payload.model,
    effort: event.payload.effort,
  };
  return withAgent(state, agentId, { ...existing, model });
}

function reduceQueueUpdate(state: TuiState, event: EventEnvelope<"agent.prompt.queue.update">): TuiState {
  if (state.teamId === null) return state;
  if (event.sender.kind !== "agent") return state;
  if (event.sender.identity.teamId !== state.teamId) return state;
  const agentId = composeAgentId(event.sender.identity.teamId, event.sender.identity.agentKey);
  const existing = state.agents.get(agentId);
  if (existing === undefined) return state;
  return withAgent(state, agentId, { ...existing, queue: event.payload.prompts });
}

function reduceTurnStart(state: TuiState, event: EventEnvelope<"agent.turn.start">): TuiState {
  const resolved = resolveAgent(state, event);
  if (resolved === null) return state;
  const { agentId, agent } = resolved;
  const rotated = rotateTurnIfPopulated(agent);
  const next: AgentUiState = { ...rotated, status: "busy" };
  return withAgent(state, agentId, next, { errorBanner: null });
}

function reduceIdle(state: TuiState, event: EventEnvelope<"agent.idle">): TuiState {
  const resolved = resolveAgent(state, event);
  if (resolved === null) return state;
  const { agentId, agent } = resolved;
  const next: AgentUiState = { ...agent, status: "idle", lastStopReason: event.payload };
  return withAgent(state, agentId, next);
}

function reduceStreamChunk(state: TuiState, event: EventEnvelope<"agent.stream.chunk">): TuiState {
  const resolved = resolveAgent(state, event);
  if (resolved === null) return state;
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
  const next: AgentUiState = {
    ...agent,
    currentTurn: { ...agent.currentTurn, blocks, streamId: stream_id },
  };
  return withAgent(state, agentId, next);
}

function reduceToolCall(state: TuiState, event: EventEnvelope<"agent.tool.call">): TuiState {
  const resolved = resolveAgent(state, event);
  if (resolved === null) return state;
  const { agentId, agent } = resolved;
  if (agent.currentTurn === null) return state;
  const { tool_call_id, name, input, input_truncated } = event.payload;
  if (agent.currentTurn.cards.some((card) => card.kind === "toolCall" && card.callId === tool_call_id)) return state;
  const toolCallCard: MessageCard = {
    kind: "toolCall",
    callId: tool_call_id,
    name,
    input,
    inputTruncated: input_truncated,
  };
  const next: AgentUiState = {
    ...agent,
    currentTurn: {
      ...agent.currentTurn,
      cards: [...agent.currentTurn.cards, toolCallCard],
    },
  };
  return withAgent(state, agentId, next);
}

function reduceToolResult(state: TuiState, event: EventEnvelope<"agent.tool.result">): TuiState {
  const resolved = resolveAgent(state, event);
  if (resolved === null) return state;
  const { agentId, agent } = resolved;
  if (agent.currentTurn === null) return state;
  const { tool_call_id, name, output, output_truncated, duration_ms, error } = event.payload;
  const cards = [...agent.currentTurn.cards];
  const index = cards.findIndex((card) => card.kind === "toolCall" && card.callId === tool_call_id);
  if (index === -1) return state;
  cards[index] = {
    kind: "toolResult",
    callId: tool_call_id,
    name,
    output,
    outputTruncated: output_truncated,
    durationMs: duration_ms,
    error,
  };
  const next: AgentUiState = {
    ...agent,
    currentTurn: { ...agent.currentTurn, cards },
  };
  return withAgent(state, agentId, next);
}

function resolveAgent(
  state: TuiState,
  event: EventEnvelope<
    "agent.turn.start" | "agent.idle" | "agent.stream.chunk" | "agent.tool.call" | "agent.tool.result"
  >,
): { agentId: AgentId; agent: AgentUiState } | null {
  if (state.teamId === null) return null;
  if (event.sender.kind !== "agent") return null;
  if (event.sender.identity.teamId !== state.teamId) return null;
  const agentId = composeAgentId(event.sender.identity.teamId, event.sender.identity.agentKey);
  const agent = state.agents.get(agentId);
  return agent === undefined ? null : { agentId, agent };
}

function withAgent(state: TuiState, agentId: AgentId, agent: AgentUiState, extra: Partial<TuiState> = {}): TuiState {
  const agents = new Map(state.agents);
  agents.set(agentId, agent);
  return { ...state, ...extra, agents };
}

function emptyAgent(agentId: AgentId, teamId: string, agentKey: string, role: string, isLeader: boolean): AgentUiState {
  return {
    agentId,
    teamId,
    agentKey,
    role,
    isLeader,
    status: "idle",
    lastStopReason: null,
    model: null,
    queue: [],
    history: [],
    currentTurn: null,
  };
}

function freshTurn(userPrompt: string): MessageTurn {
  return {
    userPrompt,
    cards: [],
    blocks: [],
    streamId: null,
  };
}

function rotateTurnIfPopulated(agent: AgentUiState): AgentUiState {
  if (agent.currentTurn === null) return agent;
  const turn = agent.currentTurn;
  const hasContent = turn.cards.length > 0 || turn.blocks.some((block) => block.text.length > 0);
  if (!hasContent) return agent;
  return {
    ...agent,
    history: [...agent.history, turn],
    currentTurn: { userPrompt: "", cards: [], blocks: [], streamId: null },
  };
}

function composeAgentId(teamId: string, agentKey: string): AgentId {
  return `${teamId}:${agentKey}` as AgentId;
}