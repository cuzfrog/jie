import type {
  Agent as PiAgent,
  AgentEvent as PiAgentEvent,
  AgentMessage,
  AfterToolCallContext,
  BeforeToolCallContext,
  ThinkingLevel,
} from "@earendil-works/pi-agent-core";
import type { Api, AssistantMessage, AssistantMessageEvent, Model } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { JieAgentBody } from "./jie-agent-body";
import type { AgentBodyParams } from "./agent-body";
import { Events, type EventEnvelope, type EventManager, type EventType } from "../event";
import type { ArtifactStore, MemoryManager } from "../storage";
import type { Tool, ToolRegistry, ToolResult } from "../tools";
import type { AgentSoul } from "../team";

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

function makeSoul(overrides: Partial<AgentSoul> = {}): AgentSoul {
  return {
    role: "general",
    model: "anthropic/claude-sonnet-4",
    systemPrompt: "you are a general assistant",
    tools: [],
    subscribe: [],
    ...overrides,
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

interface FakeAgentState {
  systemPrompt: string;
  model: unknown;
  tools: unknown[];
  messages: AgentMessage[];
  isStreaming: boolean;
  thinkingLevel: ThinkingLevel;
}

interface FakeAgentCapture {
  factory: (opts: ConstructorParameters<typeof PiAgent>[0]) => PiAgent;
  fake: {
    state: FakeAgentState;
    subscribe: ReturnType<typeof vi.fn>;
    prompt: ReturnType<typeof vi.fn>;
    followUp: ReturnType<typeof vi.fn>;
    steer: ReturnType<typeof vi.fn>;
    abort: ReturnType<typeof vi.fn>;
    continue: ReturnType<typeof vi.fn>;
  };
  lastOpts: () => ConstructorParameters<typeof PiAgent>[0] | undefined;
  readonly agentListener: ((event: PiAgentEvent) => void) | undefined;
}

function makeFakeAgentFactory(): FakeAgentCapture {
  let listener: ((event: PiAgentEvent) => void) | undefined;
  const state: FakeAgentState = {
    systemPrompt: "",
    model: null,
    tools: [],
    messages: [],
    isStreaming: false,
    thinkingLevel: "off",
  };
  const fake = {
    state,
    subscribe: vi.fn((l: (event: PiAgentEvent) => void) => {
      listener = l;
      return () => {};
    }),
    prompt: vi.fn(async (_message: AgentMessage | AgentMessage[]) => {}),
    followUp: vi.fn(() => {}),
    steer: vi.fn(() => {}),
    abort: vi.fn(() => {}),
    continue: vi.fn(async () => {}),
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
  };
}

function makeFakeMemory(): {
  memory: MemoryManager;
  persisted: AgentMessage[];
  restore: ReturnType<typeof vi.fn>;
} {
  const persisted: AgentMessage[] = [];
  const persist = vi.fn(async (message: AgentMessage) => {
    persisted.push(message);
  });
  const restore = vi.fn(async () => persisted.slice());
  const memory = { persist, restore } as unknown as MemoryManager;
  return { memory, persisted, restore };
}

interface MakeBodyOverrides {
  agentKey?: string;
  teamId?: string;
  soul?: AgentSoul;
  isLeader?: boolean;
  sessionId?: string;
  model?: Model<Api>;
  factory?: (opts: ConstructorParameters<typeof PiAgent>[0]) => PiAgent;
}

interface Harness {
  events: EventManager;
  persisted: AgentMessage[];
  restore: ReturnType<typeof vi.fn>;
  cap: FakeAgentCapture;
  state: FakeAgentState;
  prompt: ReturnType<typeof vi.fn>;
  followUp: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
  continue: ReturnType<typeof vi.fn>;
  subscribeSubject: <T extends EventType>(topic: T, cb: (env: EventEnvelope<T>) => void) => () => void;
  fireEvent: (event: PiAgentEvent) => void;
  makeBody: (overrides?: MakeBodyOverrides) => JieAgentBody;
}

function makeFakeEventManager(): EventManager {
  const subscribers = new Map<string, Array<(env: EventEnvelope<EventType>) => void>>();
  return {
    publish: (env: EventEnvelope<EventType>) => {
      for (const callback of subscribers.get(env.topic) ?? []) callback(env);
    },
    subscribe: (topic: string, callback: (env: EventEnvelope<EventType>) => void) => {
      const list = subscribers.get(topic) ?? [];
      list.push(callback);
      subscribers.set(topic, list);
      return () => {
        subscribers.set(topic, list.filter((cb) => cb !== callback));
      };
    },
    subscriberCount: (subject: string) => subscribers.get(subject)?.length ?? 0,
  };
}

function makeHarness(): Harness {
  const events: EventManager = makeFakeEventManager();
  const { memory, persisted, restore } = makeFakeMemory();
  const cap = makeFakeAgentFactory();
  const toolRegistry = vi.mocked<ToolRegistry>({
    register: vi.fn(),
    resolve: vi.fn(() => [makeNoopTool()]),
    list: vi.fn(() => []),
  });
  const artifactStore = vi.mocked<ArtifactStore>({
    write: vi.fn(),
    read: vi.fn(),
    list: vi.fn(),
  });
  const subscribeSubject = <T extends EventType>(topic: T, cb: (env: EventEnvelope<T>) => void): (() => void) =>
    events.subscribe(topic, (env) => cb(env));
  const makeBody: Harness["makeBody"] = (overrides = {}) => {
    const params: AgentBodyParams = {
      agentKey: overrides.agentKey ?? "general-1",
      teamId: overrides.teamId ?? "t1",
      soul: overrides.soul ?? makeSoul(),
      isLeader: overrides.isLeader ?? false,
      sessionId: overrides.sessionId ?? "s1",
      model: overrides.model,
    };
    return new JieAgentBody(params, {
      eventManager: events,
      artifactStore,
      memory,
      toolRegistry,
      getApiKey: () => undefined,
      createAgent: overrides.factory ?? cap.factory,
    });
  };
  const fireEvent = (event: PiAgentEvent): void => {
    const listener = cap.agentListener;
    if (listener === undefined) throw new Error("agent listener not captured");
    listener(event);
  };
  return {
    events,
    persisted,
    restore,
    cap,
    state: cap.fake.state,
    prompt: cap.fake.prompt,
    followUp: cap.fake.followUp,
    abort: cap.fake.abort,
    continue: cap.fake.continue,
    subscribeSubject,
    fireEvent,
    makeBody,
  };
}

describe("JieAgentBody — identity", () => {
  test("identity reflects the params and the resolved model info", () => {
    const h = makeHarness();
    const body = h.makeBody({
      agentKey: "leader-1",
      isLeader: true,
      model: makeModel("anthropic", "claude-sonnet-4"),
    });
    expect(body.identity).toEqual({
      teamId: "t1",
      role: "general",
      agentKey: "leader-1",
      isLeader: true,
      model: { provider: "anthropic", id: "claude-sonnet-4", effort: "off", contextWindow: 200000 },
    });
  });

  test("identity.model is null when no model is given", () => {
    const h = makeHarness();
    const body = h.makeBody();
    expect(body.identity.model).toBeNull();
  });
});

describe("JieAgentBody — agent construction wiring", () => {
  test("invokes the createAgent seam exactly once with the right shape", () => {
    const h = makeHarness();
    const cap = makeFakeAgentFactory();
    const tracked = vi.fn(cap.factory);
    h.makeBody({ factory: tracked });
    expect(tracked).toHaveBeenCalledTimes(1);
    const passed = tracked.mock.calls[0]![0]!;
    expect(passed.sessionId).toBe("s1");
    expect(passed.steeringMode).toBe("all");
    expect(passed.followUpMode).toBe("all");
    expect(passed.toolExecution).toBe("sequential");
    expect(passed.convertToLlm).toBeUndefined();
  });

  test("assigns soul.systemPrompt, model and adapted tools onto agent.state", () => {
    const h = makeHarness();
    const cap = makeFakeAgentFactory();
    const model = makeModel("anthropic", "claude-sonnet-4");
    h.makeBody({ soul: makeSoul({ tools: ["noop"] }), model, factory: cap.factory });
    expect(cap.fake.state.systemPrompt).toBe("you are a general assistant");
    expect(cap.fake.state.model).toBe(model);
    expect(cap.fake.state.tools).toHaveLength(1);
    expect((cap.fake.state.tools as Array<{ name: string }>)[0]!.name).toBe("noop");
  });

  test("subscribes to agent events via agent.subscribe", () => {
    const h = makeHarness();
    const cap = makeFakeAgentFactory();
    h.makeBody({ factory: cap.factory });
    expect(cap.fake.subscribe).toHaveBeenCalledTimes(1);
  });

  test("subscribe listener accepts (event, signal) per pi-agent contract", () => {
    const h = makeHarness();
    const cap = makeFakeAgentFactory();
    let argCount: number | undefined;
    cap.fake.subscribe.mockImplementation((l: (event: PiAgentEvent) => void) => {
      argCount = l.length;
      return () => {};
    });
    h.makeBody({ factory: cap.factory });
    expect(argCount).toBe(2);
  });

  test("stop() unsubscribes the agent event subscription", () => {
    const h = makeHarness();
    const cap = makeFakeAgentFactory();
    let unsubscribed = false;
    cap.fake.subscribe.mockImplementation(() => () => {
      unsubscribed = true;
    });
    const body = h.makeBody({ factory: cap.factory });
    body.stop();
    expect(unsubscribed).toBe(true);
  });

  test("beforeToolCall publishes agent.tool.call with wire-shaped input (short input not truncated)", async () => {
    const h = makeHarness();
    const cap = makeFakeAgentFactory();
    h.makeBody({ factory: cap.factory });
    const hook = cap.lastOpts()?.beforeToolCall;
    if (hook === undefined) throw new Error("beforeToolCall hook not provided");
    const received: EventEnvelope<"agent.tool.call">[] = [];
    h.subscribeSubject("agent.tool.call", (env) => {
      received.push(env);
    });
    const ctx: BeforeToolCallContext = {
      assistantMessage: makeAssistantMessage(),
      toolCall: { type: "toolCall", id: "c1", name: "bash", arguments: { command: "ls" } },
      args: { command: "ls" },
      context: makeAgentContext(),
    };
    await hook(ctx);
    expect(received).toHaveLength(1);
    const payload = received[0]!.payload;
    expect(payload.tool_call_id).toBe("c1");
    expect(payload.name).toBe("bash");
    expect(typeof payload.input).toBe("string");
    expect(payload.input_truncated).toBe(false);
  });

  test("beforeToolCall truncates long input with a marker", async () => {
    const h = makeHarness();
    const cap = makeFakeAgentFactory();
    h.makeBody({ factory: cap.factory });
    const hook = cap.lastOpts()?.beforeToolCall;
    if (hook === undefined) throw new Error("beforeToolCall hook not provided");
    const received: EventEnvelope<"agent.tool.call">[] = [];
    h.subscribeSubject("agent.tool.call", (env) => {
      received.push(env);
    });
    const ctx: BeforeToolCallContext = {
      assistantMessage: makeAssistantMessage(),
      toolCall: { type: "toolCall", id: "c1", name: "bash", arguments: { command: "x".repeat(8000) } },
      args: { command: "x".repeat(8000) },
      context: makeAgentContext(),
    };
    await hook(ctx);
    const payload = received[0]!.payload;
    expect(payload.input_truncated).toBe(true);
    expect(payload.input).toContain("chars truncated");
    expect(payload.input.length).toBeLessThan(8000);
  });

  test("afterToolCall publishes agent.tool.result with the Jie ToolResult shape", async () => {
    const h = makeHarness();
    const cap = makeFakeAgentFactory();
    h.makeBody({ factory: cap.factory });
    const hook = cap.lastOpts()?.afterToolCall;
    if (hook === undefined) throw new Error("afterToolCall hook not provided");
    const results: EventEnvelope<"agent.tool.result">[] = [];
    h.subscribeSubject("agent.tool.result", (env) => {
      results.push(env);
    });
    const ctx: AfterToolCallContext = {
      assistantMessage: makeAssistantMessage(),
      toolCall: { type: "toolCall", id: "call_r", name: "noop", arguments: {} },
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
    expect(JSON.parse(results[0]!.payload.output!)).toEqual({
      content: "hello",
      details: { foo: 1 },
      terminate: false,
    });
  });

  test("afterToolCall: multi-block content serializes as a JSON array", async () => {
    const h = makeHarness();
    const cap = makeFakeAgentFactory();
    h.makeBody({ factory: cap.factory });
    const hook = cap.lastOpts()?.afterToolCall;
    if (hook === undefined) throw new Error("afterToolCall hook not provided");
    const results: EventEnvelope<"agent.tool.result">[] = [];
    h.subscribeSubject("agent.tool.result", (env) => {
      results.push(env);
    });
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
    expect(JSON.parse(results[0]!.payload.output!)).toEqual({
      content: [
        { type: "text", text: "a" },
        { type: "image", data: "x", mimeType: "image/png" },
      ],
      details: { ok: true },
      terminate: true,
    });
  });

  test("afterToolCall on error: output null, error carries the message", async () => {
    const h = makeHarness();
    const cap = makeFakeAgentFactory();
    h.makeBody({ factory: cap.factory });
    const hook = cap.lastOpts()?.afterToolCall;
    if (hook === undefined) throw new Error("afterToolCall hook not provided");
    const results: EventEnvelope<"agent.tool.result">[] = [];
    h.subscribeSubject("agent.tool.result", (env) => {
      results.push(env);
    });
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

describe("JieAgentBody — agent.model.assigned publication", () => {
  test("publishes with effort 'off' for the agent's default thinkingLevel", () => {
    const h = makeHarness();
    const cap = makeFakeAgentFactory();
    cap.fake.state.thinkingLevel = "off";
    const received: EventEnvelope<"agent.model.assigned">[] = [];
    h.subscribeSubject("agent.model.assigned", (env) => {
      received.push(env);
    });
    h.makeBody({ model: makeModel("anthropic", "claude-sonnet-4"), factory: cap.factory });
    expect(received).toHaveLength(1);
    expect(received[0]!.payload).toEqual({ provider: "anthropic", model: "claude-sonnet-4", effort: "off" });
  });

  test("publishes with the mapped effort for a recognized thinkingLevel", () => {
    const h = makeHarness();
    const cap = makeFakeAgentFactory();
    cap.fake.state.thinkingLevel = "high";
    const received: EventEnvelope<"agent.model.assigned">[] = [];
    h.subscribeSubject("agent.model.assigned", (env) => {
      received.push(env);
    });
    h.makeBody({ model: makeModel("anthropic", "claude-sonnet-4"), factory: cap.factory });
    expect(received).toHaveLength(1);
    expect(received[0]!.payload).toEqual({ provider: "anthropic", model: "claude-sonnet-4", effort: "high" });
  });

  test("maps 'xhigh' thinkingLevel to 'max' effort", () => {
    const h = makeHarness();
    const cap = makeFakeAgentFactory();
    cap.fake.state.thinkingLevel = "xhigh";
    const received: EventEnvelope<"agent.model.assigned">[] = [];
    h.subscribeSubject("agent.model.assigned", (env) => {
      received.push(env);
    });
    h.makeBody({ model: makeModel("anthropic", "claude-sonnet-4"), factory: cap.factory });
    expect(received).toHaveLength(1);
    expect(received[0]!.payload.effort).toBe("max");
  });

  test("does not publish when no model is given", () => {
    const h = makeHarness();
    const received: EventEnvelope<"agent.model.assigned">[] = [];
    h.subscribeSubject("agent.model.assigned", (env) => {
      received.push(env);
    });
    h.makeBody();
    expect(received).toHaveLength(0);
  });
});

describe("JieAgentBody — start() subscriptions", () => {
  let h: Harness;
  let body: JieAgentBody;

  beforeEach(() => {
    h = makeHarness();
    body = h.makeBody();
  });

  afterEach(() => {
    body.stop();
  });

  test("subscribes to the static user.prompt topic", async () => {
    await body.start();
    let received = false;
    h.events.subscribe("user.prompt", () => {
      received = true;
    });
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "hi", "general-1"));
    expect(received).toBe(true);
  });

  test("each body subscribes to the shared user.prompt subject and filters by agentKey", async () => {
    const b2 = h.makeBody({ agentKey: "worker-1" });
    await b2.start();
    expect(h.events.subscriberCount("user.prompt")).toBe(1);
    b2.stop();
  });

  test("agent.interrupt addressed to this body aborts the active agent run", async () => {
    await body.start();
    h.state.isStreaming = true;
    h.events.publish(Events.agentInterrupt({ kind: "user" }, "t1", "general-1"));
    expect(h.abort).toHaveBeenCalledTimes(1);
  });

  test("agent.interrupt for another body is ignored", async () => {
    await body.start();
    h.state.isStreaming = true;
    h.events.publish(Events.agentInterrupt({ kind: "user" }, "t1", "worker-1"));
    h.events.publish(Events.agentInterrupt({ kind: "user" }, "t2", "general-1"));
    expect(h.abort).not.toHaveBeenCalled();
  });

  test("agent.interrupt is ignored when the body is idle", async () => {
    await body.start();
    h.events.publish(Events.agentInterrupt({ kind: "user" }, "t1", "general-1"));
    expect(h.abort).not.toHaveBeenCalled();
  });

  test("subscribes to each topic in soul.subscriptions", async () => {
    body.stop();
    const b2 = h.makeBody({
      soul: makeSoul({ subscribe: ["task.recorded"] }),
    });
    await b2.start();
    let received = false;
    h.events.subscribe("custom.t1.task.recorded", () => {
      received = true;
    });
    h.events.publish(Events.custom({ kind: "agent", teamId: "t1", agentKey: "general-1" }, "t1.task.recorded", "task"));
    expect(received).toBe(true);
    b2.stop();
  });

  test("ingestCustom drops self-published events (avoids feedback loop)", async () => {
    body.stop();
    const b2 = h.makeBody({
      soul: makeSoul({ subscribe: ["task.recorded"] }),
    });
    await b2.start();
    h.events.publish(Events.custom(
      { kind: "agent", teamId: "t1", agentKey: "general-1" },
      "t1.task.recorded",
      "do X",
    ));
    expect(h.prompt.mock.calls.length).toBe(0);
    b2.stop();
  });

  test("ingestCustom still dispatches events from a different agent", async () => {
    body.stop();
    const b2 = h.makeBody({
      soul: makeSoul({ subscribe: ["task.recorded"] }),
    });
    await b2.start();
    h.events.publish(Events.custom(
      { kind: "agent", teamId: "t1", agentKey: "leader-1" },
      "t1.task.recorded",
      "do X",
    ));
    expect(h.prompt.mock.calls.length).toBe(1);
    b2.stop();
  });
});

describe("JieAgentBody — start() restore + continue", () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
  });

  test("fresh session (no rows): no continue call", async () => {
    const body = h.makeBody();
    await body.start();
    expect(h.continue).not.toHaveBeenCalled();
    body.stop();
  });

  test("restore ends with `user`: agent.continue is called", async () => {
    h.persisted.push(
      { role: "user", content: "hi" } as unknown as AgentMessage,
      { role: "assistant", content: "hello" } as unknown as AgentMessage,
      { role: "user", content: "next" } as unknown as AgentMessage,
    );
    const body = h.makeBody();
    await body.start();
    expect(h.continue).toHaveBeenCalled();
    body.stop();
  });

  test("restore ends with `toolResult`: agent.continue is called", async () => {
    h.persisted.push(
      { role: "user", content: "x" } as unknown as AgentMessage,
      { role: "toolResult", content: "y" } as unknown as AgentMessage,
    );
    const body = h.makeBody();
    await body.start();
    expect(h.continue).toHaveBeenCalled();
    body.stop();
  });

  test("restore ends with `assistant`: continue NOT called", async () => {
    h.persisted.push(
      { role: "user", content: "hi" } as unknown as AgentMessage,
      { role: "assistant", content: "hello" } as unknown as AgentMessage,
    );
    const body = h.makeBody();
    await body.start();
    expect(h.continue).not.toHaveBeenCalled();
    body.stop();
  });

  test("restored messages are pushed into agent.state.messages", async () => {
    h.persisted.push(
      { role: "user", content: "m1" } as unknown as AgentMessage,
      { role: "assistant", content: "m2" } as unknown as AgentMessage,
    );
    const body = h.makeBody();
    await body.start();
    expect(h.state.messages).toHaveLength(2);
    body.stop();
  });
});

describe("JieAgentBody — restore() snapshot phase", () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
  });

  test("returns the persisted snapshot and loads it into agent.state.messages", async () => {
    h.persisted.push(
      { role: "user", content: "m1" } as unknown as AgentMessage,
      { role: "assistant", content: "m2" } as unknown as AgentMessage,
    );
    const body = h.makeBody();
    const snapshot = await body.restore();
    expect(snapshot).toHaveLength(2);
    expect(h.state.messages).toHaveLength(2);
    body.stop();
  });

  test("fresh session returns an empty snapshot and leaves state.messages untouched", async () => {
    const body = h.makeBody();
    const snapshot = await body.restore();
    expect(snapshot).toEqual([]);
    expect(h.state.messages).toEqual([]);
    body.stop();
  });

  test("does not call continue — that is start()'s job", async () => {
    h.persisted.push({ role: "user", content: "pending" } as unknown as AgentMessage);
    const body = h.makeBody();
    await body.restore();
    expect(h.continue).not.toHaveBeenCalled();
    body.stop();
  });

  test("is idempotent — a second call returns the cached snapshot without re-querying memory", async () => {
    h.persisted.push({ role: "user", content: "m1" } as unknown as AgentMessage);
    const body = h.makeBody();
    const first = await body.restore();
    const second = await body.restore();
    expect(second).toBe(first);
    expect(h.restore).toHaveBeenCalledTimes(1);
    body.stop();
  });

  test("snapshot is a defensive copy — mutating agent.state.messages does not alter it", async () => {
    h.persisted.push({ role: "user", content: "m1" } as unknown as AgentMessage);
    const body = h.makeBody();
    const snapshot = await body.restore();
    h.state.messages.push({ role: "assistant", content: "leaked" } as unknown as AgentMessage);
    expect(snapshot).toHaveLength(1);
    body.stop();
  });

  test("start() after restore() reuses the snapshot and still continues an interrupted turn", async () => {
    h.persisted.push({ role: "user", content: "pending" } as unknown as AgentMessage);
    const body = h.makeBody();
    await body.restore();
    await body.start();
    expect(h.restore).toHaveBeenCalledTimes(1);
    expect(h.continue).toHaveBeenCalled();
    body.stop();
  });
});

