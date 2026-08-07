import {
  convertToLlm,
  createCompactionSummaryMessage,
  DEFAULT_COMPACTION_SETTINGS,
  estimateContextTokens,
  estimateTokens,
  serializeConversation,
  shouldCompact,
  type AgentMessage,
  type CompactionSummaryMessage,
  type CustomMessage,
} from "@earendil-works/pi-agent-core";
import type { Api, AssistantMessage, Model, ToolResultMessage, UserMessage } from "@earendil-works/pi-ai";
import type { Settings } from "../config";
import type { LlmService } from "../llm";
import type { TranscriptStore } from "../storage";

export interface CompactionInput {
  readonly messages: ReadonlyArray<AgentMessage>;
  readonly contextWindow: number;
  readonly model: Model<Api>;
  readonly agentKey: string;
  readonly sessionId: string;
  readonly teamId: string;
  readonly signal?: AbortSignal;
}

export interface CompactionResult {
  readonly summaryMessage: CompactionSummaryMessage;
  readonly firstKeptIndex: number;
  readonly tokensBefore: number;
  readonly summarizedPrefix: ReadonlyArray<AgentMessage>;
}

export interface Compactor {
  compact(input: CompactionInput): Promise<CompactionResult | null>;
  fitToWindow(messages: ReadonlyArray<AgentMessage>, model: Model<Api>, contextWindow?: number): ReadonlyArray<AgentMessage>;
}

type CompactionOverrides = NonNullable<Settings["compaction"]>;

interface CompactorDeps {
  readonly transcriptStore: TranscriptStore;
  readonly llmService: LlmService;
  readonly getSettings?: () => CompactionOverrides | undefined;
}

export class CompactorImpl implements Compactor {
  private readonly transcriptStore: TranscriptStore;
  private readonly llmService: LlmService;
  private readonly getSettings: (() => CompactionOverrides | undefined) | undefined;

  constructor(deps: CompactorDeps) {
    this.transcriptStore = deps.transcriptStore;
    this.llmService = deps.llmService;
    this.getSettings = deps.getSettings;
  }

  async compact(input: CompactionInput): Promise<CompactionResult | null> {
    const settings = resolveSettings(this.getSettings?.());
    if (!settings.enabled) return null;
    const tokensBefore = contextTokensSince(input.messages, lastSummaryTimestamp(input.messages));
    if (!shouldCompact(tokensBefore, input.contextWindow, settings)) return null;
    const preparation = prepareCompaction(input.messages, settings.keepRecentTokens);
    if (preparation === null) return null;
    const storedCount = (await this.transcriptStore.restore(input.agentKey, input.sessionId, input.teamId)).length;
    if (storedCount !== input.messages.length) {
      throw new Error(`history out of sync with storage: ${storedCount} stored rows, ${input.messages.length} messages`);
    }
    const prefixBudget = summaryPrefixBudget(input.contextWindow, input.model, settings.reserveTokens);
    const summarizedPrefix = fitMessages(input.messages.slice(0, preparation.firstKeptIndex), prefixBudget);
    const summaryText = await this.llmService.complete({
      model: input.model,
      systemPrompt: SUMMARIZATION_SYSTEM_PROMPT,
      prompt: buildSummaryPrompt(summarizedPrefix, preparation.previousSummary),
      maxTokens: summaryMaxTokens(input.model, settings.reserveTokens),
      signal: input.signal,
    });
    const summaryMessage = createCompactionSummaryMessage(summaryText, tokensBefore, new Date().toISOString());
    this.transcriptStore.compact(preparation.firstKeptIndex, summaryMessage, input.agentKey, input.sessionId, input.teamId);
    return { summaryMessage, firstKeptIndex: preparation.firstKeptIndex, tokensBefore, summarizedPrefix };
  }

  fitToWindow(messages: ReadonlyArray<AgentMessage>, model: Model<Api>, contextWindow: number = model.contextWindow): ReadonlyArray<AgentMessage> {
    const settings = resolveSettings(this.getSettings?.());
    const budget = settings.reserveTokens < contextWindow ? contextWindow - settings.reserveTokens : contextWindow;
    return fitMessages(messages, budget);
  }
}

