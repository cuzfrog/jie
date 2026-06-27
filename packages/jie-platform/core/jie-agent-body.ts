import {
  Agent,
  type AgentMessage,
  type AgentEvent as PiAgentEvent,
} from "@earendil-works/pi-agent-core";
import type { MemoryManager } from "../storage/index.ts";
import type { AgentSoul } from "../team/index.ts";
import type { EventManager } from "../event";
import { Events, type Sender } from "../event";
import type { StreamPublisher } from "./streaming.ts";
import type { AgentBody } from "./agent-body.ts";

export class JieAgentBody implements AgentBody {
  private readonly agentKey: string;
  private readonly teamId: string;
  private readonly soul: AgentSoul;
  private readonly sessionId: string;
  private readonly eventManager: EventManager;
  private readonly memory: MemoryManager;
  private readonly agent: Agent;
  private readonly stream: StreamPublisher;
  private readonly sender: Sender;
  private readonly queue: AgentMessage[] = [];
  private readonly unsubscribers: Array<() => void> = [];
  private readonly externalCleanups: Array<() => void> = [];
  private started = false;

  constructor(deps: {
    agentKey: string;
    teamId: string;
    soul: AgentSoul;
    isLeader: boolean;
    sessionId: string;
    events: EventManager;
    memory: MemoryManager;
    agent: Agent;
    streamPublisher: StreamPublisher;
  }) {
    this.agentKey = deps.agentKey;
    this.teamId = deps.teamId;
    this.soul = deps.soul;
    this.sessionId = deps.sessionId;
    this.eventManager = deps.events;
    this.memory = deps.memory;
    this.agent = deps.agent;
    this.stream = deps.streamPublisher;
    this.sender = {
      kind: "agent",
      identity: { teamId: this.teamId, agentRole: this.soul.role, agentKey: this.agentKey },
    };
  }

  handlePiAgentEvent(event: PiAgentEvent): void {
    switch (event.type) {
      case "turn_start":
        this.eventManager.publish(Events.agentTurnStart(this.sender));
        return;
      case "agent_end":
        this.eventManager.publish(Events.agentIdle(this.sender));
        if (this.queue.length > 0) {
          const next = this.queue.shift()!;
          this.publishQueueSnapshot();
          this.agent.followUp(next);
        }
        return;
      case "message_start":
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
        this.stream.endStream();
        this.memory.persist(
          event.message as unknown as AgentMessage,
          this.agentKey,
          this.sessionId,
          this.teamId,
        );
        return;
      default:
        return;
    }
  }

  addExternalCleanup(fn: () => void): void {
    this.externalCleanups.push(fn);
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    this.registerSubscriptions();

    const restored = await this.memory.restore(
      this.agentKey,
      this.sessionId,
      this.teamId,
    );
    if (restored.length > 0) {
      this.agent.state.messages = restored;
      const last = restored[restored.length - 1]!;
      const lastRole = (last as { role: string }).role;
      if (lastRole === "user" || lastRole === "toolResult") {
        await this.agent.continue();
      }
    }

    while (this.queue.length > 0) {
      const next = this.queue.shift()!;
      this.publishQueueSnapshot();
      await this.agent.prompt(next);
    }
  }

  stop(): void {
    for (const off of this.unsubscribers) off();
    for (const off of this.externalCleanups) off();
    this.unsubscribers.length = 0;
    this.externalCleanups.length = 0;
  }

  private registerSubscriptions(): void {
    const ownPromptSubject = `team.${this.teamId}.agent.${this.agentKey}.prompt`;
    this.unsubscribers.push(
      this.eventManager.subscribe(ownPromptSubject, (env) => {
        this.ingestEvent(this.agentKey, env);
      }),
    );
    for (const topic of this.soul.subscriptions) {
      this.unsubscribers.push(
        this.eventManager.subscribe(`custom.${this.teamId}.${topic}`, (env) => {
          this.ingestEvent(topic, env);
        }),
      );
    }
  }

  private ingestEvent(topic: string, env: { payload: unknown }): void {
    const inner = unwrapIngressPayload(env.payload);
    const source = inner.source;
    const prompt = inner.prompt ?? "";
    const synthetic = source
      ? `[${source} on '${topic}']: ${prompt}`
      : `[user]: ${prompt}`;
    const message: AgentMessage = {
      role: "user",
      content: synthetic,
      timestamp: Date.now(),
    } as unknown as AgentMessage;
    if (this.agent.state.isStreaming) {
      this.queue.push(message);
      this.publishQueueSnapshot();
    } else {
      void this.agent.prompt(message);
    }
  }

  private publishQueueSnapshot(): void {
    this.eventManager.publish(Events.agentQueueUpdate(
      this.sender,
      this.queue.map((m) => formatSynthetic(m)),
    ));
  }
}

function formatSynthetic(message: AgentMessage): string {
  return String((message as { content: unknown }).content);
}

function unwrapIngressPayload(payload: unknown): { prompt?: string; source?: string } {
  if (payload === null || typeof payload !== "object") return {};
  const outer = payload as Record<string, unknown>;
  if ("payload" in outer && typeof outer.payload === "object" && outer.payload !== null) {
    const inner = outer.payload as Record<string, unknown>;
    return {
      prompt: typeof inner.prompt === "string" ? inner.prompt : undefined,
      source: typeof inner.source === "string" ? inner.source : undefined,
    };
  }
  return {
    prompt: typeof outer.prompt === "string" ? outer.prompt : undefined,
    source: typeof outer.source === "string" ? outer.source : undefined,
  };
}
