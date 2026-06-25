import { afterEach, describe, expect, mock, test } from "bun:test";
import type { AgentEvent as PiAgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, AssistantMessageEvent } from "@earendil-works/pi-ai";
import { createAgentBody, type AgentBody, type CreateAgentBodyOptions } from "./agent-body.ts";
import { createEventBus, type EventBus } from "../event/event-bus.ts";
import { createEventManager } from "./event-manager.ts";

import {
  createArtifactStore,
  createMemoryManager,
  createStorage,
  type ArtifactStore,
  type MemoryManager,
} from "../storage";
import { createToolRegistry, type Tool, type ToolResult } from "../tools";
import type { AgentSoul } from "../team";
import { Type } from "typebox";

function makeSoul(): AgentSoul {
  return {
    role: "general",
    model: "anthropic/claude-sonnet-4",
    systemPrompt: "you are a general assistant",
    tools: ["noop"],
    subscribe: [],
    subscriptions: [],
  };
}

interface FakeAgent {
  subscribe: ReturnType<typeof mock>;
  state: {
    systemPrompt: string;
    model: unknown;
    tools: unknown[];
    messages: AgentMessage[];
    isStreaming: boolean;
  };
  continue: ReturnType<typeof mock>;
  prompt: ReturnType<typeof mock>;
}

function makeFakeAgentFactory(options: {
  beforeToolCall?: (ctx: unknown) => Promise<unknown>;
  afterToolCall?: (ctx: unknown) => Promise<unknown>;
  onEvent?: (listener: (event: PiAgentEvent) => void) => void;
} = {}): {
  factory: (opts: ConstructorParameters<typeof import("@earendil-works/pi-agent-core").Agent>[0]) => import("@earendil-works/pi-agent-core").Agent;
  fake: FakeAgent;
  lastOpts: () => ConstructorParameters<typeof import("@earendil-works/pi-agent-core").Agent>[0] | undefined;
} {
  const fake: FakeAgent = {
    subscribe: mock((listener: (event: PiAgentEvent) => void) => {
      if (options.onEvent) {
        options.onEvent(listener);
      }
      return () => {};
    }),
    state: {
      systemPrompt: "",
      model: null,
      tools: [],
      messages: [],
      isStreaming: false,
    },
    continue: mock(async () => {}),
    prompt: mock(async () => {}),
  };
  const stub = {
    state: fake.state,
    subscribe: fake.subscribe,
    continue: fake.continue,
    prompt: fake.prompt,
  } as unknown as import("@earendil-works/pi-agent-core").Agent;
  let captured: ConstructorParameters<typeof import("@earendil-works/pi-agent-core").Agent>[0] | undefined;
  return {
    factory: (opts) => {
      captured = opts;
      return stub;
    },
    fake,
    lastOpts: () => captured,
  };
}

function makeNoopTool(): Tool {
  return {
    name: "noop",
    description: "no-op",
    label: "Noop",
    parameters: Type.Object({}),
    async execute(): Promise<ToolResult> {
      return { content: "noop" };
    },
  };
}

function makeMemory(): MemoryManager {
  const storage = createStorage({ type: "sqlite", filePath: ":memory:" });
  return createMemoryManager(storage);
}

function makeArtifacts(): ArtifactStore {
  const storage = createStorage({ type: "sqlite", filePath: ":memory:" });
  return createArtifactStore(storage);
}

function makeOpts(overrides: Partial<CreateAgentBodyOptions> = {}): { opts: CreateAgentBodyOptions; bus: ReturnType<typeof createEventBus> } {
  const bus = createEventBus();
  const registry = createToolRegistry();
  registry.register("noop", makeNoopTool());
  const opts: CreateAgentBodyOptions = {
    agentKey: "general-1",
    teamId: "t1",
    soul: makeSoul(),
    isLeader: true,
    events: createEventManager(bus),
    artifactStore: makeArtifacts(),
    memory: makeMemory(),
    sessionId: "s1",
    toolRegistry: registry,
    getApiKey: () => undefined,
    model: {},
    ...overrides,
  };
  return { opts, bus };
}

