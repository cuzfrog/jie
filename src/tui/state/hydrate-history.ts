import { isDiffDetails, type AgentMessage, type UserIngressMessage } from "../../platform";
import type { AssistantMessage, TextContent, ToolResultMessage } from "@earendil-works/pi-ai";
import type { AgentUiState, MessageBlock, MessageCard, MessageTurn } from "./state";

const TRUNCATION_BYTES = 4 * 1024;
const TRUNCATION_MARKER = "...[%d chars truncated]...";
const TRUNCATION_MARKER_LENGTH = 25;

export interface HydratedHistory {
  readonly history: MessageTurn[];
  readonly currentTurn: MessageTurn | null;
  readonly compactionMarker: AgentUiState["compactionMarker"];
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
      current = { userPrompt: userPromptText(message), entries: [], streamId: null, seq: nextSeq };
      nextSeq += 1;
    } else if (message.role === "assistant") {
      if (current === null) {
        current = { userPrompt: "", entries: [], streamId: null, seq: nextSeq };
        nextSeq += 1;
      }
      appendAssistant(current, message);
    } else if (message.role === "toolResult") {
      if (current === null) {
        current = { userPrompt: "", entries: [], streamId: null, seq: nextSeq };
        nextSeq += 1;
      }
      appendToolResult(current, message);
    } else if (message.role === "compactionSummary") {
      compactionMarker = { turnsBefore: turns.length + (current !== null ? 1 : 0), summary: message.summary, tokensBefore: message.tokensBefore };
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
    else if (part.type === "thinking") {
      if (part.thinking === "" && part.thinkingDurationMs === undefined) continue;
      appendBlock(turn, "thinking", part.thinking, part.thinkingDurationMs ?? 0);
    } else if (part.type === "toolCall") {
      const input = JSON.stringify(part.arguments);
      const { text, truncated } = truncateString(input);
      turn.entries.push({ kind: "toolCall", callId: part.id, name: part.name, input: text, inputTruncated: truncated });
    }
  }
}

function appendToolResult(turn: MessageTurn, message: ToolResultMessage): void {
  const text = message.content.filter(isTextContent).map((part) => part.text).join("");
  const index = turn.entries.findIndex((entry) => (entry.kind === "toolCall" || entry.kind === "toolResult") && entry.callId === message.toolCallId);
  const prior = index === -1 ? undefined : turn.entries[index];
  const priorInput = prior !== undefined && isToolCard(prior) ? prior.input : undefined;
  const priorInputTruncated = prior !== undefined && isToolCard(prior) ? prior.inputTruncated : undefined;
  const output = message.isError ? null : text;
  const { text: outputText, truncated: outputTruncated } = maybeTruncate(output);
  const card: MessageCard = {
    kind: "toolResult",
    callId: message.toolCallId,
    name: message.toolName,
    input: priorInput,
    inputTruncated: priorInputTruncated,
    output: outputText,
    outputTruncated,
    error: message.isError ? text : null,
    details: isDiffDetails(message.details) ? message.details : null,
  };
  if (index === -1) turn.entries.push(card);
  else turn.entries[index] = card;
}

function appendBlock(turn: MessageTurn, kind: "text" | "thinking", text: string, durationMs = 0): void {
  const last = turn.entries[turn.entries.length - 1];
  if (last !== undefined && (last.kind === "text" || last.kind === "thinking") && last.kind === kind) {
    if (kind === "thinking") {
      turn.entries[turn.entries.length - 1] = { ...last, text: last.text + text, durationMs: (last.durationMs ?? 0) + durationMs };
    } else {
      turn.entries[turn.entries.length - 1] = { ...last, text: last.text + text };
    }
    return;
  }
  turn.entries.push({ kind, text, ...(kind === "thinking" ? { durationMs } : {}) });
}

function isToolCard(entry: MessageBlock | MessageCard): entry is MessageCard {
  return entry.kind === "toolCall" || entry.kind === "toolResult";
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
