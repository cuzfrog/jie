import type { AgentMessage } from "@cuzfrog/jie-platform";
import type { AssistantMessage, TextContent, ToolResultMessage, UserMessage } from "@earendil-works/pi-ai";
import { isTodoDetails, type TodoItem } from "../todo";
import type { MessageCard, MessageTurn } from "./state";

const USER_INGRESS_PREFIX = "[user]: ";

export interface HydratedHistory {
  readonly history: MessageTurn[];
  readonly currentTurn: MessageTurn | null;
  readonly todos: ReadonlyArray<TodoItem>;
}

export function hydrateHistory(messages: ReadonlyArray<AgentMessage>): HydratedHistory {
  const turns: MessageTurn[] = [];
  let current: MessageTurn | null = null;
  for (const message of messages) {
    if (message.role === "user") {
      if (current !== null) turns.push(current);
      current = { userPrompt: userPromptText(message), cards: [], blocks: [], streamId: null };
    } else if (message.role === "assistant") {
      if (current === null) current = { userPrompt: "", cards: [], blocks: [], streamId: null };
      appendAssistant(current, message);
    } else if (message.role === "toolResult") {
      if (current === null) current = { userPrompt: "", cards: [], blocks: [], streamId: null };
      appendToolResult(current, message);
    }
  }
  if (current !== null) turns.push(current);
  if (turns.length === 0) return { history: [], currentTurn: null, todos: [] };
  return { history: turns.slice(0, turns.length - 1), currentTurn: turns[turns.length - 1]!, todos: deriveTodos(turns) };
}

function deriveTodos(turns: ReadonlyArray<MessageTurn>): ReadonlyArray<TodoItem> {
  let todos: ReadonlyArray<TodoItem> = [];
  for (const turn of turns) {
    for (const card of turn.cards) {
      if (card.kind === "toolResult" && isTodoDetails(card.details)) todos = card.details.todos;
    }
  }
  return todos;
}

function userPromptText(message: UserMessage): string {
  const content = message.content;
  const raw = typeof content === "string" ? content : content.filter(isTextContent).map((part) => part.text).join("");
  return raw.startsWith(USER_INGRESS_PREFIX) ? raw.slice(USER_INGRESS_PREFIX.length) : raw;
}

function appendAssistant(turn: MessageTurn, message: AssistantMessage): void {
  for (const part of message.content) {
    if (part.type === "text") appendBlock(turn, "text", part.text);
    else if (part.type === "thinking") appendBlock(turn, "thinking", part.thinking);
    else if (part.type === "toolCall") {
      turn.cards.push({ kind: "toolCall", callId: part.id, name: part.name, input: JSON.stringify(part.arguments), inputTruncated: false });
    }
  }
}

function appendToolResult(turn: MessageTurn, message: ToolResultMessage): void {
  const text = message.content.filter(isTextContent).map((part) => part.text).join("");
  const index = turn.cards.findIndex((card) => card.kind === "toolCall" && card.callId === message.toolCallId);
  const prior = index === -1 ? undefined : turn.cards[index];
  const card: MessageCard = {
    kind: "toolResult",
    callId: message.toolCallId,
    name: message.toolName,
    input: prior?.input,
    inputTruncated: prior?.inputTruncated,
    output: message.isError ? null : text,
    outputTruncated: false,
    error: message.isError ? text : null,
    details: message.details,
  };
  if (index === -1) turn.cards.push(card);
  else turn.cards[index] = card;
}

function appendBlock(turn: MessageTurn, kind: "text" | "thinking", text: string): void {
  const last = turn.blocks[turn.blocks.length - 1];
  if (last !== undefined && last.kind === kind) {
    turn.blocks[turn.blocks.length - 1] = { ...last, text: last.text + text };
    return;
  }
  turn.blocks.push({ kind, text });
}

function isTextContent(part: { readonly type: string }): part is TextContent {
  return part.type === "text";
}