function resolveSettings(overrides: CompactionOverrides | undefined): typeof DEFAULT_COMPACTION_SETTINGS {
  return { ...DEFAULT_COMPACTION_SETTINGS, ...overrides };
}

function lastSummaryTimestamp(messages: ReadonlyArray<AgentMessage>): number {
  const first = messages[0];
  return first !== undefined && first.role === "compactionSummary" ? first.timestamp : 0;
}

function contextTokensSince(messages: ReadonlyArray<AgentMessage>, sinceTimestamp: number): number {
  const estimate = estimateContextTokens([...messages]);
  if (estimate.lastUsageIndex === null) return estimate.tokens;
  const usageMessage = messages[estimate.lastUsageIndex];
  if (usageMessage !== undefined && usageMessage.timestamp <= sinceTimestamp) {
    return messages.reduce((sum, message) => sum + estimateTokens(message), 0);
  }
  return estimate.tokens;
}

interface CompactionPreparation {
  readonly firstKeptIndex: number;
  readonly previousSummary: string | null;
}

function prepareCompaction(messages: ReadonlyArray<AgentMessage>, keepRecentTokens: number): CompactionPreparation | null {
  const cutPoints: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    const role = messages[i]!.role;
    if (role === "user" || role === "assistant") cutPoints.push(i);
  }
  if (cutPoints.length === 0) return null;
  const thresholdIndex = findCompactionThresholdIndex(messages, keepRecentTokens);
  const firstKeptIndex = findFirstKeptIndex(messages, cutPoints, thresholdIndex, keepRecentTokens);
  if (firstKeptIndex === null) return null;
  const summarized = messages.slice(0, firstKeptIndex);
  if (summarized.length === 0) return null;
  if (summarized.every((message) => message.role === "compactionSummary")) return null;
  const first = messages[0];
  const previousSummary = first !== undefined && first.role === "compactionSummary" ? first.summary : null;
  return { firstKeptIndex, previousSummary };
}

function buildSummaryPrompt(summarized: ReadonlyArray<AgentMessage>, previousSummary: string | null): string {
  const conversationText = serializeConversation(convertToLlm([...summarized]));
  let prompt = `<conversation>\n${conversationText}\n</conversation>\n\n`;
  if (previousSummary !== null) prompt += `<previous-summary>\n${previousSummary}\n</previous-summary>\n\n`;
  prompt += previousSummary !== null ? UPDATE_SUMMARIZATION_PROMPT : SUMMARIZATION_PROMPT;
  return prompt;
}

function summaryPrefixBudget(contextWindow: number, model: Model<Api>, reserveTokens: number): number {
  return Math.max(contextWindow - summaryMaxTokens(model, reserveTokens) - SUMMARY_PROMPT_SLACK, 0);
}

function summaryMaxTokens(model: Model<Api>, reserveTokens: number): number {
  const cap = model.maxTokens > 0 ? model.maxTokens : Number.POSITIVE_INFINITY;
  return Math.min(Math.floor(0.8 * reserveTokens), cap);
}

function findCompactionThresholdIndex(messages: ReadonlyArray<AgentMessage>, keepRecentTokens: number): number {
  let accumulatedTokens = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    accumulatedTokens += estimateTokens(messages[i]!);
    if (accumulatedTokens >= keepRecentTokens) return i;
  }
  return 0;
}

function findFirstKeptIndex(
  messages: ReadonlyArray<AgentMessage>,
  cutPoints: ReadonlyArray<number>,
  thresholdIndex: number,
  keepRecentTokens: number,
): number | null {
  const candidates = cutPoints.filter((candidate) => candidate >= thresholdIndex);
  const suffixTokens = buildSuffixTokenSums(messages);
  for (const candidate of candidates) {
    if (candidate === 0) continue;
    if (suffixTokens[candidate]! <= keepRecentTokens) return candidate;
  }
  for (let i = candidates.length - 1; i >= 0; i--) {
    const candidate = candidates[i]!;
    if (candidate > 0) return candidate;
  }
  return null;
}

