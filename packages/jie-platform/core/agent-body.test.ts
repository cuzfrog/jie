import { describe, expect, mock, test } from "bun:test";
import type {
  Agent as PiAgent,
  AgentEvent as PiAgentEvent,
  AgentMessage,
} from "@earendil-works/pi-agent-core";
import { createAgentBody, type CreateAgentBodyOptions } from "./agent-body.ts";
import { JieAgentBody } from "./jie-agent-body.ts";
import { createEventManager, type EventManager } from "../event";
import {
  createArtifactStore,
  createMemoryManager,
  createStorage,
} from "../storage";
import { createToolRegistry, type Tool } from "../tools";
import type { AgentSoul } from "../team";
import { Type } from "typebox";

function makeSoul(overrides: Partial<AgentSoul> = {}): AgentSoul {
  return {
    role: "general",
    model: "anthropic/claude-sonnet-4",
    systemPrompt: "you are a general assistant",
    tools: ["noop"],
    subscribe: [],
    subscriptions: [],
    ...overrides,
  };
}

function makeNoopTool(): Tool {
  return {
    name: "noop",
    description: "no-op",
    label: "Noop",
    parameters: Type.Object({}),
    async execute() {
      return { content: "noop" };
    },
  };
}

function makeOpts(overrides: Partial<CreateAgentBodyOptions> = {}): { opts: CreateAgentBodyOptions; events: EventManager; subscribeSubject: (topic: string, cb: (subject: string, payload: object) => void) => () => void } {
  const storage = createStorage({ type: "sqlite", filePath: ":memory:" });
  const events: EventManager = createEventManager();
  const registry = createToolRegistry();
  registry.register("noop", makeNoopTool());
  const opts: CreateAgentBodyOptions = {
    agentKey: "general-1",
    teamId: "t1",
    soul: makeSoul(),
    isLeader: true,
    events,
    artifactStore: createArtifactStore(storage),
    memory: createMemoryManager(storage),
    sessionId: "s1",
    toolRegistry: registry,
    getApiKey: () => undefined,
    model: { provider: "anthropic", id: "claude-sonnet-4" },
    ...overrides,
  };
  const subscribeSubject = (topic: string, cb: (subject: string, payload: object) => void): (() => void) => {
    return events.subscribe(topic, (env) => cb(topic, env));
  };
  return { opts, events, subscribeSubject };
}

interface FakeAgentCapture {
  factory: (opts: ConstructorParameters<typeof PiAgent>[0]) => PiAgent;
  fake: {
    subscribe: ReturnType<typeof mock>;
    state: { systemPrompt: string; model: unknown; tools: unknown[]; messages: AgentMessage[]; isStreaming: boolean };
    continue: ReturnType<typeof mock>;
    prompt: ReturnType<typeof mock>;
  };
  lastOpts: () => ConstructorParameters<typeof PiAgent>[0] | undefined;
  agentListener: ((event: PiAgentEvent) => void) | undefined;
}

function makeFakeAgentFactory(): FakeAgentCapture {
  let listener: ((event: PiAgentEvent) => void) | undefined;
  const subscribe = mock((l: (event: PiAgentEvent) => void) => {
    listener = l;
    return () => {};
  });
  const state = {
    systemPrompt: "",
    model: null,
    tools: [] as unknown[],
    messages: [] as AgentMessage[],
    isStreaming: false,
  };
  const fake = {
    subscribe,
    state,
    continue: mock(async () => {}),
    prompt: mock(async () => {}),
  };
  const stub = fake as unknown as PiAgent;
  let captured: ConstructorParameters<typeof PiAgent>[0] | undefined;
  return {
    factory: (opts) => {
      captured = opts;
      return stub;
    },
    fake,
    lastOpts: () => captured,
    get agentListener() {
      return listener;
    },
  } as FakeAgentCapture;
}

