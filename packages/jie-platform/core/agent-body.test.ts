import { describe, expect, mock, test } from "bun:test";
import type {
  Agent as PiAgent,
  AgentEvent as PiAgentEvent,
  AgentMessage,
} from "@earendil-works/pi-agent-core";
import { createAgentBody, type CreateAgentBodyOptions } from "./agent-body.ts";
import { JieAgentBody } from "./jie-agent-body.ts";
import { createEventBus } from "./event-bus.ts";
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
    system_prompt: "you are a general assistant",
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

function makeOpts(overrides: Partial<CreateAgentBodyOptions> = {}): CreateAgentBodyOptions {
  const storage = createStorage({ type: "sqlite", filePath: ":memory:" });
  const bus = createEventBus();
  const registry = createToolRegistry();
  registry.register("noop", makeNoopTool());
  return {
    agent_key: "general-1",
    team_id: "t1",
    soul: makeSoul(),
    is_leader: true,
    bus,
    artifacts: createArtifactStore(storage),
    memory: createMemoryManager(storage),
    session_id: "s1",
    tool_registry: registry,
    getApiKey: () => undefined,
    model: { provider: "anthropic", id: "claude-sonnet-4" },
    ...overrides,
  };
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
    const opts = makeOpts();
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
    const opts = makeOpts();
    const cap = makeFakeAgentFactory();
    createAgentBody({ ...opts, createAgent: cap.factory });
    expect(cap.fake.state.systemPrompt).toBe(opts.soul.system_prompt);
    expect(cap.fake.state.model).toBe(opts.model);
    expect((cap.fake.state.tools as unknown[]).length).toBe(1);
  });

  test("adapts soul.tools specs through the tool registry", () => {
    const opts = makeOpts({
      soul: makeSoul({ tools: ["noop"] }),
    });
    const cap = makeFakeAgentFactory();
    createAgentBody({ ...opts, createAgent: cap.factory });
    const tools = cap.fake.state.tools as Array<{ name: string }>;
    expect(tools[0]!.name).toBe("noop");
  });

  test("subscribes to agent events via agent.subscribe", () => {
    const opts = makeOpts();
    const cap = makeFakeAgentFactory();
    createAgentBody({ ...opts, createAgent: cap.factory });
    expect(cap.fake.subscribe).toHaveBeenCalledTimes(1);
  });

  test("returned body's identity matches the options", () => {
    const opts = makeOpts({ agent_key: "leader-1", is_leader: true, session_id: "sess-x" });
    const cap = makeFakeAgentFactory();
    const body = createAgentBody({ ...opts, createAgent: cap.factory }) as JieAgentBody;
    expect(body.agent_key).toBe("leader-1");
    expect(body.team_id).toBe("t1");
    expect(body.is_leader).toBe(true);
  });

  test("beforeToolCall publishes agent.tool.call with the right payload", async () => {
    const opts = makeOpts();
    const cap = makeFakeAgentFactory();
    createAgentBody({ ...opts, createAgent: cap.factory });
    const hook = cap.lastOpts()?.beforeToolCall;
    if (hook === undefined) {
      throw new Error("beforeToolCall hook not provided");
    }
    const received: AgentEventLike[] = [];
    opts.bus.subscribe("agent.tool.call", (_s, p) => {
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
    const opts = makeOpts();
    const cap = makeFakeAgentFactory();
    createAgentBody({ ...opts, createAgent: cap.factory });
    const beforeHook = cap.lastOpts()?.beforeToolCall;
    const afterHook = cap.lastOpts()?.afterToolCall;
    if (beforeHook === undefined || afterHook === undefined) {
      throw new Error("tool hooks not provided");
    }
    await beforeHook({ toolCall: { id: "c1", name: "bash" }, args: {} } as never);
    const received: AgentEventLike[] = [];
    opts.bus.subscribe("agent.tool.result", (_s, p) => {
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

  test("stop() invokes the agent subscription's unsubscribe", () => {
    const opts = makeOpts();
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
