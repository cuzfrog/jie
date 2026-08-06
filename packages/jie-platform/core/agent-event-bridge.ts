import type { AgentMessage, AgentEvent as PiAgentEvent } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, StopReason } from "@earendil-works/pi-ai";
import { Events, type AgentSender, type EventManager } from "../event";
import type { HookIdentity, HookRunner } from "../hooks";
import type { TranscriptStore } from "../storage";
import { isDiffDetails } from "../types";
import type { PromptQueue } from "./prompt-queue";
import { StreamPublisherImpl, type StreamPublisher } from "./streaming";

export interface AgentEventBridge {
  handleEvent(event: PiAgentEvent): void;
}

interface AgentEventBridgeDeps {
  readonly eventManager: EventManager;
  readonly transcriptStore: TranscriptStore;
  readonly hookRunner: HookRunner;
  readonly hookIdentity: HookIdentity;
  readonly sender: AgentSender;
  readonly promptQueue: PromptQueue;
  readonly onRunEnd: () => void;
}

export class AgentEventBridgeImpl implements AgentEventBridge {
  private readonly eventManager: EventManager;
  private readonly transcriptStore: TranscriptStore;
  private readonly hookRunner: HookRunner;
  private readonly hookIdentity: HookIdentity;
  private readonly sender: AgentSender;
  private readonly promptQueue: PromptQueue;
  private readonly onRunEnd: () => void;
  private readonly stream: StreamPublisher;
  private turnStartPending = false;

  constructor(deps: AgentEventBridgeDeps) {
    this.eventManager = deps.eventManager;
    this.transcriptStore = deps.transcriptStore;
    this.hookRunner = deps.hookRunner;
    this.hookIdentity = deps.hookIdentity;
    this.sender = deps.sender;
    this.promptQueue = deps.promptQueue;
    this.onRunEnd = deps.onRunEnd;
    this.stream = new StreamPublisherImpl(deps.eventManager, deps.sender);
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
        this.eventManager.publish(Events.agentIdle(this.sender, final.stopReason));
        if (final.isError && final.errorMessage !== null) {
          this.eventManager.publish(Events.systemError({ kind: "system" }, final.errorMessage));
        }
        void this.hookRunner.stop({ identity: this.hookIdentity });
        this.promptQueue.clearPendingLabel();
        this.promptQueue.publishQueueUpdate();
        this.onRunEnd();
        return;
      }
      case "message_start":
        if (event.message.role === "user") this.promptQueue.dropFollowUpLabel(event.message);
        this.stream.beginStream();
        return;
      case "message_update": {
        const ame = event.assistantMessageEvent;
        if (ame.type === "text_delta") {
          this.stream.append("text", ame.delta);
        } else if (ame.type === "thinking_delta") {
          this.stream.append("thinking", ame.delta);
        }
        return;
      }
      case "message_end":
        if (event.message.role === "assistant") {
          this.stream.endStream();
          if (event.message.usage !== undefined && event.message.usage.totalTokens > 0) {
            this.eventManager.publish(Events.agentUsage(this.sender, {
              input: event.message.usage.input,
              output: event.message.usage.output,
              cacheRead: event.message.usage.cacheRead,
              cacheWrite: event.message.usage.cacheWrite,
              totalTokens: event.message.usage.totalTokens,
            }));
          }
        }
        this.transcriptStore.persist(
          persistableMessage(event.message),
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
    this.eventManager.publish(Events.agentTurnStart(this.sender, this.promptQueue.takeTurnStartLabel(message)));
  }
}

function readFinalStopReason(event: Extract<PiAgentEvent, { type: "agent_end" }> | Extract<PiAgentEvent, { type: "turn_end" }>): { stopReason: StopReason; isError: boolean; errorMessage: string | null } {
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
  return { stopReason, isError, errorMessage: lastAssistant?.errorMessage ?? null };
}

function persistableMessage(message: AgentMessage): AgentMessage {
  if (message.role !== "toolResult" || isDiffDetails(message.details)) return message;
  const { details: _stripped, ...persistable } = message;
  return persistable;
}
