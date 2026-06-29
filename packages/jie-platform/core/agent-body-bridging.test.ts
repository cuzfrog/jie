import type { Agent, AgentEvent as PiAgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, AssistantMessageEvent } from "@earendil-works/pi-ai";
import { createAgentBody, type AgentBody, type CreateAgentBodyOptions } from "./agent-body-factory";
import { createEventManager, type EventManager } from "../event";

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

function makeOpts(overrides: Partial<CreateAgentBodyOptions> = {}): { opts: CreateAgentBodyOptions; events: EventManager; subscribeSubject: (topic: string, cb: (subject: string, payload: object) => void) => () => void } {
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
    model: {},
    ...overrides,
  };
  const subscribeSubject = (topic: string, cb: (subject: string, payload: object) => void): (() => void) => {
    const seen = new Map<string, object[]>();
    const off = events.subscribe(topic, (env) => {
      const arr = seen.get(topic) ?? [];
      arr.push(env);
      seen.set(topic, arr);
      cb(topic, env);
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

  function capturedEvents(topic: string, subscribeSubject: (topic: string, cb: (subject: string, payload: object) => void) => () => void): object[] {
    const out: object[] = [];
    subscribeSubject(topic, (_s, p) => {
      out.push(p);
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
    const env = turnStart[0] as { topic: string; payload: object };
    expect(env.topic).toBe("agent.turn.start");
    expect(env.payload).toBeNull();
  });

  test("agent_end publishes agent.idle with empty payload", () => {
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
    const env = idle[0] as { topic: string; payload: object };
    expect(env.topic).toBe("agent.idle");
    expect(env.payload).toEqual({ stopReason: "stop", isError: false });
  });

  test("body-side alternation: turn_start always precedes agent.idle", () => {
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
    fireEvent!({ type: "turn_start" });
    fireEvent!({ type: "agent_end", messages: [] });
    expect(events).toEqual(["turn_start", "idle"]);
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
    const idleEvents: object[] = [];
    const turnStartEvents: object[] = [];
    subscribeSubject("agent.idle", (_s, p) => idleEvents.push(p));
    subscribeSubject("agent.turn.start", (_s, p) => turnStartEvents.push(p));
    const result = makeFakeAgentFactory({ onEvent: () => {} });
    body = createAgentBody({ ...opts, createAgent: result.factory });
    await (body as unknown as { start: () => Promise<void> }).start();
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
    const { opts, subscribeSubject } = makeOpts();
    const calls = capturedEvents("agent.tool.call", subscribeSubject);
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

  test("subscribe listener accepts (event, signal) per pi-agent contract (#51)", () => {
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

  test("afterToolCall hook publishes agent.tool.result with the Jie ToolResult shape (#50)", async () => {
    const { opts, subscribeSubject } = makeOpts();
    const results: object[] = [];
    subscribeSubject("agent.tool.result", (_s, p) => {
      results.push(p);
    });
    const result = makeFakeAgentFactory();
    body = createAgentBody({ ...opts, createAgent: result.factory });
    const captured = result.lastOpts();
    const hook = captured?.afterToolCall;
    if (hook === undefined) {
      throw new Error("afterToolCall hook not captured");
    }
    await hook({
      assistantMessage: { role: "assistant", content: [] } as unknown as AssistantMessage,
      toolCall: {
        type: "toolCall",
        id: "call_r",
        name: "noop",
        arguments: {},
      },
      args: {},
      context: {} as never,
      result: {
        content: [{ type: "text", text: "hello" }],
        details: { foo: 1 },
        terminate: false,
      },
      isError: false,
    });
    expect(results).toHaveLength(1);
    const env = results[0] as { payload: { output: string; error: string | null } };
    expect(JSON.parse(env.payload.output)).toEqual({
      content: "hello",
      details: { foo: 1 },
      terminate: false,
    });
  });

  test("afterToolCall: multi-block content serializes as JSON array (#50)", async () => {
    const { opts, subscribeSubject } = makeOpts();
    const results: object[] = [];
    subscribeSubject("agent.tool.result", (_s, p) => {
      results.push(p);
    });
    const result = makeFakeAgentFactory();
    body = createAgentBody({ ...opts, createAgent: result.factory });
    const captured = result.lastOpts();
    const hook = captured?.afterToolCall;
    if (hook === undefined) throw new Error("afterToolCall hook not captured");
    await hook({
      assistantMessage: { role: "assistant", content: [] } as unknown as AssistantMessage,
      toolCall: { type: "toolCall", id: "call_m", name: "noop", arguments: {} },
      args: {},
      context: {} as never,
      result: {
        content: [
          { type: "text", text: "a" },
          { type: "image", data: "x" } as never,
        ],
        details: { ok: true },
        terminate: true,
      },
      isError: false,
    });
    const env = results[0] as { payload: { output: string } };
    expect(JSON.parse(env.payload.output)).toEqual({
      content: [
        { type: "text", text: "a" },
        { type: "image", data: "x" },
      ],
      details: { ok: true },
      terminate: true,
    });
  });

  test("afterToolCall on error: output null, error carries message (#50 unchanged path)", async () => {
    const { opts, subscribeSubject } = makeOpts();
    const results: object[] = [];
    subscribeSubject("agent.tool.result", (_s, p) => {
      results.push(p);
    });
    const result = makeFakeAgentFactory();
    body = createAgentBody({ ...opts, createAgent: result.factory });
    const captured = result.lastOpts();
    const hook = captured?.afterToolCall;
    if (hook === undefined) throw new Error("afterToolCall hook not captured");
    await hook({
      assistantMessage: { role: "assistant", content: [] } as unknown as AssistantMessage,
      toolCall: { type: "toolCall", id: "call_e", name: "noop", arguments: {} },
      args: {},
      context: {} as never,
      result: {
        content: [{ type: "text", text: "boom" }],
        details: {},
        terminate: false,
      },
      isError: true,
    });
    expect(results).toHaveLength(1);
    const env = results[0] as { payload: { output: string | null; error: string | null } };
    expect(env.payload.output).toBeNull();
    expect(env.payload.error).toBe("boom");
  });
});
