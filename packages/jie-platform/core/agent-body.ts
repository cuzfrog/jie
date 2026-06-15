import {
  Agent,
  type AgentMessage,
  type AgentTool,
  type AgentEvent as PiAgentEvent,
} from "@earendil-works/pi-agent-core";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ArtifactStore } from "../storage/artifact-store.ts";
import type { EventBus } from "./event-bus.ts";
import type { MemoryManager } from "../storage/memory-store.ts";
import type { AgentSoul } from "../team/types.ts";
import type { Tool } from "../tools/types.ts";
import type { ToolRegistry } from "../tools/tool-registry.ts";
import type { ExecutionContext } from "../tools/types.ts";
import { adaptToolToAgent } from "./tool-adapter.ts";
import {
  makeStreamPublisher,
  publishPlatformEvent,
  publishToolCallEvent,
  publishToolResultEvent,
  type BlockType,
} from "./streaming.ts";

export interface AgentBodyOptions {
  agent_key: string;
  team_id: string;
  soul: AgentSoul;
  is_leader: boolean;
  bus: EventBus;
  artifacts: ArtifactStore;
  memory: MemoryManager;
  session_id: string;
  tool_registry: ToolRegistry;
  getApiKey: (provider: string) => Promise<string | undefined> | string | undefined;
  model: unknown;
  createAgent?: (opts: ConstructorParameters<typeof Agent>[0]) => Agent;
}

type AgentFactory = (opts: ConstructorParameters<typeof Agent>[0]) => Agent;

function defaultAgentFactory(opts: ConstructorParameters<typeof Agent>[0]): Agent {
  return new Agent(opts);
}

interface AgentEventEnvelope {
  version: 1;
  team_id: string;
  event_type: string;
  agent_role: string;
  agent_key: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

function asEnvelope(payload: object): AgentEventEnvelope {
  return payload as AgentEventEnvelope;
}

function isAssistantMessage(m: unknown): m is AssistantMessage {
  return (
    typeof m === "object" &&
    m !== null &&
    (m as { role?: string }).role === "assistant"
  );
}

export class AgentBody {
  readonly agent_key: string;
  readonly team_id: string;
  readonly soul: AgentSoul;
  readonly is_leader: boolean;
  readonly session_id: string;
  private readonly bus: EventBus;
  private readonly artifacts: ArtifactStore;
  private readonly memory: MemoryManager;
  private readonly tool_registry: ToolRegistry;
  private readonly getApiKey: AgentBodyOptions["getApiKey"];
  private readonly createAgent: AgentFactory;
  private agent: Agent;
  private readonly queue: AgentMessage[] = [];
  private readonly unsubscribers: Array<() => void> = [];
  private started = false;
  private readonly toolTimestamps = new Map<string, number>();
  private stream: ReturnType<typeof makeStreamPublisher>;