function buildSuffixTokenSums(messages: ReadonlyArray<AgentMessage>): ReadonlyArray<number> {
  const sums: number[] = new Array(messages.length + 1).fill(0);
  for (let i = messages.length - 1; i >= 0; i--) {
    sums[i] = sums[i + 1] + estimateTokens(messages[i]!);
  }
  return sums;
}

function fitMessages(messages: ReadonlyArray<AgentMessage>, budgetTokens: number): ReadonlyArray<AgentMessage> {
  const entries = messages.map((message, index) => ({ index, message, tokens: estimateTokens(message) }));
  const total = entries.reduce((sum, entry) => sum + entry.tokens, 0);
  if (total <= budgetTokens) return messages;
  const result = [...messages];
  let remaining = total;
  entries.sort((a, b) => b.tokens - a.tokens);
  for (const entry of entries) {
    if (remaining <= budgetTokens) break;
    const target = Math.max(entry.tokens - (remaining - budgetTokens), 0);
    const truncated = truncateMessage(entry.message, target);
    if (truncated === entry.message) continue;
    const truncatedTokens = estimateTokens(truncated);
    result[entry.index] = truncated;
    remaining = remaining - entry.tokens + truncatedTokens;
  }
  return result;
}

function truncateMessage(message: AgentMessage, targetTokens: number): AgentMessage {
  if (estimateTokens(message) <= targetTokens) return message;
  switch (message.role) {
    case "user":
    case "custom":
      return truncateStringOrBlockContentMessage(message, targetTokens);
    case "assistant":
      return truncateAssistantMessage(message, targetTokens);
    case "toolResult":
      return truncateBlockContentMessage(message, targetTokens);
    case "bashExecution":
      return truncateTexts([message.output], targetTokens, (texts) => ({ ...message, output: texts[0]! }));
    case "branchSummary":
    case "compactionSummary":
      return truncateTexts([message.summary], targetTokens, (texts) => ({ ...message, summary: texts[0]! }));
    default:
      return message;
  }
}

function truncateStringOrBlockContentMessage(message: UserMessage | CustomMessage, targetTokens: number): AgentMessage {
  if (typeof message.content === "string") {
    return truncateTexts([message.content], targetTokens, (texts) => ({ ...message, content: texts[0]! }));
  }
  return truncateBlockContentMessage(message, targetTokens);
}

function truncateBlockContentMessage(message: UserMessage | ToolResultMessage | CustomMessage, targetTokens: number): AgentMessage {
  if (typeof message.content === "string") return message;
  const content = message.content;
  const slots = content.flatMap((block, index) => (block.type === "text" ? [{ index, text: block.text }] : []));
  if (slots.length === 0) return message;
  return truncateTexts(slots.map((slot) => slot.text), targetTokens, (truncated) => ({
    ...message,
    content: content.map((block, index) => {
      const position = slots.findIndex((slot) => slot.index === index);
      return block.type === "text" && position !== -1 ? { ...block, text: truncated[position]! } : block;
    }),
  }));
}

function truncateAssistantMessage(message: AssistantMessage, targetTokens: number): AgentMessage {
  const slots = message.content.flatMap((block, index) => {
    if (block.type === "text") return [{ index, text: block.text }];
    if (block.type === "thinking") return [{ index, text: block.thinking }];
    return [];
  });
  if (slots.length === 0) return message;
  return truncateTexts(slots.map((slot) => slot.text), targetTokens, (truncated) => ({
    ...message,
    content: message.content.map((block, index) => {
      const position = slots.findIndex((slot) => slot.index === index);
      if (position === -1) return block;
      if (block.type === "text") return { ...block, text: truncated[position]! };
      if (block.type === "thinking") return { ...block, thinking: truncated[position]! };
      return block;
    }),
  }));
}

