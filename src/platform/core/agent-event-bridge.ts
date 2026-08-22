import type { AgentMessage, AgentEvent as PiAgentEvent } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, StopReason, Usage } from "@earendil-works/pi-ai";
import { Events, type AgentSender, type EventManager } from "../event";
import type { HookIdentity, HookRunner } from "../hooks";
import type { SessionUsageStore, SessionUsageTotals, TranscriptStore } from "../storage";
import { isDiffDetails } from "..";
import type { UserIngressMessage } from "../types";
import type { PromptQueue } from "./prompt-queue";
import { StreamPublisherImpl, type StreamPublisher } from "./streaming";

const TRUNCATION_MESSAGE = "Response truncated: the model spent the entire maxTokens budget before producing output (stopReason: length). Consider raising maxTokens for this model.";
const TRUNCATION_CONTINUATION_PROMPT = "Your previous response was cut off by the output token limit before producing any answer. Do not re-reason at length; answer concisely now.";
const MAX_LENGTH_CONTINUATIONS = 1;

export interface AgentEventBridge {
  handleEvent(event: PiAgentEvent): void;
}

interface AgentEventBridgeDeps {
  readonly eventManager: EventManager;
  readonly transcriptStore: TranscriptStore;
  readonly sessionUsageStore: SessionUsageStore;
  readonly hookRunner: HookRunner;
  readonly hookIdentity: HookIdentity;
  readonly sender: AgentSender;
  readonly promptQueue: PromptQueue;
  readonly onRunEnd: () => void;
}

export class AgentEventBridgeImpl implements AgentEventBridge {
  private readonly eventManager: EventManager;
  private readonly transcriptStore: TranscriptStore;
  private readonly sessionUsageStore: SessionUsageStore;
  private readonly hookRunner: HookRunner;
  private readonly hookIdentity: HookIdentity;
  private readonly sender: AgentSender;
  private readonly promptQueue: PromptQueue;
  private readonly onRunEnd: () => void;
  private readonly stream: StreamPublisher;
  private turnStartPending = false;
  private lengthContinuations = 0;
  private sessionInputTokens = 0;
  private sessionOutputTokens = 0;
  private partialUsage: SessionUsageTotals | null = null;
  private lastPublishedPartial: SessionUsageTotals | null = null;

  constructor(deps: AgentEventBridgeDeps) {
    this.eventManager = deps.eventManager;
    this.transcriptStore = deps.transcriptStore;
    this.sessionUsageStore = deps.sessionUsageStore;
    this.hookRunner = deps.hookRunner;
    this.hookIdentity = deps.hookIdentity;
    this.sender = deps.sender;
    this.promptQueue = deps.promptQueue;
    this.onRunEnd = deps.onRunEnd;
    this.stream = new StreamPublisherImpl(deps.eventManager, deps.sender);
  }

  seedSessionUsage(totals: SessionUsageTotals): void {
    this.sessionInputTokens = totals.inputTokens;
    this.sessionOutputTokens = totals.outputTokens;
  }

