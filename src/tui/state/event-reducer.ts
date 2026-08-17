import type { AnyEventEnvelope } from "../../platform";
import { TuiState, type AgentId, type AgentUiState, type MessageBlock, type MessageCard, type MessageTurn } from "./state";
import { teamLoadReducer } from "./team-load-reducer";
import { contextHistory, estimateContextTokens } from "./context-tokens";
import { Actions } from "./actions";
import { kanbanReducer } from "./kanban-reducer";
import { reduceQuestionAction } from "./question-reducer";

export function reduce(state: TuiState, event: AnyEventEnvelope): TuiState {
  switch (event.type) {
    case "system.team.loaded": return reduceTeamLoaded(state, event);
    case "system.session.renamed": return reduceSessionRenamed(state, event);
    case "system.error": return reduceSystemError(state, event);
    case "agent.model.assigned": return reduceModelAssigned(state, event);
    case "agent.prompt.queue.update": return reduceQueueUpdate(state, event);
    case "agent.turn.start": return reduceTurnStart(state, event);
    case "agent.turn.continue": return reduceTurnContinue(state, event);
    case "agent.idle": return reduceIdle(state, event);
    case "agent.usage": return reduceUsage(state, event);
    case "agent.compacted": return reduceCompacted(state, event);
    case "agent.compaction.start": return reduceCompactionStart(state, event);
    case "agent.compaction.end": return reduceCompactionEnd(state, event);
    case "agent.stream.chunk": return reduceStreamChunk(state, event);
    case "agent.stream.end": return reduceStreamEnd(state, event);
    case "agent.tool.call": return reduceToolCall(state, event);
    case "agent.tool.result": return reduceToolResult(state, event);
    case "agent.question.ask": return reduceQuestionAsk(state, event);
    default: return state;
  }
}

function reduceTeamLoaded(state: TuiState, event: AnyEventEnvelope): TuiState {
  if (event.type !== "system.team.loaded") return state;
  return teamLoadReducer(state, event.payload);
}

