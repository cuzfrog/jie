import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { Events, type AgentSender, type EventManager } from "../event";
import type { UserIngressMessage } from "../types";

const DEQUEUED_PROMPT_CAP = 32;

export interface PromptDispatcher {
  prompt(message: AgentMessage): void;
  followUp(message: AgentMessage): void;
  isStreaming(): boolean;
}

export interface PromptQueue {
  ingestUserPrompt(prompt: string, userText: string): void;
  ingestPeerNotification(topic: string, source: string, prompt: string): void;
  consumeResubmitted(prompt: string): void;
  dequeue(prompt: string): void;
  requeue(prompt: string): void;
  dispatchNext(): Promise<void>;
  settle(): Promise<void>;
  drainForFollowUp(isError: boolean): void;
  publishQueueUpdate(): void;
  isEmpty(): boolean;
  stop(): void;
}

interface PromptQueueDeps {
  readonly dispatcher: PromptDispatcher;
  readonly eventManager: EventManager;
  readonly sender: AgentSender;
  readonly beforeDispatch: () => Promise<void>;
}

interface QueuedPrompt {
  readonly message: AgentMessage;
  readonly userText: string | null;
}

export class PromptQueueImpl implements PromptQueue {
  private readonly dispatcher: PromptDispatcher;
  private readonly eventManager: EventManager;
  private readonly sender: AgentSender;
  private readonly beforeDispatch: () => Promise<void>;
  private dispatching = false;
  private stopped = false;
  private readonly queue: QueuedPrompt[] = [];
  private readonly dequeuedPrompts: QueuedPrompt[] = [];

  constructor(deps: PromptQueueDeps) {
    this.dispatcher = deps.dispatcher;
    this.eventManager = deps.eventManager;
    this.sender = deps.sender;
    this.beforeDispatch = deps.beforeDispatch;
  }

  ingestUserPrompt(prompt: string, userText: string): void {
    const message: UserIngressMessage = { role: "user", content: prompt, timestamp: Date.now(), displayText: userText };
    this.ingest(message, userText);
  }

  ingestPeerNotification(topic: string, source: string, prompt: string): void {
    const message: UserIngressMessage = { role: "user", content: `[${source} on '${topic}']: ${prompt}`, timestamp: Date.now() };
    this.ingest(message, null);
  }

  consumeResubmitted(prompt: string): void {
    const consumed = this.dequeuedPrompts.findIndex((entry) => entry.userText === prompt);
    if (consumed !== -1) this.dequeuedPrompts.splice(consumed, 1);
  }

  dequeue(prompt: string): void {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.queue[i]!.userText === prompt) {
        const removed = this.queue.splice(i, 1)[0];
        if (removed !== undefined) {
          this.dequeuedPrompts.push(removed);
          if (this.dequeuedPrompts.length > DEQUEUED_PROMPT_CAP) this.dequeuedPrompts.shift();
        }
        break;
      }
    }
    this.publishQueueUpdate();
  }

  requeue(prompt: string): void {
    for (let i = this.dequeuedPrompts.length - 1; i >= 0; i--) {
      if (this.dequeuedPrompts[i]!.userText === prompt) {
        const restored = this.dequeuedPrompts.splice(i, 1)[0];
        if (restored !== undefined) this.queue.push(restored);
        break;
      }
    }
    this.publishQueueUpdate();
    void this.dispatchNext();
  }

  async dispatchNext(): Promise<void> {
    if (this.dispatching || this.stopped || this.dispatcher.isStreaming() || this.queue.length === 0) return;
    this.dispatching = true;
    try {
      await this.beforeDispatch();
    } finally {
      this.dispatching = false;
    }
    this.dispatchHead();
  }

  async settle(): Promise<void> {
    await this.beforeDispatch();
    this.dispatchHead();
  }

  drainForFollowUp(isError: boolean): void {
    if (!isError && this.queue.length > 0) {
      const next = this.queue.shift()!;
      this.dispatcher.followUp(next.message);
    }
    this.publishQueueUpdate();
  }

  publishQueueUpdate(): void {
    const prompts = this.queue.map((entry) => entry.userText !== null
      ? { text: entry.userText, source: "user" as const }
      : { text: userPromptText(entry.message), source: "peer" as const });
    this.eventManager.publish(Events.agentPromptQueueUpdate(this.sender, prompts));
  }

  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  stop(): void {
    this.stopped = true;
  }

  private ingest(message: UserIngressMessage, userText: string | null): void {
    this.queue.push({ message, userText });
    this.publishQueueUpdate();
    void this.dispatchNext();
  }

  private dispatchHead(): void {
    if (this.dispatching || this.stopped || this.dispatcher.isStreaming() || this.queue.length === 0) return;
    const next = this.queue.shift()!;
    this.publishQueueUpdate();
    this.dispatcher.prompt(next.message);
  }
}

function userPromptText(message: AgentMessage): string {
  if (message.role !== "user") return "";
  const content = message.content;
  if (typeof content === "string") return content;
  return content
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}
