import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import { Events, type AgentSender, type EventManager } from "../event";
import type { MemoryExtractor } from "../memory";
import type { Compactor } from "./compaction";

export interface CompactionRunner {
  ensure(model: Model<Api>, contextWindow?: number): Promise<void>;
  abort(): void;
}

interface CompactionConversation {
  getMessages(): ReadonlyArray<AgentMessage>;
  setMessages(messages: ReadonlyArray<AgentMessage>): void;
}

interface CompactionRunnerDeps {
  readonly compactor: Compactor;
  readonly eventManager: EventManager;
  readonly sender: AgentSender;
  readonly agentKey: string;
  readonly sessionId: string;
  readonly teamId: string;
  readonly conversation: CompactionConversation;
  readonly memoryExtractor: MemoryExtractor;
}

export class CompactionRunnerImpl implements CompactionRunner {
  private readonly compactor: Compactor;
  private readonly eventManager: EventManager;
  private readonly sender: AgentSender;
  private readonly agentKey: string;
  private readonly sessionId: string;
  private readonly teamId: string;
  private readonly conversation: CompactionConversation;
  private readonly memoryExtractor: MemoryExtractor;
  private readonly extractionController = new AbortController();
  private extractionPromise: Promise<void> | null = null;
  private promise: Promise<void> | null = null;
  private controller: AbortController | null = null;
  private aborted = false;

  constructor(deps: CompactionRunnerDeps) {
    this.compactor = deps.compactor;
    this.eventManager = deps.eventManager;
    this.sender = deps.sender;
    this.agentKey = deps.agentKey;
    this.sessionId = deps.sessionId;
    this.teamId = deps.teamId;
    this.conversation = deps.conversation;
    this.memoryExtractor = deps.memoryExtractor;
  }

  ensure(model: Model<Api>, contextWindow?: number): Promise<void> {
    if (this.promise === null) {
      this.promise = this.run(model, contextWindow).finally(() => {
        this.promise = null;
      });
    }
    return this.promise;
  }

  abort(): void {
    this.aborted = true;
    this.controller?.abort();
    this.extractionController.abort();
  }

  private async run(model: Model<Api>, contextWindow?: number): Promise<void> {
    const controller = new AbortController();
    this.controller = controller;
    this.eventManager.publish(Events.agentCompactionStart(this.sender));
    try {
      const result = await this.compactor.compact({
        messages: this.conversation.getMessages(),
        contextWindow: contextWindow ?? model.contextWindow,
        model,
        agentKey: this.agentKey,
        sessionId: this.sessionId,
        teamId: this.teamId,
        signal: controller.signal,
      });
      if (result === null || this.aborted) return;
      const messages = this.conversation.getMessages();
      const summarizedMessages = messages.slice(0, result.firstKeptIndex);
      this.conversation.setMessages([result.summaryMessage, ...messages.slice(result.firstKeptIndex)]);
      const summarizedPrompts = summarizedMessages.reduce((count, message) => message.role === "user" ? count + 1 : count, 0);
      this.eventManager.publish(Events.agentCompacted(this.sender, result.summaryMessage.summary, result.tokensBefore, summarizedPrompts));
      if (this.extractionPromise === null) {
        this.extractionPromise = this.memoryExtractor.extract({
          messages: result.summarizedPrefix,
          teamId: this.teamId,
          sessionId: this.sessionId,
          model,
          signal: this.extractionController.signal,
        }).finally(() => {
          this.extractionPromise = null;
        });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = error instanceof Error ? error.message : String(error);
        this.eventManager.publish(Events.systemError({ kind: "system" }, `compaction failed: ${message}`));
      }
    } finally {
      this.eventManager.publish(Events.agentCompactionEnd(this.sender));
      if (this.controller === controller) this.controller = null;
    }
  }
}