function truncateTexts(
  texts: ReadonlyArray<string>,
  targetTokens: number,
  rebuild: (truncated: ReadonlyArray<string>) => AgentMessage,
): AgentMessage {
  const allowances = texts.map((text) => text.length);
  let attempt = rebuild(texts);
  let overshoot = estimateTokens(attempt) - targetTokens;
  while (overshoot > 0) {
    let charsToShave = overshoot * 4;
    let shaved = false;
    for (const index of largestFirst(allowances)) {
      if (charsToShave <= 0) break;
      if (allowances[index]! === texts[index]!.length) charsToShave += TRUNCATION_MARKER.length;
      const shave = Math.min(allowances[index]!, charsToShave);
      if (shave === 0) continue;
      allowances[index]! -= shave;
      charsToShave -= shave;
      shaved = true;
    }
    if (!shaved) break;
    attempt = rebuild(texts.map((text, index) => truncateText(text, allowances[index]!)));
    overshoot = estimateTokens(attempt) - targetTokens;
  }
  return attempt;
}

function largestFirst(allowances: ReadonlyArray<number>): number[] {
  return allowances
    .map((allowance, index) => ({ allowance, index }))
    .filter((entry) => entry.allowance > 0)
    .sort((a, b) => b.allowance - a.allowance)
    .map((entry) => entry.index);
}

function truncateText(text: string, allowance: number): string {
  if (allowance >= text.length) return text;
  return text.slice(0, allowance) + TRUNCATION_MARKER;
}

const SUMMARY_PROMPT_SLACK = 2048;

const TRUNCATION_MARKER = "[content truncated to fit the context window]";

const SUMMARIZATION_SYSTEM_PROMPT = `You are a context summarization assistant. Your task is to read a conversation between a user and an AI assistant, then produce a structured summary following the exact format specified.

Do NOT continue the conversation. Do NOT respond to any questions in the conversation. ONLY output the structured summary.`;

const SUMMARIZATION_PROMPT = `The messages above are a conversation to summarize. Create a structured context checkpoint summary that another LLM will use to continue the work.

Use this EXACT format:

## Goal
[What is the user trying to accomplish? Can be multiple items if the session covers different tasks.]

## Constraints & Preferences
- [Any constraints, preferences, or requirements mentioned by user]
- [Or "(none)" if none were mentioned]

## Progress
### Done
- [x] [Completed tasks/changes]

### In Progress
- [ ] [Current work]

### Blocked
- [Issues preventing progress, if any]

## Key Decisions
- **[Decision]**: [Brief rationale]

## Next Steps
1. [Ordered list of what should happen next]

## Critical Context
- [Any data, examples, or references needed to continue]
- [Or "(none)" if not applicable]

Keep each section concise. Preserve exact file paths, function names, and error messages.`;

const UPDATE_SUMMARIZATION_PROMPT = `The messages above are NEW conversation messages to incorporate into the existing summary provided in <previous-summary> tags.

Update the existing structured summary with new information. RULES:
- PRESERVE all existing information from the previous summary
- ADD new progress, decisions, and context from the new messages
- UPDATE the Progress section: move items from "In Progress" to "Done" when completed
- UPDATE "Next Steps" based on what was accomplished
- PRESERVE exact file paths, function names, and error messages
- If something is no longer relevant, you may remove it

Use this EXACT format:

## Goal
[Preserve existing goals, add new ones if the task expanded]

## Constraints & Preferences
- [Preserve existing, add new ones discovered]

## Progress
### Done
- [x] [Include previously done items AND newly completed items]

### In Progress
- [ ] [Current work - update based on progress]

### Blocked
- [Current blockers - remove if resolved]

## Key Decisions
- **[Decision]**: [Brief rationale] (preserve all previous, add new)

## Next Steps
1. [Update based on current state]

## Critical Context
- [Preserve important context, add new if needed]

Keep each section concise. Preserve exact file paths, function names, and error messages.`;