  handleEvent(event: PiAgentEvent): void {
    if (event.type !== "turn_start") this.flushTurnStart(event);
    switch (event.type) {
      case "turn_start":
        this.turnStartPending = true;
        return;
      case "turn_end": {
        const final = readFinalStopReason(event);
        this.promptQueue.drainForFollowUp(final.isError);
        return;
      }
      case "agent_end": {
        const final = readFinalStopReason(event);
        this.clearPartial();
        this.eventManager.publish(Events.agentIdle(this.sender, final.stopReason));
        if (final.stopReason === "error" && final.errorMessage !== null) {
          this.eventManager.publish(Events.systemError({ kind: "system" }, final.errorMessage));
        } else if (isBudgetTruncated(final.message, final.stopReason)) {
          this.eventManager.publish(Events.systemError({ kind: "system" }, TRUNCATION_MESSAGE));
          if (this.lengthContinuations < MAX_LENGTH_CONTINUATIONS) {
            this.lengthContinuations += 1;
            this.promptQueue.ingestSystemPrompt({ role: "user", content: TRUNCATION_CONTINUATION_PROMPT, timestamp: Date.now() });
          }
        }
        void this.hookRunner.stop({ identity: this.hookIdentity });
        this.promptQueue.publishQueueUpdate();
        this.onRunEnd();
        return;
      }
      case "message_start":
        this.stream.beginStream();
        if (event.message.role === "assistant") {
          this.lastPublishedPartial = null;
          this.partialUsage = event.message.usage !== undefined && this.hasUsageValues(event.message.usage) ? usageTotals(event.message.usage) : null;
          this.maybePublishPartial();
        }
        return;
      case "message_update": {
        const ame = event.assistantMessageEvent;
        if (ame.type === "text_delta") {
          this.stream.append("text", ame.delta);
        } else if (ame.type === "thinking_delta") {
          this.stream.append("thinking", ame.delta);
        }
        this.updatePartialUsage(event.message);
        return;
      }
      case "message_end":
        let message = event.message;
        if (message.role === "assistant") {
          const { thinkingDurations } = this.stream.endStream();
          message = withThinkingDurations(message, thinkingDurations);
          this.finalizeUsage(message);
        }
        this.transcriptStore.persist(
          persistableMessage(message),
          this.hookIdentity.agentKey,
          this.hookIdentity.sessionId,
          this.hookIdentity.teamId,
        );
        return;
      default:
        return;
    }
  }

  private flushTurnStart(event: PiAgentEvent): void {
    if (!this.turnStartPending) return;
    this.turnStartPending = false;
    const message = event.type === "message_start" && event.message.role === "user" ? event.message : null;
    if (message === null) {
      this.eventManager.publish(Events.agentTurnContinue(this.sender));
      return;
    }
    if (isUserIngressMessage(message)) this.lengthContinuations = 0;
    this.promptQueue.consumeChained(message);
    this.eventManager.publish(Events.agentTurnStart(this.sender, userDisplayText(message)));
  }

  private updatePartialUsage(message: AgentMessage): void {
    if (message.role !== "assistant") return;
    const usage = message.usage;
    if (usage === undefined || !this.hasUsageValues(usage)) return;
    this.partialUsage = usageTotals(usage);
    this.maybePublishPartial();
  }

  private maybePublishPartial(): void {
    if (this.partialUsage === null) return;
    if (this.partialUsage.inputTokens === 0 && this.partialUsage.outputTokens === 0) return;
    if (
      this.lastPublishedPartial !== null &&
      this.lastPublishedPartial.inputTokens === this.partialUsage.inputTokens &&
      this.lastPublishedPartial.outputTokens === this.partialUsage.outputTokens
    ) {
      return;
    }
    this.lastPublishedPartial = this.partialUsage;
    this.eventManager.publish(Events.agentUsage(this.sender, {
      input: this.partialUsage.inputTokens,
      output: this.partialUsage.outputTokens,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: this.partialUsage.inputTokens + this.partialUsage.outputTokens,
      session_input_tokens: this.sessionInputTokens,
      session_output_tokens: this.sessionOutputTokens,
      partial: true,
    }));
  }

  private finalizeUsage(message: AssistantMessage): void {
    const tracked = this.partialUsage;
    const usage = message.usage;
    const effectiveUsage = usage !== undefined && this.hasUsageValues(usage) ? usage : trackedToUsage(tracked);
    this.clearPartial();
    if (effectiveUsage === null) return;
    const inputDelta = effectiveUsage.input + effectiveUsage.cacheRead + effectiveUsage.cacheWrite;
    const outputDelta = effectiveUsage.output;
    this.sessionInputTokens += inputDelta;
    this.sessionOutputTokens += outputDelta;
    this.sessionUsageStore.accumulate(
      this.hookIdentity.teamId,
      this.hookIdentity.sessionId,
      this.hookIdentity.agentKey,
      { inputTokens: inputDelta, outputTokens: outputDelta },
    );
    this.eventManager.publish(Events.agentUsage(this.sender, {
      input: effectiveUsage.input,
      output: effectiveUsage.output,
      cacheRead: effectiveUsage.cacheRead,
      cacheWrite: effectiveUsage.cacheWrite,
      totalTokens: effectiveUsage.totalTokens,
      session_input_tokens: this.sessionInputTokens,
      session_output_tokens: this.sessionOutputTokens,
      partial: false,
    }));
  }

