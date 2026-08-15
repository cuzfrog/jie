import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import { Events, type AgentSender, type EventManager } from "../event";
import type { MemoryManager } from "../memory";
import type { Compactor } from "./compaction";

export interface CompactionOutcome {
  readonly messages: ReadonlyArray<AgentMessage>;
}

export interface CompactionRunner {
  ensure(model: Model<Api>, contextWindow?: number): Promise<CompactionOutcome | null>;
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
  readonly memoryManager: MemoryManager;
  readonly getOverheadTokens: () => number;
}

export class CompactionRunnerImpl implements CompactionRunner {
  private readonly compactor: Compactor;
  private readonly eventManager: EventManager;
  private readonly sender: AgentSender;
  private readonly agentKey: string;
  private readonly sessionId: string;
  private readonly teamId: string;
  private readonly conversation: CompactionConversation;
  private readonly memoryManager: MemoryManager;
  private readonly getOverheadTokens: () => number;
  private readonly distillationController = new AbortController();
  private distillationPromise: Promise<void> | null = null;
  private promise: Promise<CompactionOutcome | null> | null = null;
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
    this.memoryManager = deps.memoryManager;
    this.getOverheadTokens = deps.getOverheadTokens;
  }

  ensure(model: Model<Api>, contextWindow?: number): Promise<CompactionOutcome | null> {
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
    this.distillationController.abort();
  }

  private async run(model: Model<Api>, contextWindow?: number): Promise<CompactionOutcome | null> {
    const window = contextWindow ?? model.contextWindow;
    const messages = this.conversation.getMessages();
    const overheadTokens = this.getOverheadTokens();
    if (!this.compactor.needsCompaction(messages, window, overheadTokens)) return null;
    const controller = new AbortController();
    this.controller = controller;
    this.eventManager.publish(Events.agentCompactionStart(this.sender));
    try {
      const result = await this.compactor.compact({
        messages,
        contextWindow: window,
        model,
        agentKey: this.agentKey,
        sessionId: this.sessionId,
        teamId: this.teamId,
        signal: controller.signal,
        overheadTokens,
      });
      if (result === null || this.aborted) return null;
      const currentMessages = this.conversation.getMessages();
      const summarizedMessages = currentMessages.slice(0, result.firstKeptIndex);
      const compacted = [result.summaryMessage, ...currentMessages.slice(result.firstKeptIndex)];
      this.conversation.setMessages(compacted);
      const summarizedPrompts = summarizedMessages.reduce((count, message) => message.role === "user" ? count + 1 : count, 0);
      const tokensAfter = this.compactor.contextTokens(compacted, overheadTokens);
      this.eventManager.publish(Events.agentCompacted(this.sender, result.summaryMessage.summary, result.tokensBefore, tokensAfter, summarizedPrompts));
      if (this.distillationPromise === null) {
        this.distillationPromise = this.memoryManager.distill({
          messages: result.summarizedPrefix,
          teamId: this.teamId,
          sessionId: this.sessionId,
          model,
          signal: this.distillationController.signal,
        }).finally(() => {
          this.distillationPromise = null;
        });
      }
      return { messages: compacted };
    } catch (error) {
      if (!controller.signal.aborted) {
        const message = error instanceof Error ? error.message : String(error);
        this.eventManager.publish(Events.systemError({ kind: "system" }, `compaction failed: ${message}`));
      }
      return null;
    } finally {
      this.eventManager.publish(Events.agentCompactionEnd(this.sender));
      if (this.controller === controller) this.controller = null;
    }
  }
}
