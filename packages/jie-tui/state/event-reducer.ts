import { type EventEnvelope } from "@cuzfrog/jie-platform/event";
import type { AgentId, AgentUiState, MessageCard, TuiState, MessageTurn } from "./state";
import type { AnyEventEnvelope } from "./actions";

export function reduce(state: TuiState, event: AnyEventEnvelope): TuiState {
  if (event.type === "system.team.loaded") return reduceTeamLoaded(state, event);
  if (event.type === "system.error") return reduceSystemError(state, event);
  if (event.type === "user.prompt") return reduceUserPrompt(state, event);
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
  return { ...state, errorBanner: { text: event.payload.error, raisedAt: Date.now() } };
}

function reduceUserPrompt(state: TuiState, event: EventEnvelope<"user.prompt">): TuiState {
  if (state.teamId === null) return state;
  if (event.payload.teamId !== state.teamId) return state;
  const agentId = composeAgentId(event.payload.teamId, event.payload.agentKey);
  const existing = state.agents.get(agentId);
  if (existing === undefined) return state;
  const newAgents = new Map(state.agents);
  const turn = existing.currentTurn;
  const hasContent = turn !== null && (turn.cards.length > 0 || turn.blocks.some((b) => b.text.length > 0));
  if (hasContent) {
    newAgents.set(agentId, { ...existing, history: [...existing.history, turn!], currentTurn: freshTurn(event.payload.prompt) });
    return { ...state, agents: newAgents };
  }
  newAgents.set(agentId, { ...existing, currentTurn: freshTurn(event.payload.prompt) });
  return { ...state, agents: newAgents };
}

function reduceTurnStart(state: TuiState, event: EventEnvelope<"agent.turn.start">): TuiState {
  if (state.teamId === null) return state;
  if (event.sender.kind !== "agent") return state;
  if (event.sender.identity.teamId !== state.teamId) return state;
  const identity = event.sender.identity;
  const agentId = composeAgentId(identity.teamId, identity.agentKey);
  const existing = state.agents.get(agentId);
  if (existing === undefined) return state;
  const rotated = rotateTurnIfPopulated(existing);
  const newAgents = new Map(state.agents);
  newAgents.set(agentId, { ...rotated, status: "busy" });
  return { ...state, errorBanner: null, agents: newAgents };
}

function reduceIdle(state: TuiState, event: EventEnvelope<"agent.idle">): TuiState {
  if (state.teamId === null) return state;
  if (event.sender.kind !== "agent") return state;
  if (event.sender.identity.teamId !== state.teamId) return state;
  const identity = event.sender.identity;
  const agentId = composeAgentId(identity.teamId, identity.agentKey);
  const existing = state.agents.get(agentId);
  if (existing === undefined) return state;
  const newAgents = new Map(state.agents);
  newAgents.set(agentId, { ...existing, status: "idle", lastIdleAt: Date.now() });
  return { ...state, agents: newAgents };
}

function reduceStreamChunk(state: TuiState, event: EventEnvelope<"agent.stream.chunk">): TuiState {
  if (state.teamId === null) return state;
  if (event.sender.kind !== "agent") return state;
  if (event.sender.identity.teamId !== state.teamId) return state;
  const identity = event.sender.identity;
  const agentId = composeAgentId(identity.teamId, identity.agentKey);
  const existing = state.agents.get(agentId);
  if (existing === undefined) return state;
  if (existing.currentTurn === null) return state;
  const { stream_id, block_type, text } = event.payload;
  const blocks = [...existing.currentTurn.blocks];
  const last = blocks[blocks.length - 1];
  if (existing.currentTurn.streamId !== stream_id) {
    blocks.push({ kind: block_type, text, expanded: false });
  } else if (last !== undefined && last.kind === block_type) {
    blocks[blocks.length - 1] = { ...last, text: last.text + text };
  } else {
    blocks.push({ kind: block_type, text, expanded: false });
  }
  const newAgents = new Map(state.agents);
  newAgents.set(agentId, { ...existing, currentTurn: { ...existing.currentTurn, blocks, streamId: stream_id } });
  return { ...state, agents: newAgents };
}

function reduceToolCall(state: TuiState, event: EventEnvelope<"agent.tool.call">): TuiState {
  if (state.teamId === null) return state;
  if (event.sender.kind !== "agent") return state;
  if (event.sender.identity.teamId !== state.teamId) return state;
  const identity = event.sender.identity;
  const agentId = composeAgentId(identity.teamId, identity.agentKey);
  const existing = state.agents.get(agentId);
  if (existing === undefined) return state;
  if (existing.currentTurn === null) return state;
  const { tool_call_id, name, input, input_truncated } = event.payload;
  if (existing.currentTurn.cards.some((c) => c.kind === "toolCall" && c.callId === tool_call_id)) return state;
  const toolCallCard: MessageCard = {
    kind: "toolCall",
    callId: tool_call_id,
    name,
    input,
    inputTruncated: input_truncated,
    expanded: false,
  };
  const newAgents = new Map(state.agents);
  newAgents.set(agentId, { ...existing, currentTurn: { ...existing.currentTurn, cards: [...existing.currentTurn.cards, toolCallCard] } });
  return { ...state, agents: newAgents };
}

function reduceToolResult(state: TuiState, event: EventEnvelope<"agent.tool.result">): TuiState {
  if (state.teamId === null) return state;
  if (event.sender.kind !== "agent") return state;
  if (event.sender.identity.teamId !== state.teamId) return state;
  const identity = event.sender.identity;
  const agentId = composeAgentId(identity.teamId, identity.agentKey);
  const existing = state.agents.get(agentId);
  if (existing === undefined) return state;
  if (existing.currentTurn === null) return state;
  const { tool_call_id, name, output, output_truncated, duration_ms, error } = event.payload;
  const cards = [...existing.currentTurn.cards];
  const index = cards.findIndex((c) => c.kind === "toolCall" && c.callId === tool_call_id);
  if (index === -1) return state;
  const toolResultCard: MessageCard = {
    kind: "toolResult",
    callId: tool_call_id,
    name,
    output,
    outputTruncated: output_truncated,
    durationMs: duration_ms,
    error,
    expanded: false,
  };
  cards[index] = toolResultCard;
  const newAgents = new Map(state.agents);
  newAgents.set(agentId, { ...existing, currentTurn: { ...existing.currentTurn, cards } });
  return { ...state, agents: newAgents };
}

function emptyAgent(agentId: AgentId, teamId: string, agentKey: string, role: string, isLeader: boolean): AgentUiState {
  return {
    agentId,
    teamId,
    agentKey,
    role,
    isLeader,
    status: "idle",
    lastIdleAt: 0,
    model: null,
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
  const hasContent = turn.cards.length > 0 || turn.blocks.some((b) => b.text.length > 0);
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