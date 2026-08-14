import { isDiffDetails, type AgentMessage, type UserIngressMessage } from "../../platform";
import type { AssistantMessage, TextContent, ToolResultMessage } from "@earendil-works/pi-ai";
import type { MessageCard, MessageTurn } from "./state";

const TRUNCATION_BYTES = 4 * 1024;
const TRUNCATION_MARKER = "...[%d chars truncated]...";
const TRUNCATION_MARKER_LENGTH = 25;

export interface HydratedHistory {
  readonly history: MessageTurn[];
  readonly currentTurn: MessageTurn | null;
  readonly compactionMarker: { readonly seq: number; readonly summary: string; readonly tokensBefore: number } | null;
  readonly nextSeq: number;
}

export function hydrateHistory(messages: ReadonlyArray<AgentMessage>, startSeq: number): HydratedHistory {
  const turns: MessageTurn[] = [];
  let current: MessageTurn | null = null;
  let compactionMarker: HydratedHistory["compactionMarker"] = null;
  let nextSeq = startSeq;
  for (const message of messages) {
    if (message.role === "user") {
      if (current !== null) turns.push(current);
      current = { userPrompt: userPromptText(message), cards: [], blocks: [], streamId: null, seq: nextSeq };
      nextSeq += 1;
    } else if (message.role === "assistant") {
      if (current === null) {
        current = { userPrompt: "", cards: [], blocks: [], streamId: null, seq: nextSeq };
        nextSeq += 1;
      }
      appendAssistant(current, message);
    } else if (message.role === "toolResult") {
      if (current === null) {
        current = { userPrompt: "", cards: [], blocks: [], streamId: null, seq: nextSeq };
        nextSeq += 1;
      }
      appendToolResult(current, message);
    } else if (message.role === "compactionSummary") {
      compactionMarker = { seq: nextSeq, summary: message.summary, tokensBefore: message.tokensBefore };
      nextSeq += 1;
    }
  }
  if (current !== null) turns.push(current);
  if (turns.length === 0) return { history: [], currentTurn: null, compactionMarker, nextSeq };
  return { history: turns.slice(0, turns.length - 1), currentTurn: turns[turns.length - 1]!, compactionMarker, nextSeq };
}

function userPromptText(message: UserIngressMessage): string {
  if (message.displayText !== undefined) return message.displayText;
  const content = message.content;
  return typeof content === "string" ? content : content.filter(isTextContent).map((part) => part.text).join("");
}

function appendAssistant(turn: MessageTurn, message: AssistantMessage): void {
  for (const part of message.content) {
    if (part.type === "text") appendBlock(turn, "text", part.text);
    else if (part.type === "thinking") appendBlock(turn, "thinking", part.thinking, part.thinkingDurationMs ?? 0);
    else if (part.type === "toolCall") {
      const input = JSON.stringify(part.arguments);
      const { text, truncated } = truncateString(input);
      turn.cards.push({ kind: "toolCall", callId: part.id, name: part.name, input: text, inputTruncated: truncated });
    }
  }
}

function appendToolResult(turn: MessageTurn, message: ToolResultMessage): void {
  const text = message.content.filter(isTextContent).map((part) => part.text).join("");
  const index = turn.cards.findIndex((card) => card.kind === "toolCall" && card.callId === message.toolCallId);
  const prior = index === -1 ? undefined : turn.cards[index];
  const output = message.isError ? null : text;
  const { text: outputText, truncated: outputTruncated } = maybeTruncate(output);
  const card: MessageCard = {
    kind: "toolResult",
    callId: message.toolCallId,
    name: message.toolName,
    input: prior?.input,
    inputTruncated: prior?.inputTruncated,
    output: outputText,
    outputTruncated,
    error: message.isError ? text : null,
    details: isDiffDetails(message.details) ? message.details : null,
  };
  if (index === -1) turn.cards.push(card);
  else turn.cards[index] = card;
}

function appendBlock(turn: MessageTurn, kind: "text" | "thinking", text: string, durationMs = 0): void {
  const last = turn.blocks[turn.blocks.length - 1];
  if (last !== undefined && last.kind === kind) {
    if (kind === "thinking") {
      turn.blocks[turn.blocks.length - 1] = { ...last, text: last.text + text, durationMs: (last.durationMs ?? 0) + durationMs };
    } else {
      turn.blocks[turn.blocks.length - 1] = { ...last, text: last.text + text };
    }
    return;
  }
  turn.blocks.push({ kind, text, ...(kind === "thinking" ? { durationMs } : {}) });
}

function isTextContent(part: { readonly type: string }): part is TextContent {
  return part.type === "text";
}

function maybeTruncate(input: string | null | undefined): { text: string | null | undefined; truncated: boolean } {
  if (input === null || input === undefined) return { text: input, truncated: false };
  return truncateString(input);
}

function truncateString(input: string): { text: string; truncated: boolean } {
  if (input.length <= TRUNCATION_BYTES) return { text: input, truncated: false };
  const half = Math.floor((TRUNCATION_BYTES - TRUNCATION_MARKER_LENGTH) / 2);
  const truncatedChars = input.length - half * 2;
  const text = `${input.slice(0, half)}${TRUNCATION_MARKER.replace("%d", String(truncatedChars))}${input.slice(input.length - half)}`;
  return { text, truncated: true };
}