describe("JieAgentBody — prompt ingress format", () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
  });

  test("`agent.prompt` (no source) is formatted as `[user]: <prompt>`", async () => {
    const body = h.makeBody();
    await body.start();
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "hello", "general-1"));
    expect(h.prompt.mock.calls.length).toBeGreaterThan(0);
    const synthetic = h.prompt.mock.calls[0]![0] as AgentMessage;
    expect(synthetic.role).toBe("user");
    const content = (synthetic as { content: unknown }).content;
    expect(content).toBe("[user]: hello");
    body.stop();
  });

  test("notify-sourced event is formatted as `[<agentKey> on '<topic>']: <prompt>`", async () => {
    const body = h.makeBody({
      soul: makeSoul({ subscribe: ["task.researched"] }),
    });
    await body.start();
    h.events.publish(Events.custom({ kind: "agent", teamId: "t1", agentKey: "researcher-1" }, "t1.task.researched", "report"));
    const synthetic = h.prompt.mock.calls[0]![0] as AgentMessage;
    const content = (synthetic as { content: unknown }).content;
    expect(content).toBe(
      "[researcher-1 on 'task.researched']: report",
    );
    body.stop();
  });
});

describe("JieAgentBody — pi-agent event bridging", () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
  });

  test("turn_start publishes agent.turn.start with a null payload", () => {
    const turnStart: EventEnvelope<"agent.turn.start">[] = [];
    h.subscribeSubject("agent.turn.start", (env) => {
      turnStart.push(env);
    });
    h.makeBody();
    h.fireEvent({ type: "turn_start" });
    expect(turnStart).toHaveLength(1);
    expect(turnStart[0]!.topic).toBe("agent.turn.start");
    expect(turnStart[0]!.payload).toBeNull();
  });

  test("agent_end publishes agent.idle with the final stopReason", () => {
    const idle: EventEnvelope<"agent.idle">[] = [];
    h.subscribeSubject("agent.idle", (env) => {
      idle.push(env);
    });
    h.makeBody();
    h.fireEvent({ type: "agent_end", messages: [] });
    expect(idle).toHaveLength(1);
    expect(idle[0]!.payload).toBe("stop");
  });

  test("3 turns alternate strictly: turn_start, idle, turn_start, idle, ...", () => {
    const sequence: string[] = [];
    h.subscribeSubject("agent.turn.start", () => sequence.push("turn_start"));
    h.subscribeSubject("agent.idle", () => sequence.push("idle"));
    h.makeBody();
    for (let i = 0; i < 3; i++) {
      h.fireEvent({ type: "turn_start" });
      h.fireEvent({ type: "agent_end", messages: [] });
    }
    expect(sequence).toEqual([
      "turn_start",
      "idle",
      "turn_start",
      "idle",
      "turn_start",
      "idle",
    ]);
  });

  test("start() does not emit agent.turn.start or agent.idle", async () => {
    const idleEvents: unknown[] = [];
    const turnStartEvents: unknown[] = [];
    h.subscribeSubject("agent.idle", (env) => idleEvents.push(env));
    h.subscribeSubject("agent.turn.start", (env) => turnStartEvents.push(env));
    const body = h.makeBody();
    await body.start();
    expect(idleEvents).toHaveLength(0);
    expect(turnStartEvents).toHaveLength(0);
    body.stop();
  });

  test("message_start resets stream state: stream ids increment across streams", () => {
    const ends: EventEnvelope<"agent.stream.end">[] = [];
    h.subscribeSubject("agent.stream.end", (env) => {
      ends.push(env);
    });
    h.makeBody();
    for (let i = 0; i < 2; i++) {
      h.fireEvent({ type: "message_start", message: { role: "assistant", content: [] } as unknown as AssistantMessage });
      h.fireEvent({ type: "message_end", message: { role: "assistant", content: [] } as unknown as AssistantMessage });
    }
    expect(ends.map((env) => env.payload.stream_id)).toEqual([1, 2]);
  });

  test("message_update text_delta buffers text and flushes it on message_end", () => {
    const chunks: EventEnvelope<"agent.stream.chunk">[] = [];
    h.subscribeSubject("agent.stream.chunk", (env) => {
      chunks.push(env);
    });
    h.makeBody();
    h.fireEvent({ type: "message_start", message: { role: "assistant", content: [] } as unknown as AssistantMessage });
    h.fireEvent({
      type: "message_update",
      message: { role: "assistant", content: [] } as unknown as AssistantMessage,
      assistantMessageEvent: {
        type: "text_delta",
        contentIndex: 0,
        delta: "hello",
        partial: { role: "assistant", content: [] } as unknown as AssistantMessage,
      },
    });
    expect(chunks).toHaveLength(0);
    h.fireEvent({ type: "message_end", message: { role: "assistant", content: [] } as unknown as AssistantMessage });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.payload).toMatchObject({ stream_id: 1, seq: 0, block_type: "text", text: "hello" });
  });

  test("message_update thinking_delta publishes a chunk with block_type 'thinking'", () => {
    const chunks: EventEnvelope<"agent.stream.chunk">[] = [];
    h.subscribeSubject("agent.stream.chunk", (env) => {
      chunks.push(env);
    });
    h.makeBody();
    h.fireEvent({ type: "message_start", message: { role: "assistant", content: [] } as unknown as AssistantMessage });
    h.fireEvent({
      type: "message_update",
      message: { role: "assistant", content: [] } as unknown as AssistantMessage,
      assistantMessageEvent: {
        type: "thinking_delta",
        contentIndex: 0,
        delta: "hmm",
        partial: { role: "assistant", content: [] } as unknown as AssistantMessage,
      },
    });
    h.fireEvent({ type: "message_end", message: { role: "assistant", content: [] } as unknown as AssistantMessage });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.payload.block_type).toBe("thinking");
  });

  test("message_update text_delta flushes synchronously once the buffer reaches 64 chars", () => {
    const chunks: EventEnvelope<"agent.stream.chunk">[] = [];
    h.subscribeSubject("agent.stream.chunk", (env) => {
      chunks.push(env);
    });
    h.makeBody();
    h.fireEvent({ type: "message_start", message: { role: "assistant", content: [] } as unknown as AssistantMessage });
    const deltaEvent: AssistantMessageEvent = {
      type: "text_delta",
      contentIndex: 0,
      delta: "x".repeat(64),
      partial: { role: "assistant", content: [] } as unknown as AssistantMessage,
    };
    h.fireEvent({
      type: "message_update",
      message: { role: "assistant", content: [] } as unknown as AssistantMessage,
      assistantMessageEvent: deltaEvent,
    });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.payload).toMatchObject({
      stream_id: 1,
      seq: 0,
      block_type: "text",
      text: "x".repeat(64),
    });
  });

  test("message_end (assistant) publishes agent.stream.end", () => {
    const ends: EventEnvelope<"agent.stream.end">[] = [];
    h.subscribeSubject("agent.stream.end", (env) => {
      ends.push(env);
    });
    h.makeBody();
    h.fireEvent({ type: "message_start", message: { role: "assistant", content: [] } as unknown as AssistantMessage });
    h.fireEvent({ type: "message_end", message: { role: "assistant", content: [] } as unknown as AssistantMessage });
    expect(ends).toHaveLength(1);
    expect(ends[0]!.payload).toMatchObject({ stream_id: 1, total_chunks: 0 });
  });

  test("message_end with non-assistant role publishes no agent.stream.end", () => {
    const ends: EventEnvelope<"agent.stream.end">[] = [];
    h.subscribeSubject("agent.stream.end", (env) => {
      ends.push(env);
    });
    h.makeBody();
    h.fireEvent({
      type: "message_end",
      message: { role: "user", content: "hi" } as unknown as AgentMessage,
    });
    expect(ends).toHaveLength(0);
  });

  test("message_end persists every message role via memory.persist", async () => {
    const cases: Array<Record<string, unknown>> = [
      { role: "assistant", content: [{ type: "text", text: "x" }] },
      { role: "user", content: "hi" },
      { role: "toolResult", toolCallId: "call_x", content: "ok", isError: false, timestamp: 0 },
      { role: "custom", customType: "test", content: "x", display: false, timestamp: 0 },
    ];
    h.makeBody();
    for (const message of cases) {
      h.fireEvent({ type: "message_end", message: message as unknown as AgentMessage });
      await Promise.resolve();
      expect(h.persisted.length).toBe(1);
      h.persisted.length = 0;
    }
  });

  test("message_end persists the assistant message end-to-end (start + end)", async () => {
    h.makeBody();
    const msg = {
      role: "assistant",
      content: [{ type: "text", text: "hello" }],
      timestamp: 0,
    } as unknown as AssistantMessage;
    h.fireEvent({ type: "message_start", message: msg });
    h.fireEvent({ type: "message_end", message: msg });
    await Promise.resolve();
    expect(h.persisted).toHaveLength(1);
  });

  test("agent_end drains the queue: the dequeued message goes to followUp (not prompt)", async () => {
    const body = h.makeBody();
    await body.start();
    h.state.isStreaming = true;
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "queued msg", "general-1"));
    expect(h.followUp.mock.calls.length).toBe(0);
    expect(h.prompt.mock.calls.length).toBe(0);
    h.state.isStreaming = false;
    h.fireEvent({ type: "agent_end", messages: [] });
    expect(h.followUp.mock.calls.length).toBe(1);
    expect(h.prompt.mock.calls.length).toBe(0);
    body.stop();
  });

  test("agent_end with no queued message: followUp not called", () => {
    h.makeBody();
    h.fireEvent({ type: "agent_end", messages: [] });
    expect(h.followUp.mock.calls.length).toBe(0);
    expect(h.prompt.mock.calls.length).toBe(0);
  });

  test("turn_end does NOT publish agent.idle (fix #89: no spurious idle on sub-turns)", () => {
    let idleCount = 0;
    h.subscribeSubject("agent.idle", () => {
      idleCount += 1;
    });
    h.makeBody();
    h.fireEvent({
      type: "turn_end",
      message: { role: "assistant", content: [] } as unknown as AssistantMessage,
      toolResults: [],
    });
    expect(idleCount).toBe(0);
  });

  test("turn_end drains the queue via followUp (no idle publish) (#89)", async () => {
    const body = h.makeBody();
    await body.start();
    h.state.isStreaming = true;
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "queued msg", "general-1"));
    h.state.isStreaming = false;
    h.fireEvent({
      type: "turn_end",
      message: { role: "assistant", content: [] } as unknown as AssistantMessage,
      toolResults: [],
    });
    expect(h.followUp.mock.calls.length).toBe(1);
    expect(h.prompt.mock.calls.length).toBe(0);
    body.stop();
  });

  test("agent_end publishes agent.idle exactly once per run (#89)", () => {
    let idleCount = 0;
    h.subscribeSubject("agent.idle", () => {
      idleCount += 1;
    });
    h.makeBody();
    h.fireEvent({
      type: "turn_end",
      message: { role: "assistant", content: [] } as unknown as AssistantMessage,
      toolResults: [],
    });
    h.fireEvent({
      type: "turn_end",
      message: { role: "assistant", content: [] } as unknown as AssistantMessage,
      toolResults: [],
    });
    expect(idleCount).toBe(0);
    h.fireEvent({ type: "agent_end", messages: [] });
    expect(idleCount).toBe(1);
  });
});

describe("JieAgentBody — stop()", () => {
  test("stop() unsubscribes bus subscriptions registered via start()", async () => {
    const h = makeHarness();
    const body = h.makeBody();
    await body.start();
    expect(h.events.subscriberCount("user.prompt")).toBe(1);
    expect(h.events.subscriberCount("agent.interrupt")).toBe(1);
    body.stop();
    expect(h.events.subscriberCount("user.prompt")).toBe(0);
    expect(h.events.subscriberCount("agent.interrupt")).toBe(0);
  });

  test("start() is idempotent (second call does not re-subscribe)", async () => {
    const h = makeHarness();
    const body = h.makeBody();
    await body.start();
    const countAfterFirst = h.events.subscriberCount("user.prompt");
    await body.start();
    const countAfterSecond = h.events.subscriberCount("user.prompt");
    expect(countAfterFirst).toBe(countAfterSecond);
    body.stop();
  });
});
