import {
  Agent,
  type AgentMessage,
  type AgentEvent as PiAgentEvent,
} from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { MemoryManager } from "../storage/index.ts";
import type { EventBus } from "./event-bus.ts";
import type { AgentSoul } from "../team/index.ts";
import type { AgentEventPublisher } from "./agent-event.ts";
import type { StreamPublisher } from "./streaming.ts";
import type { AgentBody } from "./agent-body.ts";
import type { AgentEvent } from "./agent-event.ts";

export class JieAgentBody implements AgentBody {
  private readonly agent_key: string;
  private readonly team_id: string;
  private readonly soul: AgentSoul;
  private readonly is_leader: boolean;
  private readonly session_id: string;
  private readonly bus: EventBus;
  private readonly memory: MemoryManager;
  private readonly agent: Agent;
  private readonly stream: StreamPublisher;
  private readonly publisher: AgentEventPublisher;
  private readonly queue: AgentMessage[] = [];
  private readonly unsubscribers: Array<() => void> = [];
  private readonly externalCleanups: Array<() => void> = [];
  private started = false;

  constructor(deps: {
    agent_key: string;
    team_id: string;
    soul: AgentSoul;
    is_leader: boolean;
    session_id: string;
    bus: EventBus;
    memory: MemoryManager;
    agent: Agent;
    streamPublisher: StreamPublisher;
    eventPublisher: AgentEventPublisher;
  }) {
    this.agent_key = deps.agent_key;
    this.team_id = deps.team_id;
    this.soul = deps.soul;
    this.is_leader = deps.is_leader;
    this.session_id = deps.session_id;
    this.bus = deps.bus;
    this.memory = deps.memory;
    this.agent = deps.agent;
    this.stream = deps.streamPublisher;
    this.publisher = deps.eventPublisher;
  }

  handlePiAgentEvent(event: PiAgentEvent): void {
    switch (event.type) {
      case "turn_start":
        this.publisher.publish("agent.turn.start", {});
        return;
      case "agent_end":
        this.publisher.publish("agent.idle", {});
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
        if (isAssistantMessage(event.message) || event.message.role === "user" || event.message.role === "toolResult") {
          this.memory.persist(
            event.message as unknown as AgentMessage,
            this.agent_key,
            this.session_id,
            this.team_id,
          );
        }
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
      this.agent_key,
      this.session_id,
      this.team_id,
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
      this.publisher.publish("agent.queue.update", {
        prompts: this.queue.map((m) => formatSynthetic(m)),
      });
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
    const own = `${this.team_id}.${this.agent_key}`;
    this.unsubscribers.push(
      this.bus.subscribe(own, (_subject, payload) => {
        const envelope = payload as AgentEvent;
        this.ingestEvent(envelope.event_type, payload);
      }),
    );
    if (this.is_leader) {
      this.unsubscribers.push(
        this.bus.subscribe(`${this.team_id}.leader.prompt`, (_subject, payload) => {
          this.ingestEvent("leader.prompt", payload);
        }),
      );
    }
    for (const topic of this.soul.subscriptions) {
      this.unsubscribers.push(
        this.bus.subscribe(`${this.team_id}.${topic}`, (_subject, payload) => {
          this.ingestEvent(topic, payload);
        }),
      );
    }
  }

  private ingestEvent(topic: string, payload: object): void {
    const envelope = payload as AgentEvent;
    const inner = envelope.payload;
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
      this.publisher.publish("agent.queue.update", {
        prompts: this.queue.map((m) => formatSynthetic(m)),
      });
    } else {
      void this.agent.prompt(message);
    }
  }
}

function formatSynthetic(message: AgentMessage): string {
  return String((message as { content: unknown }).content);
}

function isAssistantMessage(m: unknown): m is AssistantMessage {
  return (
    typeof m === "object" &&
    m !== null &&
    (m as { role?: string }).role === "assistant"
  );
}
