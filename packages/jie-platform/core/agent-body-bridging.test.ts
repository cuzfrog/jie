import type { Agent, AgentEvent as PiAgentEvent, AgentMessage, AfterToolCallContext, BeforeToolCallContext } from "@earendil-works/pi-agent-core";
import type { Api, AssistantMessage, AssistantMessageEvent, Model } from "@earendil-works/pi-ai";
import { createAgentBody, type AgentBody, type CreateAgentBodyOptions } from "./agent-body";
import { createEventManager, type EventManager, type EventEnvelope, type EventType } from "../event";

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

function makeAssistantMessage(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    role: "assistant",
    content: [],
    api: "anthropic-messages",
    provider: "anthropic",
    model: "claude-sonnet-4",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: 0,
    ...overrides,
  };
}

function makeAgentContext(overrides: Partial<{ systemPrompt: string; messages: AgentMessage[] }> = {}): { systemPrompt: string; messages: AgentMessage[] } {
  return {
    systemPrompt: "",
    messages: [],
    ...overrides,
  };
}

function makeSoul(): AgentSoul {
  return {
    role: "general",
    model: "anthropic/claude-sonnet-4",
    systemPrompt: "you are a general assistant",
    tools: ["noop"],
    subscribe: [],
  };
}

function makeModel(provider: string, id: string): Model<Api> {
  return {
    id,
    name: id,
    api: "anthropic-messages" as Api,
    provider,
    baseUrl: "",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxTokens: 8192,
  };
}

interface FakeAgent {
  subscribe: ReturnType<typeof vi.fn>;
  state: {
    systemPrompt: string;
    model: unknown;
    tools: unknown[];
    messages: AgentMessage[];
    isStreaming: boolean;
  };
  continue: ReturnType<typeof vi.fn>;
  prompt: ReturnType<typeof vi.fn>;
}

