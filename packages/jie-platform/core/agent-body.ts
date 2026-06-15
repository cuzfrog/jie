import {
  Agent,
  type AgentMessage,
  type AgentTool,
} from "@earendil-works/pi-agent-core";
import type { ArtifactStore } from "../storage/artifact-store.ts";
import type { EventBus } from "./event-bus.ts";
import type { MemoryManager } from "../storage/memory-store.ts";
import type { AgentSoul } from "../team/types.ts";
import type { Tool } from "../tools/types.ts";
import type { ToolRegistry } from "../tools/tool-registry.ts";
import type { ExecutionContext } from "../tools/types.ts";
import { adaptToolToAgent } from "./tool-adapter.ts";

export interface AgentBodyOptions {
  agent_key: string;
  team_id: string;
  soul: AgentSoul;
  is_leader: boolean;
  bus: EventBus;
  artifacts: ArtifactStore;
  memory: MemoryManager;
  session_id: string;
  /** Tool registry for resolving `soul.tools` (spec strings) to
   *  `Tool` instances. */
  tool_registry: ToolRegistry;
  /** Provider for the API key. In v1 this is supplied by startJie
   *  from the resolved `auth.json`. */
  getApiKey: (provider: string) => Promise<string | undefined> | string | undefined;
  /** A Model object (pi-ai). In production this comes from
   *  `pi-ai.getModel(provider, modelId)`; tests can pass any object
   *  that satisfies the public shape used by pi-agent. */
  model: Parameters<Agent["subscribe"]>[0] extends never ? never : unknown;
  /** Optional factory for the pi-agent `Agent` instance. Defaults
   *  to `new Agent(opts)`. Tests inject a fake factory. */
  createAgent?: (opts: ConstructorParameters<typeof Agent>[0]) => Agent;
}

type AgentFactory = (opts: ConstructorParameters<typeof Agent>[0]) => Agent;

function defaultAgentFactory(opts: ConstructorParameters<typeof Agent>[0]): Agent {
  return new Agent(opts);
}

export class AgentBody {
  readonly agent_key: string;
  readonly team_id: string;
  readonly soul: AgentSoul;
  readonly is_leader: boolean;
  private readonly bus: EventBus;
  private readonly artifacts: ArtifactStore;
  private readonly memory: MemoryManager;
  private readonly session_id: string;
  private readonly tool_registry: ToolRegistry;
  private readonly getApiKey: AgentBodyOptions["getApiKey"];
  private readonly createAgent: AgentFactory;
  private agent: Agent;
  private readonly queue: AgentMessage[] = [];
  private readonly unsubscribers: Array<() => void> = [];
  private started = false;

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
    });
    this.agent.state.systemPrompt = this.soul.system_prompt;
    this.agent.state.model = opts.model as never;
    this.agent.state.tools = adapted;
  }

  /**
   * Resolve `soul.tools` against the registry, adapt each into
   * pi-agent's `AgentTool` shape, and return the array for
   * `agent.state.tools`.
   */
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

  /**
   * The `transformContext` wrapper: in v1 the inner is identity (no
   * compaction enabled), so the wrapper is a no-op pass-through. The
   * shape is kept in place for Day 2+ when the inner may produce
   * `CompactionSummaryMessage` entries; the wrapper would diff and
   * call `memory.compact` for each new entry.
   */
  private wrapTransformContext(): (
    messages: AgentMessage[],
    signal?: AbortSignal,
  ) => Promise<AgentMessage[]> {
    return async (messages) => messages;
  }

  /**
   * Subscribe to the body's required bus subjects.
   *  - `{team_id}.{agent_key}` — every body
   *  - `{team_id}.leader.prompt` — leaders only
   *  - `{team_id}.<topic>` — for each entry in `soul.subscriptions`
   */
  private registerSubscriptions(): void {
    const own = `${this.team_id}.${this.agent_key}`;
    this.unsubscribers.push(
      this.bus.subscribe(own, (_subject, payload) => {
        const eventType = (payload as { event_type?: string }).event_type
          ?? this.agent_key;
        this.ingestEvent(eventType, payload);
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

  /**
   * Build a synthetic `user` message from an inbound event envelope
   * and enqueue it (or call `agent.prompt` if idle).
   */
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
    } else {
      void this.agent.prompt(message);
    }
  }

  /**
   * The four-step `start()`:
   *   (1) register bus subscriptions
   *   (2) memory.restore() and push to agent.state.messages
   *   (3) if last message is `user` or `toolResult`, call agent.continue()
   *   (4) drain any prompts enqueued during (1)-(3)
   */
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
      await this.agent.prompt(next);
    }
  }

  /** Detach all bus subscriptions. Idempotent. */
  stop(): void {
    for (const off of this.unsubscribers) off();
    this.unsubscribers.length = 0;
  }

  /** Currently enqueued prompts (synthetic-user form), for tests. */
  peekQueue(): AgentMessage[] {
    return [...this.queue];
  }
}

export type { Tool };
