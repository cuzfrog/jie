import {
  Agent,
  type AgentMessage,
  type AgentEvent as PiAgentEvent,
} from "@earendil-works/pi-agent-core";
import type { MemoryManager } from "../storage";
import type { AgentSoul } from "../team";
import { Events, type EventManager, type Sender } from "../event";
import type { StreamPublisher } from "./streaming";
import type { AgentBody } from "./agent-body";

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
    sessionId: string;
    eventManager: EventManager;
    memory: MemoryManager;
    agent: Agent;
    streamPublisher: StreamPublisher;
  }) {
    this.agentKey = deps.agentKey;
    this.teamId = deps.teamId;
    this.soul = deps.soul;
    this.sessionId = deps.sessionId;
    this.eventManager = deps.eventManager;
    this.memory = deps.memory;
    this.agent = deps.agent;
    this.stream = deps.streamPublisher;
    this.sender = {
      kind: "agent",
      identity: { teamId: this.teamId, agentRole: this.soul.role, agentKey: this.agentKey },
    };
  }

  handlePiAgentEvent(event: PiAgentEvent): void {
    const agentSender = this.sender as Parameters<typeof Events.agentTurnStart>[0];
    switch (event.type) {
      case "turn_start":
        this.eventManager.publish(Events.agentTurnStart(agentSender));
        return;
      case "agent_end":
      case "turn_end": {
        const final = readFinalStopReason(event as unknown as Parameters<typeof readFinalStopReason>[0]);
        this.eventManager.publish(Events.agentIdle(agentSender, final.stopReason, final.isError));
        if (final.isError && final.errorMessage !== null) {
          this.eventManager.publish(Events.systemError({ kind: "system" }, final.errorMessage));
        }
        if (this.queue.length > 0) {
          const next = this.queue.shift()!;
          this.agent.followUp(next);
        }
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
        if ((event.message as { role?: string }).role === "assistant") {
          this.stream.endStream();
        }
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
        if (env.payload === null || typeof env.payload !== "object") return;
        const payload = env.payload as { teamId?: unknown; agentKey?: unknown };
        if (payload.teamId !== this.teamId || payload.agentKey !== this.agentKey) return;
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
    const innerPayload = unwrapIngressPayload(env.payload);
    const source = innerPayload.source;
    const prompt = innerPayload.prompt ?? "";
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
    } else if (!hasModel(this.agent)) {
      const text = NO_MODEL_ERROR;
      const agentSender = this.sender as Parameters<typeof Events.agentTurnStart>[0];
      this.eventManager.publish(Events.agentIdle(agentSender, "error", true));
      this.eventManager.publish(Events.systemError({ kind: "system" }, text));
    } else {
      void this.agent.prompt(message);
    }
  }
}

function hasModel(agent: Agent): boolean {
  return (agent.state as { model?: unknown }).model !== undefined && (agent.state as { model?: unknown }).model !== null;
}

function readFinalStopReason(event: { type: string; messages?: ReadonlyArray<{ stopReason?: string; errorMessage?: string }>; message?: { stopReason?: string; errorMessage?: string } }): { stopReason: string; isError: boolean; errorMessage: string | null } {
  const candidates: Array<{ stopReason?: string; errorMessage?: string }> = [];
  if (Array.isArray(event.messages)) candidates.push(...event.messages);
  if (event.message !== undefined) candidates.push(event.message);
  const last = candidates[candidates.length - 1];
  const stopReason = last?.stopReason ?? "stop";
  const isError = stopReason === "error" || stopReason === "aborted";
  return { stopReason, isError, errorMessage: last?.errorMessage ?? null };
}

const NO_MODEL_ERROR = "No model has been selected, please login and select a default model.";

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