function reduceSessionRenamed(state: TuiState, event: AnyEventEnvelope): TuiState {
  if (event.type !== "system.session.renamed") return state;
  if (state.teamId !== event.payload.teamId) return state;
  return { ...state, sessionName: event.payload.sessionName };
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

function reduceModelAssigned(state: TuiState, event: AnyEventEnvelope): TuiState {
  const resolved = resolveAgent(state, event);
  if (resolved === null) return state;
  if (event.type !== "agent.model.assigned") return state;
  const { agentId, agent } = resolved;
  const model = {
    provider: event.payload.provider,
    id: event.payload.model,
    effort: event.payload.effort,
    contextWindow: event.payload.contextWindow,
  };
  return withAgent(state, agentId, { ...agent, model });
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
  if (event.type !== "agent.turn.start") return state;
  const { agentId, agent } = resolved;
  const prompt = event.payload ?? "";
  const seq = state.nextEntrySeq;
  const interruptedAgentId = state.interruptedAgentId === agentId ? null : state.interruptedAgentId;
  const requireUserAttention = agentId === state.focusedAgentId ? false : state.requireUserAttention;
  const turn = agent.currentTurn;
  if (turn !== null && !turnIsPopulated(turn) && turn.userPrompt === "") {
    const currentTurn = { ...turn, userPrompt: prompt };
    const priorTokens = agent.lastReportedTotalTokens ?? estimateContextTokens(contextHistory(agent), null);
    const contextTokensUsed = priorTokens + estimateContextTokens([], currentTurn);
    const next: AgentUiState = { ...agent, status: "busy", currentTurn, contextTokensUsed };
    return withAgent(state, agentId, next, { errorBanner: null, interruptedAgentId, requireUserAttention });
  }
  const completed = turn === null ? contextHistory(agent) : [...contextHistory(agent), turn];
  const history = turn === null ? agent.history : [...agent.history, turn];
  const currentTurn = freshTurn(prompt, seq);
  const priorTokens = agent.lastReportedTotalTokens ?? estimateContextTokens(completed, null);
  const contextTokensUsed = priorTokens + estimateContextTokens([], currentTurn);
  const next: AgentUiState = { ...agent, status: "busy", history, currentTurn, contextTokensUsed };
  return withAgent(state, agentId, next, { errorBanner: null, interruptedAgentId, requireUserAttention, nextEntrySeq: seq + 1 });
}

function reduceTurnContinue(state: TuiState, event: AnyEventEnvelope): TuiState {
  const resolved = resolveAgent(state, event);
  if (resolved === null) return state;
  if (event.type !== "agent.turn.continue") return state;
  const { agentId, agent } = resolved;
  const interruptedAgentId = state.interruptedAgentId === agentId ? null : state.interruptedAgentId;
  const requireUserAttention = agentId === state.focusedAgentId ? false : state.requireUserAttention;
  const next: AgentUiState = { ...agent, status: "busy" };
  return withAgent(state, agentId, next, { errorBanner: null, interruptedAgentId, requireUserAttention });
}

function reduceIdle(state: TuiState, event: AnyEventEnvelope): TuiState {
  const resolved = resolveAgent(state, event);
  if (resolved === null) return state;
  if (event.type !== "agent.idle") return state;
  const { agentId, agent } = resolved;
  const contextTokensUsed = agent.lastReportedTotalTokens ?? estimateContextTokens(contextHistory(agent), agent.currentTurn);
  const next: AgentUiState = {
    ...agent,
    status: "idle",
    lastStopReason: event.payload,
    contextTokensUsed,
    inflightInputTokens: 0,
    inflightOutputTokens: 0,
  };
  const interruptedAgentId = agentId === state.focusedAgentId && event.payload === "aborted" ? agentId : state.interruptedAgentId;
  const requireUserAttention =
    agentId === state.focusedAgentId && !state.terminalFocused && TuiState.isAttentionStopReason(event.payload)
      ? true
      : state.requireUserAttention;
  return withAgent(state, agentId, next, { interruptedAgentId, requireUserAttention });
}

function reduceUsage(state: TuiState, event: AnyEventEnvelope): TuiState {
  const resolved = resolveAgent(state, event);
  if (resolved === null) return state;
  if (event.type !== "agent.usage") return state;
  const { agentId, agent } = resolved;
  if (event.payload.partial) {
    return withAgent(state, agentId, {
      ...agent,
      inflightInputTokens: event.payload.input + event.payload.cacheRead + event.payload.cacheWrite,
      inflightOutputTokens: event.payload.output,
    });
  }
  return withAgent(state, agentId, {
    ...agent,
    contextTokensUsed: event.payload.totalTokens,
    lastReportedTotalTokens: event.payload.totalTokens,
    sessionInputTokens: event.payload.session_input_tokens,
    sessionOutputTokens: event.payload.session_output_tokens,
    inflightInputTokens: 0,
    inflightOutputTokens: 0,
  });
}

function reduceCompacted(state: TuiState, event: AnyEventEnvelope): TuiState {
  const resolved = resolveAgent(state, event);
  if (resolved === null) return state;
  if (event.type !== "agent.compacted") return state;
  const { agentId, agent } = resolved;
  const previous = agent.compactionMarker?.turnsBefore ?? 0;
  const turns = agent.currentTurn === null ? [...agent.history] : [...agent.history, agent.currentTurn];
  const turnsBefore = Math.min(previous + event.payload.summarized_prompts, Math.max(turns.length - 1, 0));
  const next: AgentUiState = {
    ...agent,
    compactionMarker: { turnsBefore, summary: event.payload.summary, tokensBefore: event.payload.tokens_before },
    compactionInProgress: false,
    contextTokensUsed: event.payload.tokens_after,
    lastReportedTotalTokens: event.payload.tokens_after,
  };
  return withAgent(state, agentId, next);
}

function reduceCompactionStart(state: TuiState, event: AnyEventEnvelope): TuiState {
  const resolved = resolveAgent(state, event);
  if (resolved === null) return state;
  if (event.type !== "agent.compaction.start") return state;
  const { agentId, agent } = resolved;
  return withAgent(state, agentId, { ...agent, compactionInProgress: true });
}

function reduceCompactionEnd(state: TuiState, event: AnyEventEnvelope): TuiState {
  const resolved = resolveAgent(state, event);
  if (resolved === null) return state;
  if (event.type !== "agent.compaction.end") return state;
  const { agentId, agent } = resolved;
  return withAgent(state, agentId, { ...agent, compactionInProgress: false });
}

function reduceStreamChunk(state: TuiState, event: AnyEventEnvelope): TuiState {
  const resolved = resolveAgent(state, event);
  if (resolved === null) return state;
  if (event.type !== "agent.stream.chunk") return state;
  const { agentId, agent } = resolved;
  if (agent.currentTurn === null) return state;
  const { stream_id, block_type, text } = event.payload;
  const entries = [...agent.currentTurn.entries];
  const last = entries[entries.length - 1];
  if (agent.currentTurn.streamId !== stream_id) {
    entries.push(newMessageBlock(block_type, text));
  } else if (
    last !== undefined &&
    (last.kind === "text" || last.kind === "thinking") &&
    last.kind === block_type
  ) {
    entries[entries.length - 1] = { ...last, text: last.text + text };
  } else {
    entries.push(newMessageBlock(block_type, text));
  }
  const nextTurn = { ...agent.currentTurn, entries, streamId: stream_id };
  const contextTokensUsed = estimateContextTokens(contextHistory(agent), nextTurn);
  const next: AgentUiState = { ...agent, currentTurn: nextTurn, contextTokensUsed };
  return withAgent(state, agentId, next);
}

function reduceStreamEnd(state: TuiState, event: AnyEventEnvelope): TuiState {
  const resolved = resolveAgent(state, event);
  if (resolved === null) return state;
  if (event.type !== "agent.stream.end") return state;
  const { agentId, agent } = resolved;
  const turn = agent.currentTurn;
  if (turn === null) return state;
  const { stream_id, thinking_durations } = event.payload;
  if (thinking_durations.length === 0) return state;
  if (turn.streamId !== stream_id) return state;
  const entries = [...turn.entries];
  let durationIndex = 0;
  for (let i = 0; i < entries.length && durationIndex < thinking_durations.length; i += 1) {
    const entry = entries[i]!;
    if (entry.kind !== "thinking" || entry.durationMs !== undefined) continue;
    entries[i] = { ...entry, durationMs: thinking_durations[durationIndex]! };
    durationIndex += 1;
  }
  if (durationIndex === 0) return state;
  const nextTurn = { ...turn, entries };
  return withAgent(state, agentId, { ...agent, currentTurn: nextTurn });
}

function reduceToolCall(state: TuiState, event: AnyEventEnvelope): TuiState {
  const resolved = resolveAgent(state, event);
  if (resolved === null) return state;
  if (event.type !== "agent.tool.call") return state;
  const { agentId, agent } = resolved;
  if (agent.currentTurn === null) return state;
  const { tool_call_id, name, input, input_truncated } = event.payload;
  if (agent.currentTurn.entries.some((entry) => (entry.kind === "toolCall" || entry.kind === "toolResult") && entry.callId === tool_call_id)) return state;
  const toolCallCard: MessageCard = { kind: "toolCall", callId: tool_call_id, name, input, inputTruncated: input_truncated };
  const nextTurn = { ...agent.currentTurn, entries: [...agent.currentTurn.entries, toolCallCard] };
  const contextTokensUsed = estimateContextTokens(contextHistory(agent), nextTurn);
  const next: AgentUiState = { ...agent, currentTurn: nextTurn, contextTokensUsed };
  return withAgent(state, agentId, next);
}

function reduceQuestionAsk(state: TuiState, event: AnyEventEnvelope): TuiState {
  const resolved = resolveAgent(state, event);
  if (resolved === null) return state;
  if (event.type !== "agent.question.ask") return state;
  return reduceQuestionAction(state, Actions.showQuestions(event.payload.requestId, resolved.agentId, event.payload.questions));
}

function reduceToolResult(state: TuiState, event: AnyEventEnvelope): TuiState {
  const resolved = resolveAgent(state, event);
  if (resolved === null) return state;
  if (event.type !== "agent.tool.result") return state;
  const { agentId, agent } = resolved;
  const question = state.question !== null && state.question.agentId === agentId && event.payload.name === "ask_user_questions"
    ? null
    : state.question;
  const { tool_call_id, name, output, output_truncated, duration_ms, error, details } = event.payload;
  const boardState = details !== null && "kind" in details && details.kind === "kanban"
    ? kanbanReducer(state, Actions.setKanbanBoard(details.cards))
    : state;
  if (agent.currentTurn === null) return boardState;
  const entries = [...agent.currentTurn.entries];
  const index = entries.findIndex((entry) => (entry.kind === "toolCall" || entry.kind === "toolResult") && entry.callId === tool_call_id);
  if (index === -1) return boardState;
  const prior = entries[index];
  const priorInput = isToolCard(prior) ? prior.input : undefined;
  const priorInputTruncated = isToolCard(prior) ? prior.inputTruncated : undefined;
  entries[index] = {
    kind: "toolResult",
    callId: tool_call_id,
    name,
    input: priorInput,
    inputTruncated: priorInputTruncated,
    output: displayOutput(output),
    outputTruncated: output_truncated,
    durationMs: duration_ms,
    error,
    details,
  };
  const nextTurn = { ...agent.currentTurn, entries };
  const contextTokensUsed = estimateContextTokens(contextHistory(agent), nextTurn);
  const next: AgentUiState = { ...agent, currentTurn: nextTurn, contextTokensUsed };
  return withAgent(boardState, agentId, next, { question });
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

function newMessageBlock(kind: "text" | "thinking", text: string): MessageBlock {
  if (kind === "thinking") return { kind: "thinking", text, startedAtMs: Date.now() };
  return { kind: "text", text };
}

function freshTurn(userPrompt: string, seq: number): MessageTurn {
  return { userPrompt, entries: [], streamId: null, seq };
}

function turnIsPopulated(turn: MessageTurn | null): boolean {
  if (turn === null) return false;
  return turn.entries.some((entry) => {
    if (entry.kind === "text" || entry.kind === "thinking") return entry.text.length > 0;
    return true;
  });
}

function composeAgentId(teamId: string, agentKey: string): AgentId {
  return `${teamId}:${agentKey}`;
}

function isToolCard(entry: MessageBlock | MessageCard): entry is MessageCard {
  return entry.kind === "toolCall" || entry.kind === "toolResult";
}

function displayOutput(output: string | null): string | null {
  if (output === null) return null;
  let parsed: { content?: string } | null;
  try {
    parsed = JSON.parse(output);
  } catch {
    return output;
  }
  if (typeof parsed !== "object" || parsed === null) return output;
  const content = parsed.content;
  return typeof content === "string" ? content : output;
}
