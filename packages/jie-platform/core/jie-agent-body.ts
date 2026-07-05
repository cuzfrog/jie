import {
  Agent,
  type AgentMessage,
  type AgentEvent as PiAgentEvent,
} from "@earendil-works/pi-agent-core";
import type { AssistantMessage, UserMessage } from "@earendil-works/pi-ai";
import type { StopReason } from "@earendil-works/pi-ai";
import type { MemoryManager } from "../storage";
import type { AgentSoul } from "../team";
import { Events, type AgentSender, type EventManager } from "../event";
import type { StreamPublisher } from "./streaming";
import type { AgentBody } from "./agent-body";
import type { AgentIdentity } from "../types";

export class JieAgentBody implements AgentBody {
  readonly identity: AgentIdentity;
  private readonly agentKey: string;
  private readonly teamId: string;
  private readonly soul: AgentSoul;
  private readonly sessionId: string;
  private readonly eventManager: EventManager;
  private readonly memory: MemoryManager;
  private readonly agent: Agent;
  private readonly stream: StreamPublisher;
  private readonly sender: AgentSender;
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
    eventManager: EventManager;
    memory: MemoryManager;
    agent: Agent;
    streamPublisher: StreamPublisher;
  }) {
    this.identity = {
      teamId: deps.teamId,
      role: deps.soul.role,
      agentKey: deps.agentKey,
      isLeader: deps.isLeader,
    };
    this.agentKey = deps.agentKey;
    this.teamId = deps.teamId;
    this.soul = deps.soul;
    this.sessionId = deps.sessionId;
    this.eventManager = deps.eventManager;
    this.memory = deps.memory;
    this.agent = deps.agent;
    this.stream = deps.streamPublisher;
    this.sender = { kind: "agent", teamId: this.teamId, agentKey: this.agentKey };
  }

  handlePiAgentEvent(event: PiAgentEvent): void {
    const agentSender = this.sender;
    switch (event.type) {
      case "turn_start":
        this.eventManager.publish(Events.agentTurnStart(agentSender));
        return;
      case "turn_end": {
        if (this.queue.length > 0) {
          const next = this.queue.shift()!;
          this.agent.followUp(next);
        }
        this.eventManager.publish(Events.agentPromptQueueUpdate(agentSender, this.queue.map(userPromptText)));
        return;
      }
      case "agent_end": {
        const final = readFinalStopReason(event);
        this.eventManager.publish(Events.agentIdle(agentSender, final.stopReason));
        if (final.isError && final.errorMessage !== null) {
          this.eventManager.publish(Events.systemError({ kind: "system" }, final.errorMessage));
        }
        if (this.queue.length > 0) {
          const next = this.queue.shift()!;
          this.agent.followUp(next);
        }
        this.eventManager.publish(Events.agentPromptQueueUpdate(agentSender, this.queue.map(userPromptText)));
        return;
      }
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
        if (event.message.role === "assistant") {
          this.stream.endStream();
        }
        this.memory.persist(
          event.message,
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
      const lastRole = last.role;
      if (lastRole === "user" || lastRole === "toolResult") {
        await this.agent.continue();
      }
    }

    while (this.queue.length > 0) {
      const next = this.queue.shift()!;
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
    this.unsubscribers.push(
      this.eventManager.subscribe("user.prompt", (env) => {
        if (env.payload.teamId !== this.teamId || env.payload.agentKey !== this.agentKey) return;
        this.ingestUserPrompt(env.payload);
      }),
    );
    for (const topic of this.soul.subscribe) {
      this.unsubscribers.push(
        this.eventManager.subscribe(`custom.${this.teamId}.${topic}`, (env) => {
          this.ingestCustom(topic, env.sender, env.payload);
        }),
      );
    }
  }

  private ingestUserPrompt(payload: { teamId: string; agentKey: string; prompt: string }): void {
    this.dispatchIngress("user", null, payload.prompt);
  }

  private ingestCustom(topic: string, sender: AgentSender, payload: { message: string; truncated: boolean }): void {
    if (sender.agentKey === this.agentKey) return;
    this.dispatchIngress(topic, sender.agentKey, payload.message);
  }

  private dispatchIngress(topic: string, source: string | null, prompt: string): void {
    const synthetic = source !== null
      ? `[${source} on '${topic}']: ${prompt}`
      : `[user]: ${prompt}`;
    const message: UserMessage = {
      role: "user",
      content: synthetic,
      timestamp: Date.now(),
    };
    if (this.agent.state.isStreaming) {
      this.queue.push(message);
      this.eventManager.publish(Events.agentPromptQueueUpdate(this.sender, this.queue.map(userPromptText)));
    } else {
      void this.agent.prompt(message);
    }
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