  private clearPartial(): void {
    this.partialUsage = null;
    this.lastPublishedPartial = null;
  }

  private hasUsageValues(usage: { input: number; output: number; cacheRead: number; cacheWrite: number; totalTokens: number }): boolean {
    return usage.input > 0 || usage.output > 0 || usage.cacheRead > 0 || usage.cacheWrite > 0 || usage.totalTokens > 0;
  }
}

function userDisplayText(message: AgentMessage): string | null {
  if (!isUserIngressMessage(message)) return null;
  return message.displayText ?? null;
}

function isUserIngressMessage(message: AgentMessage): message is UserIngressMessage {
  return message.role === "user" && "displayText" in message;
}

function readFinalStopReason(event: Extract<PiAgentEvent, { type: "agent_end" }> | Extract<PiAgentEvent, { type: "turn_end" }>): { stopReason: StopReason; isError: boolean; errorMessage: string | null; message: AssistantMessage | undefined } {
  const candidates: AgentMessage[] = event.type === "agent_end" ? event.messages : [event.message];
  let lastAssistant: AssistantMessage | undefined;
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const message = candidates[i];
    if (message !== undefined && message.role === "assistant") {
      lastAssistant = message;
      break;
    }
  }
  const stopReason: StopReason = lastAssistant?.stopReason ?? "stop";
  const isError = stopReason === "error" || stopReason === "aborted";
  return { stopReason, isError, errorMessage: lastAssistant?.errorMessage ?? null, message: lastAssistant };
}

function isBudgetTruncated(assistant: AssistantMessage | undefined, stopReason: StopReason): boolean {
  if (stopReason !== "length" || assistant === undefined) return false;
  if (hasToolCall(assistant.content)) return false;
  return !hasMeaningfulText(assistant.content);
}

function hasToolCall(content: AssistantMessage["content"]): boolean {
  return content.some((part) => part.type === "toolCall");
}

function hasMeaningfulText(content: AssistantMessage["content"]): boolean {
  return content.some((part) => part.type === "text" && part.text.trim() !== "");
}

function withThinkingDurations(message: AssistantMessage, thinkingDurations: readonly number[]): AssistantMessage {
  let durationIndex = 0;
  const content = message.content.map((part) => {
    if (part.type !== "thinking") return part;
    const thinkingDurationMs = durationIndex < thinkingDurations.length ? thinkingDurations[durationIndex] : undefined;
    durationIndex += 1;
    if (thinkingDurationMs === undefined) return part;
    return { ...part, thinkingDurationMs };
  });
  if (content === message.content) return message;
  return { ...message, content };
}

function persistableMessage(message: AgentMessage): AgentMessage {
  if (message.role !== "toolResult" || isDiffDetails(message.details)) return message;
  const { details: _stripped, ...persistable } = message;
  return persistable;
}

function usageTotals(usage: Usage): SessionUsageTotals {
  return {
    inputTokens: usage.input + usage.cacheRead + usage.cacheWrite,
    outputTokens: usage.output,
  };
}

function trackedToUsage(tracked: SessionUsageTotals | null): Usage | null {
  if (tracked === null) return null;
  if (tracked.inputTokens === 0 && tracked.outputTokens === 0) return null;
  const totalTokens = tracked.inputTokens + tracked.outputTokens;
  return {
    input: tracked.inputTokens,
    output: tracked.outputTokens,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}
