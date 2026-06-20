import { afterEach, describe, expect, mock, test } from "bun:test";
import type { AgentEvent as PiAgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, AssistantMessageEvent } from "@earendil-works/pi-ai";
import { createAgentBody, type AgentBody, type CreateAgentBodyOptions } from "./agent-body.ts";
import { createEventBus, type EventBus } from "./event-bus.ts";

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
import type { AgentEvent } from "./agent-event.ts";

function makeSoul(): AgentSoul {
  return {
    role: "general",
    model: "anthropic/claude-sonnet-4",
    system_prompt: "you are a general assistant",
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

function makeOpts(overrides: Partial<CreateAgentBodyOptions> = {}): CreateAgentBodyOptions {
  const bus = createEventBus();
  const registry = createToolRegistry();
  registry.register("noop", makeNoopTool());
  return {
    agent_key: "general-1",
    team_id: "t1",
    soul: makeSoul(),
    is_leader: true,
    bus,
    artifacts: makeArtifacts(),
    memory: makeMemory(),
    session_id: "s1",
    tool_registry: registry,
    getApiKey: () => undefined,
    model: {},
    ...overrides,
  };
}

describe("AgentBody — pi-agent event bridging", () => {
  let body: AgentBody | undefined;
  let fireEvent: ((e: PiAgentEvent) => void) | undefined;

  afterEach(() => {
    body?.stop();
    body = undefined;
  });

  function capturedEvents(topic: string, bus: EventBus): AgentEvent[] {
    const out: AgentEvent[] = [];
    bus.subscribe(topic, (_s, p) => {
      out.push(p as AgentEvent);
    });
    return out;
  }

  test("turn_start publishes agent.turn.start with empty payload", () => {
    const opts = makeOpts();
    const turnStart = capturedEvents("agent.turn.start", opts.bus);
    const result = makeFakeAgentFactory({
      onEvent: (l) => {
        fireEvent = l;
      },
    });
    body = createAgentBody({ ...opts, createAgent: result.factory });
    fireEvent!({ type: "turn_start" });
    expect(turnStart).toHaveLength(1);
    expect(turnStart[0]!.event_type).toBe("agent.turn.start");
    expect(turnStart[0]!.payload).toEqual({});
  });

  test("agent_end publishes agent.idle with empty payload", () => {
    const opts = makeOpts();
    const idle = capturedEvents("agent.idle", opts.bus);
    const result = makeFakeAgentFactory({
      onEvent: (l) => {
        fireEvent = l;
      },
    });
    body = createAgentBody({ ...opts, createAgent: result.factory });
    fireEvent!({ type: "agent_end", messages: [] });
    expect(idle).toHaveLength(1);
    expect(idle[0]!.event_type).toBe("agent.idle");
    expect(idle[0]!.payload).toEqual({});
  });

  test("body-side alternation: turn_start always precedes agent.idle", () => {
    const opts = makeOpts();
    const events: string[] = [];
    opts.bus.subscribe("agent.turn.start", () => events.push("turn_start"));
    opts.bus.subscribe("agent.idle", () => events.push("idle"));
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

  test("message_update text_delta buffers and flushes at 64 chars", () => {
    const opts = makeOpts();
    const chunks = capturedEvents("agent.stream.chunk", opts.bus);
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
    expect(chunks[0]!.payload).toMatchObject({
      stream_id: 1,
      seq: 0,
      block_type: "text",
      text: "x".repeat(64),
    });
  });

  test("message_end persists the message via memory.persist", () => {
    const opts = makeOpts();
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
    const opts = makeOpts();
    const calls = capturedEvents("agent.tool.call", opts.bus);
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
    expect(calls[0]!.payload).toMatchObject({
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
    const opts = makeOpts();
    const events: AgentEvent[] = [];
    opts.bus.subscribe("agent.queue.update", (_s, p) => {
      events.push(p as AgentEvent);
    });
    const result = makeFakeAgentFactory({
      onEvent: (l) => {
        void l;
      },
    });
    body = createAgentBody({ ...opts, createAgent: result.factory });
    result.fake.state.isStreaming = true;
    await (body as unknown as { start: () => Promise<void> }).start();
    opts.bus.publish("t1.leader.prompt", {
      version: 1,
      team_id: "t1",
      event_type: "leader.prompt",
      agent_role: "general",
      agent_key: "general-1",
      timestamp: new Date().toISOString(),
      payload: { prompt: "queued" },
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(events.length).toBeGreaterThan(0);
    const last = events[events.length - 1]!;
    expect(last.payload.prompts).toEqual(["[user]: queued"]);
  });
});