  constructor(opts: AgentBodyOptions) {
    this.agent_key = opts.agent_key;
    this.team_id = opts.team_id;
    this.soul = opts.soul;
    this.is_leader = opts.is_leader;
    this.bus = opts.bus;
    this.artifacts = opts.artifacts;
    this.memory = opts.memory;
    this.session_id = opts.session_id;
    this.tool_registry = opts.tool_registry;
    this.getApiKey = opts.getApiKey;
    this.createAgent = opts.createAgent ?? defaultAgentFactory;
    this.stream = makeStreamPublisher(
      this.bus,
      this.agent_key,
      this.soul.role,
      this.team_id,
    );

    const ctx: ExecutionContext = {
      session_id: this.session_id,
      team_id: this.team_id,
      agent_key: this.agent_key,
      agent_role: this.soul.role,
      artifacts: this.artifacts,
    };
    const adapted = this.adaptTools(ctx);
    this.agent = this.createAgent({
      sessionId: this.session_id,
      getApiKey: this.getApiKey,
      transformContext: this.wrapTransformContext(),
      convertToLlm: undefined,
      steeringMode: "all",
      followUpMode: "all",
      toolExecution: "sequential",
      beforeToolCall: async (context) => {
        const toolCallId = context.toolCall.id;
        this.toolTimestamps.set(toolCallId, Date.now());
        publishToolCallEvent(
          this.bus,
          this.agent_key,
          this.soul.role,
          this.team_id,
          toolCallId,
          context.toolCall.name,
          context.args,
        );
        return undefined;
      },
      afterToolCall: async (context) => {
        const toolCallId = context.toolCall.id;
        const startedAt = this.toolTimestamps.get(toolCallId) ?? Date.now();
        const durationMs = Date.now() - startedAt;
        this.toolTimestamps.delete(toolCallId);
        const error =
          context.isError && context.result !== undefined
            ? (context.result as { content?: Array<{ text?: string }> }).content
                ?.map((c) => c.text)
                .filter((t): t is string => typeof t === "string")
                .join("\n") ?? "tool error"
            : context.isError
              ? "tool error"
              : null;
        const outputPayload = error === null ? context.result : null;
        publishToolResultEvent(
          this.bus,
          this.agent_key,
          this.soul.role,
          this.team_id,
          toolCallId,
          context.toolCall.name,
          outputPayload,
          durationMs,
          error,
        );
        return undefined;
      },
    });
    this.agent.state.systemPrompt = this.soul.system_prompt;
    this.agent.state.model = opts.model as never;
    this.agent.state.tools = adapted;

    this.unsubscribers.push(
      this.agent.subscribe((event) => {
        this.handlePiAgentEvent(event);
      }),
    );
  }

  private adaptTools(ctx: ExecutionContext): AgentTool[] {
    const out: AgentTool[] = [];
    for (const spec of this.soul.tools) {
      const tools = this.tool_registry.resolve(spec);
      for (const tool of tools) {
        out.push(adaptToolToAgent(tool, ctx));
      }
    }
    return out;
  }

  private wrapTransformContext(): (
    messages: AgentMessage[],
    signal?: AbortSignal,
  ) => Promise<AgentMessage[]> {
    return async (messages) => messages;
  }

  private handlePiAgentEvent(event: PiAgentEvent): void {
    switch (event.type) {
      case "turn_start":
        publishPlatformEvent(
          this.bus,
          "agent.turn.start",
          this.agent_key,
          this.soul.role,
          this.team_id,
          {},
        );
        return;
      case "agent_end":
        publishPlatformEvent(
          this.bus,
          "agent.idle",
          this.agent_key,
          this.soul.role,
          this.team_id,
          {},
        );
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

  private registerSubscriptions(): void {
    const own = `${this.team_id}.${this.agent_key}`;
    this.unsubscribers.push(
      this.bus.subscribe(own, (_subject, payload) => {
        const envelope = asEnvelope(payload);
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
    const envelope = payload as { payload?: { prompt?: string; source?: string } };
    const inner = envelope?.payload ?? {};
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
      publishPlatformEvent(
        this.bus,
        "agent.queue.update",
        this.agent_key,
        this.soul.role,
        this.team_id,
        { prompts: this.queue.map((m) => this.formatSynthetic(m)) },
      );
    } else {
      void this.agent.prompt(message);
    }
  }

  private formatSynthetic(message: AgentMessage): string {
    return String((message as { content: unknown }).content);
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
      publishPlatformEvent(
        this.bus,
        "agent.queue.update",
        this.agent_key,
        this.soul.role,
        this.team_id,
        { prompts: this.queue.map((m) => this.formatSynthetic(m)) },
      );
      await this.agent.prompt(next);
    }
  }

  stop(): void {
    for (const off of this.unsubscribers) off();
    this.unsubscribers.length = 0;
  }

  peekQueue(): AgentMessage[] {
    return [...this.queue];
  }
}

export type { Tool };
export { type BlockType };