function makeFakeAgentFactory(options: {
  beforeToolCall?: (ctx: unknown) => Promise<unknown>;
  afterToolCall?: (ctx: unknown) => Promise<unknown>;
  onEvent?: (listener: (event: PiAgentEvent) => void) => void;
} = {}): {
  factory: (opts: ConstructorParameters<typeof Agent>[0]) => Agent;
  fake: FakeAgent;
  lastOpts: () => ConstructorParameters<typeof Agent>[0] | undefined;
} {
  const fake: FakeAgent = {
    subscribe: vi.fn((listener: (event: PiAgentEvent) => void) => {
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
    continue: vi.fn(async () => {}),
    prompt: vi.fn(async () => {}),
  };
  const stub = {
    state: fake.state,
    subscribe: fake.subscribe,
    continue: fake.continue,
    prompt: fake.prompt,
  } as unknown as Agent;
  let captured: ConstructorParameters<typeof Agent>[0] | undefined;
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

function makeOpts(overrides: Partial<CreateAgentBodyOptions> = {}): { opts: CreateAgentBodyOptions; events: EventManager; subscribeSubject: <T extends EventType>(topic: T, cb: (env: EventEnvelope<T>) => void) => () => void } {
  const events: EventManager = createEventManager();
  const artifactStore = makeArtifacts();
  const registry = createToolRegistry({
    workspaceRoot: "/tmp",
    eventManager: events,
    artifactStore,
  });
  registry.register("noop", makeNoopTool());
  const opts: CreateAgentBodyOptions = {
    agentKey: "general-1",
    teamId: "t1",
    soul: makeSoul(),
    isLeader: true,
    eventManager: events,
    artifactStore: makeArtifacts(),
    memory: makeMemory(),
    sessionId: "s1",
    toolRegistry: registry,
    getApiKey: () => undefined,
    model: makeModel("anthropic", "claude-sonnet-4"),
    ...overrides,
  };
  const subscribeSubject = <T extends EventType>(topic: T, cb: (env: EventEnvelope<T>) => void): (() => void) => {
    const off = events.subscribe(topic, (env) => {
      cb(env);
    });
    return off;
  };
  return { opts, events, subscribeSubject };
}

describe("AgentBody — pi-agent event bridging", () => {
  let body: AgentBody | undefined;
  let fireEvent: ((e: PiAgentEvent) => void) | undefined;

  afterEach(() => {
    body?.stop();
    body = undefined;
  });

  function capturedEvents<T extends EventType>(topic: T, subscribeSubject: <U extends EventType>(topic: U, cb: (env: EventEnvelope<U>) => void) => () => void): EventEnvelope<T>[] {
    const out: EventEnvelope<T>[] = [];
    subscribeSubject(topic, (env) => {
      out.push(env);
    });
    return out;
  }

  test("turn_start publishes agent.turn.start with empty payload", () => {
    const { opts, subscribeSubject } = makeOpts();
    const turnStart = capturedEvents("agent.turn.start", subscribeSubject);
    const result = makeFakeAgentFactory({
      onEvent: (l) => {
        fireEvent = l;
      },
    });
    body = createAgentBody({ ...opts, createAgent: result.factory });
    fireEvent!({ type: "turn_start" });
    expect(turnStart).toHaveLength(1);
    const env = turnStart[0]!;
    expect(env.topic).toBe("agent.turn.start");
    expect(env.payload).toBeNull();
  });

  test("agent_end publishes agent.idle with the final stopReason", () => {
    const { opts, subscribeSubject } = makeOpts();
    const idle = capturedEvents("agent.idle", subscribeSubject);
    const result = makeFakeAgentFactory({
      onEvent: (l) => {
        fireEvent = l;
      },
    });
    body = createAgentBody({ ...opts, createAgent: result.factory });
    fireEvent!({ type: "agent_end", messages: [] });
    expect(idle).toHaveLength(1);
    const env = idle[0]!;
    expect(env.topic).toBe("agent.idle");
    expect(env.payload).toBe("stop");
  });

  test("3 turns alternate strictly: turn_start, idle, turn_start, idle, ...", () => {
    const { opts, subscribeSubject } = makeOpts();
    const events: string[] = [];
    subscribeSubject("agent.turn.start", () => events.push("turn_start"));
    subscribeSubject("agent.idle", () => events.push("idle"));
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
    const { opts, subscribeSubject } = makeOpts();
    const idleEvents: unknown[] = [];
    const turnStartEvents: unknown[] = [];
    subscribeSubject("agent.idle", (env) => idleEvents.push(env));
    subscribeSubject("agent.turn.start", (env) => turnStartEvents.push(env));
    const result = makeFakeAgentFactory({ onEvent: () => {} });
    body = createAgentBody({ ...opts, createAgent: result.factory });
    await body.start();
    expect(idleEvents).toHaveLength(0);
    expect(turnStartEvents).toHaveLength(0);
  });

  test("message_update text_delta buffers and flushes at 64 chars", () => {
    const { opts, subscribeSubject } = makeOpts();
    const chunks = capturedEvents("agent.stream.chunk", subscribeSubject);
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
    expect(chunks[0]?.payload).toMatchObject({
      stream_id: 1,
      seq: 0,
      block_type: "text",
      text: "x".repeat(64),
    });
  });

  test("message_end persists the message via memory.persist", async () => {
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
    const restored = await opts.memory.restore("general-1", "s1", "t1");
    expect(restored.length).toBe(1);
  });

  test("beforeToolCall hook publishes agent.tool.call", async () => {
    const { opts, subscribeSubject } = makeOpts();
    const calls = capturedEvents("agent.tool.call", subscribeSubject);
    const result = makeFakeAgentFactory();
    body = createAgentBody({ ...opts, createAgent: result.factory });
    const captured = result.lastOpts();
    const hook = captured?.beforeToolCall;
    if (hook === undefined) {
      throw new Error("beforeToolCall hook not captured");
    }
    const ctx: BeforeToolCallContext = {
      assistantMessage: makeAssistantMessage(),
      toolCall: {
        type: "toolCall",
        id: "call_x",
        name: "bash",
        arguments: { command: "ls" },
      },
      args: { command: "ls" },
      context: makeAgentContext(),
    };
    await hook(ctx);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.payload).toMatchObject({
      tool_call_id: "call_x",
      name: "bash",
    });
  });

  test("subscribe listener accepts (event, signal) per pi-agent contract", () => {
    const { opts } = makeOpts();
    let subscribeArgCount: number | undefined;
    const result = makeFakeAgentFactory({
      onEvent: (l) => {
        subscribeArgCount = l.length;
      },
    });
    body = createAgentBody({ ...opts, createAgent: result.factory });
    expect(subscribeArgCount).toBe(2);
  });

  test("afterToolCall hook publishes agent.tool.result with the Jie ToolResult shape", async () => {
    const { opts, subscribeSubject } = makeOpts();
    const results: EventEnvelope<"agent.tool.result">[] = [];
    subscribeSubject("agent.tool.result", (env) => {
      results.push(env);
    });
    const result = makeFakeAgentFactory();
    body = createAgentBody({ ...opts, createAgent: result.factory });
    const captured = result.lastOpts();
    const hook = captured?.afterToolCall;
    if (hook === undefined) {
      throw new Error("afterToolCall hook not captured");
    }
    const ctx: AfterToolCallContext = {
      assistantMessage: makeAssistantMessage(),
      toolCall: {
        type: "toolCall",
        id: "call_r",
        name: "noop",
        arguments: {},
      },
      args: {},
      context: makeAgentContext(),
      result: {
        content: [{ type: "text", text: "hello" }],
        details: { foo: 1 },
        terminate: false,
      },
      isError: false,
    };
    await hook(ctx);
    expect(results).toHaveLength(1);
    const env = results[0]!;
    expect(JSON.parse(env.payload.output!)).toEqual({
      content: "hello",
      details: { foo: 1 },
      terminate: false,
    });
  });

  test("afterToolCall: multi-block content serializes as JSON array", async () => {
    const { opts, subscribeSubject } = makeOpts();
    const results: EventEnvelope<"agent.tool.result">[] = [];
    subscribeSubject("agent.tool.result", (env) => {
      results.push(env);
    });
    const result = makeFakeAgentFactory();
    body = createAgentBody({ ...opts, createAgent: result.factory });
    const captured = result.lastOpts();
    const hook = captured?.afterToolCall;
    if (hook === undefined) throw new Error("afterToolCall hook not captured");
    const ctx: AfterToolCallContext = {
      assistantMessage: makeAssistantMessage(),
      toolCall: { type: "toolCall", id: "call_m", name: "noop", arguments: {} },
      args: {},
      context: makeAgentContext(),
      result: {
        content: [
          { type: "text", text: "a" },
          { type: "image", data: "x", mimeType: "image/png" },
        ],
        details: { ok: true },
        terminate: true,
      },
      isError: false,
    };
    await hook(ctx);
    const env = results[0]!;
    expect(JSON.parse(env.payload.output!)).toEqual({
      content: [
        { type: "text", text: "a" },
        { type: "image", data: "x", mimeType: "image/png" },
      ],
      details: { ok: true },
      terminate: true,
    });
  });

  test("afterToolCall on error: output null, error carries message", async () => {
    const { opts, subscribeSubject } = makeOpts();
    const results: EventEnvelope<"agent.tool.result">[] = [];
    subscribeSubject("agent.tool.result", (env) => {
      results.push(env);
    });
    const result = makeFakeAgentFactory();
    body = createAgentBody({ ...opts, createAgent: result.factory });
    const captured = result.lastOpts();
    const hook = captured?.afterToolCall;
    if (hook === undefined) throw new Error("afterToolCall hook not captured");
    const ctx: AfterToolCallContext = {
      assistantMessage: makeAssistantMessage(),
      toolCall: { type: "toolCall", id: "call_e", name: "noop", arguments: {} },
      args: {},
      context: makeAgentContext(),
      result: {
        content: [{ type: "text", text: "boom" }],
        details: {},
        terminate: false,
      },
      isError: true,
    };
    await hook(ctx);
    expect(results).toHaveLength(1);
    const env = results[0]!;
    expect(env.payload.output).toBeNull();
    expect(env.payload.error).toBe("boom");
  });
});