describe("AgentBody — pi-agent event bridging", () => {
  let body: AgentBody | undefined;
  let fireEvent: ((e: PiAgentEvent) => void) | undefined;

  afterEach(() => {
    body?.stop();
    body = undefined;
  });

  function capturedEvents(topic: string, bus: EventBus): object[] {
    const out: object[] = [];
    bus.subscribe(topic, (_s, p) => {
      out.push(p);
    });
    return out;
  }

  test("turn_start publishes agent.turn.start with empty payload", () => {
    const { opts, bus } = makeOpts();
    const turnStart = capturedEvents("agent.turn.start", bus);
    const result = makeFakeAgentFactory({
      onEvent: (l) => {
        fireEvent = l;
      },
    });
    body = createAgentBody({ ...opts, createAgent: result.factory });
    fireEvent!({ type: "turn_start" });
    expect(turnStart).toHaveLength(1);
    const env = turnStart[0] as { type: string; payload: object };
    expect(env.type).toBe("agent.turn.start");
    expect(env.payload).toBeNull();
  });

  test("agent_end publishes agent.idle with empty payload", () => {
    const { opts, bus } = makeOpts();
    const idle = capturedEvents("agent.idle", bus);
    const result = makeFakeAgentFactory({
      onEvent: (l) => {
        fireEvent = l;
      },
    });
    body = createAgentBody({ ...opts, createAgent: result.factory });
    fireEvent!({ type: "agent_end", messages: [] });
    expect(idle).toHaveLength(1);
    const env = idle[0] as { type: string; payload: object };
    expect(env.type).toBe("agent.idle");
    expect(env.payload).toBeNull();
  });

  test("body-side alternation: turn_start always precedes agent.idle", () => {
    const { opts, bus } = makeOpts();
    const events: string[] = [];
    bus.subscribe("agent.turn.start", () => events.push("turn_start"));
    bus.subscribe("agent.idle", () => events.push("idle"));
    const result = makeFakeAgentFactory({
      onEvent: (l) => {
        fireEvent = l;
      },
    });
    body = createAgentBody({ ...opts, createAgent: result.factory });
    fireEvent!({ type: "turn_start" });
    fireEvent!({ type: "agent_end", messages: [] });
    expect(events).toEqual(["turn_start", "idle"]);
  });

  test("3 turns alternate strictly: turn_start, idle, turn_start, idle, ...", () => {
    const { opts, bus } = makeOpts();
    const events: string[] = [];
    bus.subscribe("agent.turn.start", () => events.push("turn_start"));
    bus.subscribe("agent.idle", () => events.push("idle"));
    const result = makeFakeAgentFactory({
      onEvent: (l) => {
        fireEvent = l;
      },
    });
    body = createAgentBody({ ...opts, createAgent: result.factory });
    for (let i = 0; i < 3; i++) {
      fireEvent!({ type: "turn_start" });
      fireEvent!({ type: "agent_end", messages: [] });
    }
    expect(events).toEqual([
      "turn_start",
      "idle",
      "turn_start",
      "idle",
      "turn_start",
      "idle",
    ]);
  });

  test("start() does not emit agent.turn.start or agent.idle", async () => {
    const { opts, bus } = makeOpts();
    const idleEvents: object[] = [];
    const turnStartEvents: object[] = [];
    bus.subscribe("agent.idle", (_s, p) => idleEvents.push(p));
    bus.subscribe("agent.turn.start", (_s, p) => turnStartEvents.push(p));
    const result = makeFakeAgentFactory({ onEvent: () => {} });
    body = createAgentBody({ ...opts, createAgent: result.factory });
    await (body as unknown as { start: () => Promise<void> }).start();
    expect(idleEvents).toHaveLength(0);
    expect(turnStartEvents).toHaveLength(0);
  });

  test("message_update text_delta buffers and flushes at 64 chars", () => {
    const { opts, bus } = makeOpts();
    const chunks = capturedEvents("agent.stream.chunk", bus);
    const result = makeFakeAgentFactory({
      onEvent: (l) => {
        fireEvent = l;
      },
    });
    body = createAgentBody({ ...opts, createAgent: result.factory });
    fireEvent!({ type: "message_start", message: { role: "assistant", content: [] } as unknown as AssistantMessage });
    const amEvent: AssistantMessageEvent = {
      type: "text_delta",
      contentIndex: 0,
      delta: "x".repeat(64),
      partial: { role: "assistant", content: [] } as unknown as AssistantMessage,
    };
    fireEvent!({
      type: "message_update",
      message: { role: "assistant", content: [] } as unknown as AssistantMessage,
      assistantMessageEvent: amEvent,
    });
    expect(chunks).toHaveLength(1);
    expect((chunks[0] as { payload: object }).payload).toMatchObject({
      stream_id: 1,
      seq: 0,
      block_type: "text",
      text: "x".repeat(64),
    });
  });

  test("message_end persists the message via memory.persist", () => {
    const { opts } = makeOpts();
    const result = makeFakeAgentFactory({
      onEvent: (l) => {
        fireEvent = l;
      },
    });
    body = createAgentBody({ ...opts, createAgent: result.factory });
    const msg = {
      role: "assistant",
      content: [{ type: "text", text: "hello" }],
      timestamp: Date.now(),
    } as unknown as AssistantMessage;
    fireEvent!({ type: "message_start", message: msg });
    fireEvent!({ type: "message_end", message: msg });
    const restored = opts.memory.restore("general-1", "s1", "t1");

    return restored.then((rows) => {
      expect(rows.length).toBe(1);
    });
  });

  test("beforeToolCall hook publishes agent.tool.call", async () => {
    const { opts, bus } = makeOpts();
    const calls = capturedEvents("agent.tool.call", bus);
    const result = makeFakeAgentFactory();
    body = createAgentBody({ ...opts, createAgent: result.factory });
    const captured = result.lastOpts();
    const hook = captured?.beforeToolCall;
    if (hook === undefined) {
      throw new Error("beforeToolCall hook not captured");
    }
    await hook({
      assistantMessage: { role: "assistant", content: [] } as unknown as AssistantMessage,
      toolCall: {
        type: "toolCall",
        id: "call_x",
        name: "bash",
        arguments: { command: "ls" },
      },
      args: { command: "ls" },
      context: {} as never,
    });
    expect(calls).toHaveLength(1);
    expect((calls[0] as { payload: object }).payload).toMatchObject({
      tool_call_id: "call_x",
      name: "bash",
    });
  });
});

describe("AgentBody — agent.queue.update", () => {
  let body: AgentBody | undefined;

  afterEach(() => {
    body?.stop();
  });

  test("queue.update published on enqueue with synthetic snapshot", async () => {
    const { opts, bus } = makeOpts();
    const events: object[] = [];
    bus.subscribe("agent.queue.update", (_s, p) => {
      events.push(p);
    });
    const result = makeFakeAgentFactory({
      onEvent: (l) => {
        void l;
      },
    });
    body = createAgentBody({ ...opts, createAgent: result.factory });
    result.fake.state.isStreaming = true;
    await (body as unknown as { start: () => Promise<void> }).start();
    bus.publish("t1.leader.prompt", {
      version: 1,
      type: "t1.leader.prompt",
      sender: { kind: "agent", identity: { teamId: "t1", agentRole: "general", agentKey: "general-1" } },
      timestamp: new Date().toISOString(),
      payload: { prompt: "queued" },
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(events.length).toBeGreaterThan(0);
    const last = events[events.length - 1] as { payload: object };
    expect((last.payload as { prompts: string[] }).prompts).toEqual(["[user]: queued"]);
  });
});