describe("createAgentBody — wiring", () => {
  test("invokes opts.createAgent exactly once with the right shape", () => {
    const { opts } = makeOpts();
    const cap = makeFakeAgentFactory();
    const tracked = mock((o: ConstructorParameters<typeof PiAgent>[0]) => cap.factory(o));
    createAgentBody({ ...opts, createAgent: tracked });
    expect(tracked).toHaveBeenCalledTimes(1);
    const passed = tracked.mock.calls[0]![0]!;
    expect(passed.sessionId).toBe("s1");
    expect(passed.steeringMode).toBe("all");
    expect(passed.followUpMode).toBe("all");
    expect(passed.toolExecution).toBe("sequential");
    expect(passed.convertToLlm).toBeUndefined();
  });

  test("passes the right agent.state fields after construction", () => {
    const { opts } = makeOpts();
    const cap = makeFakeAgentFactory();
    createAgentBody({ ...opts, createAgent: cap.factory });
    expect(cap.fake.state.systemPrompt).toBe(opts.soul.systemPrompt);
    expect(cap.fake.state.model).toBe(opts.model);
    expect((cap.fake.state.tools as unknown[]).length).toBe(1);
  });

  test("adapts soul.tools specs through the tool registry", () => {
    const { opts } = makeOpts({
      soul: makeSoul({ tools: ["noop"] }),
    });
    const cap = makeFakeAgentFactory();
    createAgentBody({ ...opts, createAgent: cap.factory });
    const tools = cap.fake.state.tools as Array<{ name: string }>;
    expect(tools[0]!.name).toBe("noop");
  });

  test("subscribes to agent events via agent.subscribe", () => {
    const { opts } = makeOpts();
    const cap = makeFakeAgentFactory();
    createAgentBody({ ...opts, createAgent: cap.factory });
    expect(cap.fake.subscribe).toHaveBeenCalledTimes(1);
  });

  test("returned body's identity matches the options", () => {
    const { opts } = makeOpts({ agentKey: "leader-1", isLeader: true, sessionId: "sess-x" });
    const cap = makeFakeAgentFactory();
    const body = createAgentBody({ ...opts, createAgent: cap.factory }) as JieAgentBody;
    const identity = body as unknown as { agentKey: string; teamId: string };
    expect(identity.agentKey).toBe("leader-1");
    expect(identity.teamId).toBe("t1");
  });

  test("beforeToolCall publishes agent.tool.call with the right payload", async () => {
    const { opts, subscribeSubject } = makeOpts();
    const cap = makeFakeAgentFactory();
    createAgentBody({ ...opts, createAgent: cap.factory });
    const hook = cap.lastOpts()?.beforeToolCall;
    if (hook === undefined) {
      throw new Error("beforeToolCall hook not provided");
    }
    const received: AgentEventLike[] = [];
    subscribeSubject("agent.tool.call", (_s, p) => {
      received.push(p as AgentEventLike);
    });
    await hook({
      toolCall: { id: "c1", name: "bash" },
      args: { command: "ls" },
    } as never);
    expect(received).toHaveLength(1);
    expect(received[0]!.payload).toMatchObject({
      tool_call_id: "c1",
      name: "bash",
    });
  });

  test("afterToolCall publishes agent.tool.result with duration_ms", async () => {
    const { opts, subscribeSubject } = makeOpts();
    const cap = makeFakeAgentFactory();
    createAgentBody({ ...opts, createAgent: cap.factory });
    const beforeHook = cap.lastOpts()?.beforeToolCall;
    const afterHook = cap.lastOpts()?.afterToolCall;
    if (beforeHook === undefined || afterHook === undefined) {
      throw new Error("tool hooks not provided");
    }
    await beforeHook({ toolCall: { id: "c1", name: "bash" }, args: {} } as never);
    const received: AgentEventLike[] = [];
    subscribeSubject("agent.tool.result", (_s, p) => {
      received.push(p as AgentEventLike);
    });
    await afterHook({
      toolCall: { id: "c1", name: "bash" },
      isError: false,
      result: { content: [{ text: "ok" }] },
    } as never);
    expect(received).toHaveLength(1);
    expect(received[0]!.payload).toMatchObject({
      tool_call_id: "c1",
      name: "bash",
    });
    expect((received[0]!.payload as { duration_ms: number }).duration_ms).toBeGreaterThanOrEqual(0);
  });

  test("beforeToolCall shapes tool args into wire form (short input → input_truncated=false)", async () => {
    const { opts, subscribeSubject } = makeOpts();
    const cap = makeFakeAgentFactory();
    createAgentBody({ ...opts, createAgent: cap.factory });
    const hook = cap.lastOpts()?.beforeToolCall;
    if (hook === undefined) throw new Error("beforeToolCall hook not provided");
    const received: AgentEventLike[] = [];
    subscribeSubject("agent.tool.call", (_s, p) => {
      received.push(p as AgentEventLike);
    });
    await hook({
      toolCall: { id: "c1", name: "bash" },
      args: { command: "ls" },
    } as never);
    expect(received).toHaveLength(1);
    const payload = received[0]!.payload as { input: string; input_truncated: boolean };
    expect(typeof payload.input).toBe("string");
    expect(payload.input_truncated).toBe(false);
  });

  test("beforeToolCall truncates long input with marker", async () => {
    const { opts, subscribeSubject } = makeOpts();
    const cap = makeFakeAgentFactory();
    createAgentBody({ ...opts, createAgent: cap.factory });
    const hook = cap.lastOpts()?.beforeToolCall;
    if (hook === undefined) throw new Error("beforeToolCall hook not provided");
    const received: AgentEventLike[] = [];
    subscribeSubject("agent.tool.call", (_s, p) => {
      received.push(p as AgentEventLike);
    });
    await hook({
      toolCall: { id: "c1", name: "bash" },
      args: { command: "x".repeat(8000) },
    } as never);
    const payload = received[0]!.payload as { input: string; input_truncated: boolean };
    expect(payload.input_truncated).toBe(true);
    expect(payload.input).toContain("chars truncated");
    expect(payload.input.length).toBeLessThan(8000);
  });

  test("afterToolCall: error path leaves output null and output_truncated=false", async () => {
    const { opts, subscribeSubject } = makeOpts();
    const cap = makeFakeAgentFactory();
    createAgentBody({ ...opts, createAgent: cap.factory });
    const beforeHook = cap.lastOpts()?.beforeToolCall;
    const afterHook = cap.lastOpts()?.afterToolCall;
    if (beforeHook === undefined || afterHook === undefined) {
      throw new Error("tool hooks not provided");
    }
    await beforeHook({ toolCall: { id: "c1", name: "bash" }, args: {} } as never);
    const received: AgentEventLike[] = [];
    subscribeSubject("agent.tool.result", (_s, p) => {
      received.push(p as AgentEventLike);
    });
    await afterHook({
      toolCall: { id: "c1", name: "bash" },
      isError: true,
      result: { content: [{ text: "boom" }] },
    } as never);
    const payload = received[0]!.payload as { output: string | null; output_truncated: boolean; error: string };
    expect(payload.output).toBeNull();
    expect(payload.output_truncated).toBe(false);
    expect(payload.error).toBe("boom");
  });

  test("stop() invokes the agent subscription's unsubscribe", () => {
    const { opts } = makeOpts();
    const cap = makeFakeAgentFactory();
    const body = createAgentBody({ ...opts, createAgent: cap.factory });
    let unsubscribed = false;
    cap.fake.subscribe = mock(() => {
      return () => {
        unsubscribed = true;
      };
    }) as unknown as typeof cap.fake.subscribe;
    const body2 = createAgentBody({ ...opts, createAgent: cap.factory });
    body2.stop();
    expect(unsubscribed).toBe(true);
    body.stop();
  });
});

interface AgentEventLike {
  event_type: string;
  payload: Record<string, unknown>;
}
