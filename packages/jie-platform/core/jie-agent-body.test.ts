import {
  createCompactionSummaryMessage,
  type Agent as PiAgent,
  type AgentEvent as PiAgentEvent,
  type AgentMessage,
  type AfterToolCallContext,
  type BeforeToolCallContext,
  type ThinkingLevel,
} from "@earendil-works/pi-agent-core";
import type { Api, AssistantMessage, Model } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { JieAgentBody } from "./jie-agent-body";
import type { AgentBodyParams } from "./agent-body";
import type { CompactionInput, CompactionResult, Compactor } from "./compaction";
import { Events, type EventEnvelope, type EventManager, type EventType } from "../event";
import type { ArtifactStore, MemoryManager } from "../storage";
import type { ExecutionContext, Tool, ToolRegistry, ToolResult } from "../tools";
import type { Skill, SkillManager } from "../skills";
import type { HookRunner } from "../hooks";
import type { AgentSoul } from "../team";
import type { EffortLevel, TaskLifecycle, UserIngressMessage } from "../types";

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const noopCompactor: Compactor = {
  async compact() {
    return null;
  },
  fitToWindow(messages) {
    return messages;
  },
};

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
    skills: [],
    ...overrides,
  };
}

const deploySkill = vi.mocked<Skill>({
  name: "deploy",
  description: "Deploys the app",
  argumentHint: null,
  filePath: "/deploy/SKILL.md",
  baseDir: "/deploy",
  body: "Run the deploy pipeline.",
  expandInvocation: vi.fn(),
  promptEntry: vi.fn(),
});

const backupSkill = vi.mocked<Skill>({
  name: "backup",
  description: "Backs up the data",
  argumentHint: null,
  filePath: "/backup/SKILL.md",
  baseDir: "/backup",
  body: "Run the backup pipeline.",
  expandInvocation: vi.fn(),
  promptEntry: vi.fn(),
});

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

function makeUtilityTool(): Tool {
  return {
    name: "kanban_write",
    description: "update kanban",
    label: "Kanban",
    isUtility: true,
    parameters: Type.Object({}),
    async execute(): Promise<ToolResult> {
      return { content: "cards" };
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
    waitForIdle: ReturnType<typeof vi.fn>;
  };
  lastOpts: () => ConstructorParameters<typeof PiAgent>[0] | undefined;
  readonly agentListener: ((event: PiAgentEvent) => void) | undefined;
  settleIdle: () => void;
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
  let idlePromise: Promise<void> | undefined;
  let resolveIdle: (() => void) | undefined;
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
    waitForIdle: vi.fn((): Promise<void> => {
      if (idlePromise === undefined) {
        idlePromise = new Promise<void>((resolve) => {
          resolveIdle = resolve;
        });
      }
      return idlePromise;
    }),
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
    settleIdle: () => {
      resolveIdle?.();
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
  const memory = vi.mocked<MemoryManager>({
    persist,
    compact: vi.fn(),
    restore,
    hasSession: vi.fn(() => false),
    listSessions: vi.fn(() => []),
    sessionName: vi.fn(() => null),
    renameSession: vi.fn(),
  });
  return { memory, persisted, restore };
}

interface MakeBodyOverrides {
  agentKey?: string;
  teamId?: string;
  soul?: AgentSoul;
  isLeader?: boolean;
  sessionId?: string;
  model?: Model<Api>;
  effort?: EffortLevel;
  lifecycle?: TaskLifecycle | null;
  factory?: (opts: ConstructorParameters<typeof PiAgent>[0]) => PiAgent;
  systemContextBlock?: string;
  compactor?: Compactor;
  getApiKey?: (provider: string) => string | undefined;
}

interface Harness {
  events: EventManager;
  resolveModel: ReturnType<typeof vi.fn<(provider: string, modelId: string) => Model<Api> | undefined>>;
  toolRegistry: ReturnType<typeof vi.mocked<ToolRegistry>>;
  skillManager: ReturnType<typeof vi.mocked<SkillManager>>;
  hookRunner: ReturnType<typeof vi.mocked<HookRunner>>;
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
  settleIdle: () => void;
}

function makeFakeEventManager(): EventManager {
  const subscribers = new Map<string, Array<(env: EventEnvelope<EventType>) => void>>();
  return vi.mocked<EventManager>({
    publish: vi.fn((env: EventEnvelope<EventType>) => {
      for (const callback of subscribers.get(env.topic) ?? []) callback(env);
    }),
    subscribe: vi.fn((topic: string, callback: (env: EventEnvelope<EventType>) => void) => {
      const list = subscribers.get(topic) ?? [];
      list.push(callback);
      subscribers.set(topic, list);
      return () => {
        subscribers.set(topic, list.filter((cb) => cb !== callback));
      };
    }),
  });
}

function makeHarness(): Harness {
  const events: EventManager = makeFakeEventManager();
  const { memory, persisted, restore } = makeFakeMemory();
  const cap = makeFakeAgentFactory();
  const resolveModel = vi.fn<(provider: string, modelId: string) => Model<Api> | undefined>(() => undefined);
  const toolRegistry = vi.mocked<ToolRegistry>({
    register: vi.fn(),
    resolve: vi.fn(() => [makeNoopTool()]),
    list: vi.fn(() => []),
  });
  const skillManager = vi.mocked<SkillManager>({
    resolve: vi.fn(() => []),
    reload: vi.fn(),
  });
  const hookRunner = vi.mocked<HookRunner>({
    preToolUse: vi.fn(async () => ({ block: false, reason: null })),
    postToolUse: vi.fn(async () => ({ block: false, reason: null, additionalContext: null })),
    userPromptSubmit: vi.fn(async () => ({ block: false, reason: null, additionalContext: null })),
    sessionStart: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
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
      effort: overrides.effort ?? "off",
      lifecycle: overrides.lifecycle ?? null,
    };
    return new JieAgentBody(params, {
      eventManager: events,
      artifactStore,
      memory,
      toolRegistry,
      skillManager,
      systemContextBlock: overrides.systemContextBlock ?? "",
      hookRunner,
      cwd: "/work",
      getApiKey: overrides.getApiKey ?? (() => undefined),
      resolveModel,
      createAgent: overrides.factory ?? cap.factory,
      compactor: overrides.compactor ?? noopCompactor,
    });
  };
  const fireEvent = (event: PiAgentEvent): void => {
    const listener = cap.agentListener;
    if (listener === undefined) throw new Error("agent listener not captured");
    listener(event);
  };
  const settleIdle = (): void => {
    cap.fake.state.isStreaming = false;
    cap.settleIdle();
  };
  return {
    events,
    resolveModel,
    toolRegistry,
    skillManager,
    hookRunner,
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
    settleIdle,
  };
}

describe("JieAgentBody — system prompt composition", () => {
  beforeEach(() => {
    deploySkill.promptEntry.mockReturnValue("SKILL-ENTRY-deploy");
  });

  test("resolved skills are appended to the role prompt", () => {
    const h = makeHarness();
    h.skillManager.resolve.mockReturnValue([deploySkill]);
    h.makeBody({ soul: makeSoul({ skills: ["deploy"] }) });
    expect(h.skillManager.resolve).toHaveBeenCalledWith("deploy");
    expect(h.state.systemPrompt).toContain("you are a general assistant");
    expect(h.state.systemPrompt).toContain("SKILL-ENTRY-deploy");
  });

  test("no skills leaves the role prompt verbatim", () => {
    const h = makeHarness();
    h.makeBody({ soul: makeSoul() });
    expect(h.state.systemPrompt).toBe("you are a general assistant");
  });

  test("the shared context block is prepended before the role prompt", () => {
    const h = makeHarness();
    h.makeBody({ systemContextBlock: "<context_files>X</context_files>" });
    expect(h.state.systemPrompt).toBe("<context_files>X</context_files>\n\nyou are a general assistant");
  });
});

describe("JieAgentBody — identity", () => {
  test("identity reflects the params and the resolved model info", () => {
    const h = makeHarness();
    const body = h.makeBody({
      agentKey: "leader-1",
      isLeader: true,
      soul: makeSoul({ tools: ["notify", "read_file"], subscribe: ["task.recorded"] }),
      model: makeModel("anthropic", "claude-sonnet-4"),
    });
    expect(body.identity).toEqual({
      teamId: "t1",
      role: "general",
      agentKey: "leader-1",
      isLeader: true,
      tools: ["notify", "read_file"],
      subscribe: ["task.recorded"],
      skills: [],
      model: { provider: "anthropic", id: "claude-sonnet-4", effort: "off", contextWindow: 200000 },
    });
  });

  test("identity.skills carries the resolved skill metadata", () => {
    const h = makeHarness();
    h.skillManager.resolve.mockReturnValue([deploySkill]);
    const body = h.makeBody({ soul: makeSoul({ skills: ["dep*"] }) });
    expect(body.identity.skills).toEqual([{ name: "deploy", description: "Deploys the app", argumentHint: null }]);
  });

  test("identity.model is null when no model is given", () => {
    const h = makeHarness();
    const body = h.makeBody();
    expect(body.identity.model).toBeNull();
  });
});

describe("JieAgentBody — tool resolution", () => {
  test("construction fails when a tool spec resolves no tools", () => {
    const h = makeHarness();
    h.toolRegistry.resolve.mockReturnValue([]);
    expect(() => h.makeBody({
      teamId: "dev",
      soul: makeSoul({ role: "architect", tools: ["mcp:code-lens:*"] }),
    })).toThrow(expect.objectContaining({ code: "TOOL_SPEC_UNRESOLVED" }));
  });

  test("the error cites the role, team, and unresolved spec", () => {
    const h = makeHarness();
    h.toolRegistry.resolve.mockReturnValue([]);
    expect(() => h.makeBody({
      teamId: "dev",
      soul: makeSoul({ role: "architect", tools: ["mcp:code-lens:*"] }),
    })).toThrow("agent 'architect' (team 'dev'): tool spec 'mcp:code-lens:*' resolved no tools");
  });

  test("utility tools are implicitly assigned even when no soul spec lists them", () => {
    const h = makeHarness();
    const cap = makeFakeAgentFactory();
    h.toolRegistry.list.mockReturnValue([makeUtilityTool()]);
    h.makeBody({ soul: makeSoul({ tools: ["noop"] }), factory: cap.factory });
    const names = (cap.fake.state.tools as Array<{ name: string }>).map((t) => t.name);
    expect(names).toEqual(["noop", "kanban_write"]);
  });

  test("a utility tool already matched by a soul spec is not added twice", () => {
    const h = makeHarness();
    const cap = makeFakeAgentFactory();
    const utility = makeUtilityTool();
    h.toolRegistry.resolve.mockReturnValue([utility]);
    h.toolRegistry.list.mockReturnValue([utility]);
    h.makeBody({ soul: makeSoul({ tools: ["kanban_write"] }), factory: cap.factory });
    const names = (cap.fake.state.tools as Array<{ name: string }>).map((t) => t.name);
    expect(names).toEqual(["kanban_write"]);
  });

  test("a non-utility tool in the registry is not implicitly assigned", () => {
    const h = makeHarness();
    const cap = makeFakeAgentFactory();
    const utility = makeUtilityTool();
    h.toolRegistry.resolve.mockReturnValue([utility]);
    h.toolRegistry.list.mockReturnValue([makeNoopTool(), utility]);
    h.makeBody({ soul: makeSoul({ tools: ["kanban_write"] }), factory: cap.factory });
    const names = (cap.fake.state.tools as Array<{ name: string }>).map((t) => t.name);
    expect(names).toEqual(["kanban_write"]);
  });

  test("an empty soul tool list still receives the utility tools", () => {
    const h = makeHarness();
    const cap = makeFakeAgentFactory();
    h.toolRegistry.list.mockReturnValue([makeUtilityTool()]);
    h.makeBody({ factory: cap.factory });
    const names = (cap.fake.state.tools as Array<{ name: string }>).map((t) => t.name);
    expect(names).toEqual(["kanban_write"]);
  });
});

describe("JieAgentBody — execution context lifecycle wiring", () => {
  function makeCapturingTool(received: Array<ExecutionContext["lifecycle"]>): Tool {
    return {
      name: "noop",
      description: "no-op",
      label: "Noop",
      parameters: Type.Object({}),
      async execute(_input, executionContext): Promise<ToolResult> {
        received.push(executionContext.lifecycle);
        return { content: "ok" };
      },
    };
  }

  async function executeFirstTool(cap: FakeAgentCapture): Promise<void> {
    const adapted = (cap.fake.state.tools as Array<{ execute: (toolCallId: string, params: unknown) => Promise<unknown> }>)[0]!;
    await adapted.execute("call-1", {});
  }

  test("adapted tools receive the lifecycle declared on the body params", async () => {
    const h = makeHarness();
    const cap = makeFakeAgentFactory();
    const lifecycle: TaskLifecycle = {
      maxIterations: 2,
      permanentPhases: ["done"],
      transitions: [{ topic: "task.recorded", role: "dm", fromPhases: "any", toPhase: "recorded", iteration: "reset" }],
      writeGates: [],
    };
    const received: Array<TaskLifecycle | null> = [];
    h.toolRegistry.resolve.mockReturnValue([makeCapturingTool(received)]);
    h.makeBody({ soul: makeSoul({ tools: ["noop"] }), factory: cap.factory, lifecycle });
    await executeFirstTool(cap);
    expect(received).toEqual([lifecycle]);
  });

  test("adapted tools receive a null lifecycle when the team declares none", async () => {
    const h = makeHarness();
    const cap = makeFakeAgentFactory();
    const received: Array<TaskLifecycle | null> = [];
    h.toolRegistry.resolve.mockReturnValue([makeCapturingTool(received)]);
    h.makeBody({ soul: makeSoul({ tools: ["noop"] }), factory: cap.factory });
    await executeFirstTool(cap);
    expect(received).toEqual([null]);
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
    expect(typeof passed.streamFn).toBe("function");
    expect(typeof passed.convertToLlm).toBe("function");
  });

  test("convertToLlm maps a compactionSummary into a user message carrying the summary", async () => {
    const h = makeHarness();
    const cap = makeFakeAgentFactory();
    h.makeBody({ factory: cap.factory });
    const converter = cap.lastOpts()?.convertToLlm;
    if (converter === undefined) throw new Error("convertToLlm not provided");
    const converted = await converter([createCompactionSummaryMessage("the summary", 100, "2026-01-01T00:00:00.000Z")]);
    expect(converted).toHaveLength(1);
    const message = converted[0]!;
    if (message.role !== "user") throw new Error("expected a user message");
    const parts = message.content;
    if (typeof parts === "string") throw new Error("expected content parts");
    const first = parts[0];
    if (first === undefined || first.type !== "text") throw new Error("expected a text part");
    expect(first.text).toContain("compacted into the following summary");
    expect(first.text).toContain("the summary");
  });

  test("transformContext fits the history through compactor.fitToWindow with the live agent model", async () => {
    const h = makeHarness();
    const cap = makeFakeAgentFactory();
    type FitToWindow = (messages: ReadonlyArray<AgentMessage>, model: Model<Api>) => ReadonlyArray<AgentMessage>;
    const fitToWindow = vi.fn<FitToWindow>((messages) => messages);
    const compactor: Compactor = { compact: async () => null, fitToWindow };
    h.makeBody({ factory: cap.factory, compactor, model: makeModel("anthropic", "claude-sonnet-4") });
    const transform = cap.lastOpts()?.transformContext;
    if (transform === undefined) throw new Error("transformContext not provided");
    const hotSwapped = makeModel("lm-studio", "qwen3.5-2b");
    cap.fake.state.model = hotSwapped;
    const messages: AgentMessage[] = [{ role: "user", content: "hi", timestamp: 0 }];
    const result = await transform(messages);
    expect(fitToWindow).toHaveBeenCalledWith(messages, hotSwapped);
    expect(result).not.toBe(messages);
    expect(result).toEqual(messages);
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

  test("beforeToolCall is wired to PreToolUse gating through the tool-call observer", async () => {
    const h = makeHarness();
    const cap = makeFakeAgentFactory();
    h.hookRunner.preToolUse.mockResolvedValue({ block: true, reason: "denied" });
    h.makeBody({ factory: cap.factory });
    const hook = cap.lastOpts()?.beforeToolCall;
    if (hook === undefined) throw new Error("beforeToolCall not provided");
    const ctx: BeforeToolCallContext = {
      assistantMessage: makeAssistantMessage(),
      toolCall: { type: "toolCall", id: "c1", name: "bash", arguments: { command: "ls" } },
      args: { command: "ls" },
      context: makeAgentContext(),
    };
    expect(await hook(ctx)).toEqual({ block: true, reason: "denied" });
  });

  test("afterToolCall is wired to PostToolUse gating through the tool-call observer", async () => {
    const h = makeHarness();
    const cap = makeFakeAgentFactory();
    h.hookRunner.postToolUse.mockResolvedValue({ block: true, reason: "bad", additionalContext: null });
    h.makeBody({ factory: cap.factory });
    const hook = cap.lastOpts()?.afterToolCall;
    if (hook === undefined) throw new Error("afterToolCall not provided");
    const ctx: AfterToolCallContext = {
      assistantMessage: makeAssistantMessage(),
      toolCall: { type: "toolCall", id: "c1", name: "bash", arguments: { command: "ls" } },
      args: { command: "ls" },
      context: makeAgentContext(),
      result: { content: [{ type: "text", text: "ok" }], details: {}, terminate: false },
      isError: false,
    };
    expect(await hook(ctx)).toEqual({ isError: true, content: [{ type: "text", text: "bad" }] });
  });
});

describe("JieAgentBody — lifecycle hooks", () => {
  const identity = { sessionId: "s1", cwd: "/work", teamId: "t1", agentKey: "general-1", role: "general" };

  test("start() fires the SessionStart hook once with the body identity", async () => {
    const h = makeHarness();
    const body = h.makeBody();
    await body.start();
    expect(h.hookRunner.sessionStart).toHaveBeenCalledTimes(1);
    expect(h.hookRunner.sessionStart).toHaveBeenCalledWith({ identity });
    body.stop();
  });

  test("repeated start() fires SessionStart only once (start is idempotent)", async () => {
    const h = makeHarness();
    const body = h.makeBody();
    await body.start();
    await body.start();
    expect(h.hookRunner.sessionStart).toHaveBeenCalledTimes(1);
    body.stop();
  });

  test("agent_end fires the Stop hook with the body identity", () => {
    const h = makeHarness();
    h.makeBody();
    h.fireEvent({ type: "agent_end", messages: [] });
    expect(h.hookRunner.stop).toHaveBeenCalledTimes(1);
    expect(h.hookRunner.stop).toHaveBeenCalledWith({ identity });
  });

  test("UserPromptSubmit receives the prompt and identity before dispatch", async () => {
    const h = makeHarness();
    const body = h.makeBody();
    await body.start();
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "hello"));
    await flush();
    expect(h.hookRunner.userPromptSubmit).toHaveBeenCalledWith({ identity, prompt: "hello" });
    expect(h.prompt.mock.calls.length).toBe(1);
    body.stop();
  });

  test("a blocking UserPromptSubmit hook prevents dispatch and surfaces the reason as system.error", async () => {
    const h = makeHarness();
    h.hookRunner.userPromptSubmit.mockResolvedValue({ block: true, reason: "nope", additionalContext: null });
    const errors: EventEnvelope<"system.error">[] = [];
    h.subscribeSubject("system.error", (env) => {
      errors.push(env);
    });
    const body = h.makeBody();
    await body.start();
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "hello"));
    await flush();
    expect(h.prompt.mock.calls.length).toBe(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.payload.error).toBe("nope");
    body.stop();
  });

  test("a blocking UserPromptSubmit hook with no reason falls back to a default message", async () => {
    const h = makeHarness();
    h.hookRunner.userPromptSubmit.mockResolvedValue({ block: true, reason: null, additionalContext: null });
    const errors: EventEnvelope<"system.error">[] = [];
    h.subscribeSubject("system.error", (env) => {
      errors.push(env);
    });
    const body = h.makeBody();
    await body.start();
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "hello"));
    await flush();
    expect(h.prompt.mock.calls.length).toBe(0);
    expect(errors[0]!.payload.error).toBe("prompt blocked by UserPromptSubmit hook");
    body.stop();
  });

  test("UserPromptSubmit additionalContext is appended to the dispatched prompt", async () => {
    const h = makeHarness();
    h.hookRunner.userPromptSubmit.mockResolvedValue({ block: false, reason: null, additionalContext: "extra" });
    const body = h.makeBody();
    await body.start();
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "hello"));
    await flush();
    expect(h.prompt.mock.calls.length).toBe(1);
    const synthetic = h.prompt.mock.calls[0]![0] as AgentMessage;
    expect((synthetic as { content: unknown }).content).toBe("[user]: hello\n\nextra");
    body.stop();
  });
});

describe("JieAgentBody — agent.model.assigned publication", () => {
  test("publishes with effort 'off' when the effort param is 'off'", () => {
    const h = makeHarness();
    const cap = makeFakeAgentFactory();
    const received: EventEnvelope<"agent.model.assigned">[] = [];
    h.subscribeSubject("agent.model.assigned", (env) => {
      received.push(env);
    });
    h.makeBody({ model: makeModel("anthropic", "claude-sonnet-4"), factory: cap.factory });
    expect(received).toHaveLength(1);
    expect(received[0]!.payload).toEqual({ provider: "anthropic", model: "claude-sonnet-4", effort: "off", contextWindow: 200000 });
    expect(cap.fake.state.thinkingLevel).toBe("off");
  });

  test("sets the agent thinkingLevel from the effort param and publishes the same effort", () => {
    const h = makeHarness();
    const cap = makeFakeAgentFactory();
    const received: EventEnvelope<"agent.model.assigned">[] = [];
    h.subscribeSubject("agent.model.assigned", (env) => {
      received.push(env);
    });
    h.makeBody({ model: makeModel("anthropic", "claude-sonnet-4"), effort: "high", factory: cap.factory });
    expect(cap.fake.state.thinkingLevel).toBe("high");
    expect(received).toHaveLength(1);
    expect(received[0]!.payload).toEqual({ provider: "anthropic", model: "claude-sonnet-4", effort: "high", contextWindow: 200000 });
  });

  test("maps effort 'max' to the 'xhigh' thinkingLevel while reporting 'max' effort", () => {
    const h = makeHarness();
    const cap = makeFakeAgentFactory();
    const received: EventEnvelope<"agent.model.assigned">[] = [];
    h.subscribeSubject("agent.model.assigned", (env) => {
      received.push(env);
    });
    h.makeBody({ model: makeModel("anthropic", "claude-sonnet-4"), effort: "max", factory: cap.factory });
    expect(cap.fake.state.thinkingLevel).toBe("xhigh");
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
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "hi"));
    expect(received).toBe(true);
  });

  test("each body subscribes to the shared user.prompt subject and filters by agentKey", async () => {
    const cap2 = makeFakeAgentFactory();
    const b2 = h.makeBody({ agentKey: "worker-1", factory: cap2.factory });
    await body.start();
    await b2.start();
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "worker-1", "for worker"));
    await flush();
    expect(cap2.fake.prompt.mock.calls.length).toBe(1);
    expect(h.prompt.mock.calls.length).toBe(0);
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "for general"));
    await flush();
    expect(h.prompt.mock.calls.length).toBe(1);
    expect(cap2.fake.prompt.mock.calls.length).toBe(1);
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
    await flush();
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

describe("JieAgentBody — messages()", () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
  });

  test("returns the agent's current messages — empty before restore, live afterwards", async () => {
    const body = h.makeBody();
    expect(body.messages()).toEqual([]);
    h.persisted.push(
      { role: "user", content: "m1" } as unknown as AgentMessage,
      makeAssistantMessage({ content: [{ type: "text", text: "reply" }] }),
    );
    await body.restore();
    expect(body.messages()).toHaveLength(2);
    body.stop();
  });

  test("reflects conversation progress made after restore", async () => {
    const body = h.makeBody();
    await body.restore();
    h.state.messages.push(makeAssistantMessage({ content: [{ type: "text", text: "streamed" }] }));
    expect(body.messages()).toHaveLength(1);
    body.stop();
  });

  test("returns a snapshot — later agent progress does not alter a previously returned value", async () => {
    const body = h.makeBody();
    await body.restore();
    const before = body.messages();
    h.state.messages.push(makeAssistantMessage());
    expect(before).toHaveLength(0);
    expect(body.messages()).toHaveLength(1);
    body.stop();
  });
});

describe("JieAgentBody — skill invocation expansion", () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
    deploySkill.expandInvocation.mockReturnValue("EXPANDED");
  });

  test("a /skill: invocation of a resolved skill is expanded for the LLM message", async () => {
    h.skillManager.resolve.mockReturnValue([deploySkill]);
    const body = h.makeBody({ soul: makeSoul({ skills: ["deploy"] }) });
    await body.start();
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "/skill:deploy   now  "));
    await flush();
    expect(deploySkill.expandInvocation).toHaveBeenCalledWith("now");
    const synthetic = h.prompt.mock.calls[0]![0] as AgentMessage;
    expect((synthetic as { content: unknown }).content).toBe("[user]: EXPANDED");
    body.stop();
  });

  test("turn.start carries the raw invocation, not the expansion", async () => {
    h.skillManager.resolve.mockReturnValue([deploySkill]);
    const body = h.makeBody({ soul: makeSoul({ skills: ["deploy"] }) });
    await body.start();
    const turnStart: EventEnvelope<"agent.turn.start">[] = [];
    h.subscribeSubject("agent.turn.start", (env) => turnStart.push(env));
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "/skill:deploy now"));
    await flush();
    h.fireEvent({ type: "turn_start" });
    h.fireEvent({ type: "message_start", message: h.prompt.mock.calls[0]![0] as AgentMessage });
    expect(turnStart[0]!.payload).toBe("/skill:deploy now");
    body.stop();
  });

  test("the expanded message still carries the raw invocation as displayText", async () => {
    h.skillManager.resolve.mockReturnValue([deploySkill]);
    const body = h.makeBody({ soul: makeSoul({ skills: ["deploy"] }) });
    await body.start();
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "/skill:deploy now"));
    await flush();
    const synthetic = h.prompt.mock.calls[0]![0] as UserIngressMessage;
    expect(synthetic.displayText).toBe("/skill:deploy now");
    body.stop();
  });

  test("an invocation of a skill not in the resolved set passes through unchanged", async () => {
    const body = h.makeBody();
    await body.start();
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "/skill:deploy now"));
    await flush();
    const synthetic = h.prompt.mock.calls[0]![0] as AgentMessage;
    expect((synthetic as { content: unknown }).content).toBe("[user]: /skill:deploy now");
    body.stop();
  });

  test("the UserPromptSubmit hook sees the raw invocation; its context appends after the expansion", async () => {
    h.skillManager.resolve.mockReturnValue([deploySkill]);
    h.hookRunner.userPromptSubmit.mockResolvedValue({ block: false, reason: null, additionalContext: "extra" });
    const body = h.makeBody({ soul: makeSoul({ skills: ["deploy"] }) });
    await body.start();
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "/skill:deploy"));
    await flush();
    expect(h.hookRunner.userPromptSubmit).toHaveBeenCalledWith(expect.objectContaining({ prompt: "/skill:deploy" }));
    const synthetic = h.prompt.mock.calls[0]![0] as AgentMessage;
    const content = (synthetic as { content: unknown }).content as string;
    expect(content.endsWith("EXPANDED\n\nextra")).toBe(true);
    body.stop();
  });

  test("a name prefix does not match a resolved skill", async () => {
    h.skillManager.resolve.mockReturnValue([deploySkill]);
    const body = h.makeBody({ soul: makeSoul({ skills: ["deploy"] }) });
    await body.start();
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "/skill:dep now"));
    await flush();
    expect(deploySkill.expandInvocation).not.toHaveBeenCalled();
    const synthetic = h.prompt.mock.calls[0]![0] as AgentMessage;
    expect((synthetic as { content: unknown }).content).toBe("[user]: /skill:dep now");
    body.stop();
  });

  test("an empty skill name passes through unchanged", async () => {
    h.skillManager.resolve.mockReturnValue([deploySkill]);
    const body = h.makeBody({ soul: makeSoul({ skills: ["deploy"] }) });
    await body.start();
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "/skill: now"));
    await flush();
    const synthetic = h.prompt.mock.calls[0]![0] as AgentMessage;
    expect((synthetic as { content: unknown }).content).toBe("[user]: /skill: now");
    body.stop();
  });

  test("an invocation selects the matching skill from a multi-skill resolved set", async () => {
    backupSkill.expandInvocation.mockReturnValue("BACKUP-EXPANDED");
    h.skillManager.resolve.mockReturnValue([deploySkill, backupSkill]);
    const body = h.makeBody({ soul: makeSoul({ skills: ["deploy", "backup"] }) });
    await body.start();
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "/skill:backup now"));
    await flush();
    expect(deploySkill.expandInvocation).not.toHaveBeenCalled();
    expect(backupSkill.expandInvocation).toHaveBeenCalledWith("now");
    const synthetic = h.prompt.mock.calls[0]![0] as AgentMessage;
    expect((synthetic as { content: unknown }).content).toBe("[user]: BACKUP-EXPANDED");
    body.stop();
  });

  test("a newline separates the skill name from the args", async () => {
    h.skillManager.resolve.mockReturnValue([deploySkill]);
    const body = h.makeBody({ soul: makeSoul({ skills: ["deploy"] }) });
    await body.start();
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "/skill:deploy\nnow"));
    await flush();
    expect(deploySkill.expandInvocation).toHaveBeenCalledWith("now");
    const synthetic = h.prompt.mock.calls[0]![0] as AgentMessage;
    expect((synthetic as { content: unknown }).content).toBe("[user]: EXPANDED");
    body.stop();
  });

  test("a tab separates the skill name from the args", async () => {
    h.skillManager.resolve.mockReturnValue([deploySkill]);
    const body = h.makeBody({ soul: makeSoul({ skills: ["deploy"] }) });
    await body.start();
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "/skill:deploy\tnow"));
    await flush();
    expect(deploySkill.expandInvocation).toHaveBeenCalledWith("now");
    const synthetic = h.prompt.mock.calls[0]![0] as AgentMessage;
    expect((synthetic as { content: unknown }).content).toBe("[user]: EXPANDED");
    body.stop();
  });

  test("an invocation embedded mid-text is not expanded", async () => {
    h.skillManager.resolve.mockReturnValue([deploySkill]);
    const body = h.makeBody({ soul: makeSoul({ skills: ["deploy"] }) });
    await body.start();
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "please /skill:deploy now"));
    await flush();
    expect(deploySkill.expandInvocation).not.toHaveBeenCalled();
    const synthetic = h.prompt.mock.calls[0]![0] as AgentMessage;
    expect((synthetic as { content: unknown }).content).toBe("[user]: please /skill:deploy now");
    body.stop();
  });

  test("a bare /skill: without a name passes through unchanged", async () => {
    h.skillManager.resolve.mockReturnValue([deploySkill]);
    const body = h.makeBody({ soul: makeSoul({ skills: ["deploy"] }) });
    await body.start();
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "/skill:"));
    await flush();
    expect(deploySkill.expandInvocation).not.toHaveBeenCalled();
    const synthetic = h.prompt.mock.calls[0]![0] as AgentMessage;
    expect((synthetic as { content: unknown }).content).toBe("[user]: /skill:");
    body.stop();
  });

  test("a queued invocation keeps the expanded message and the raw queue display", async () => {
    h.skillManager.resolve.mockReturnValue([deploySkill]);
    const body = h.makeBody({ soul: makeSoul({ skills: ["deploy"] }) });
    await body.start();
    const queueUpdates: EventEnvelope<"agent.prompt.queue.update">[] = [];
    h.subscribeSubject("agent.prompt.queue.update", (env) => queueUpdates.push(env));
    h.state.isStreaming = true;
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "/skill:deploy now"));
    await flush();
    expect(queueUpdates[queueUpdates.length - 1]!.payload.prompts).toEqual([{ text: "/skill:deploy now", source: "user" }]);
    h.fireEvent({ type: "agent_end", messages: [] });
    h.settleIdle();
    await flush();
    const drained = h.prompt.mock.calls[0]![0] as AgentMessage;
    expect((drained as { content: unknown }).content).toBe("[user]: EXPANDED");
    body.stop();
  });
});

describe("JieAgentBody — pi-agent event bridging", () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
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

  test("agent_end drains the queue only after the run settles: the entry goes to prompt (not followUp)", async () => {
    const body = h.makeBody();
    await body.start();
    h.state.isStreaming = true;
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "queued msg"));
    await flush();
    expect(h.followUp.mock.calls.length).toBe(0);
    expect(h.prompt.mock.calls.length).toBe(0);
    h.fireEvent({ type: "agent_end", messages: [] });
    expect(h.followUp.mock.calls.length).toBe(0);
    expect(h.prompt.mock.calls.length).toBe(0);
    h.settleIdle();
    await flush();
    expect(h.followUp.mock.calls.length).toBe(0);
    expect(h.prompt.mock.calls.length).toBe(1);
    expect(h.prompt.mock.calls[0]![0]).toMatchObject({ role: "user", content: "[user]: queued msg" });
    body.stop();
  });

  test("a prompt ingested between agent_end dispatch and run settlement is drained after settle (no stuck prompt)", async () => {
    const body = h.makeBody();
    await body.start();
    let releaseHook: (() => void) | undefined;
    h.hookRunner.userPromptSubmit.mockReturnValueOnce(
      new Promise((resolve) => {
        releaseHook = () => resolve({ block: false, reason: null, additionalContext: null });
      }),
    );
    h.state.isStreaming = true;
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "racing prompt"));
    await flush();
    h.fireEvent({ type: "agent_end", messages: [] });
    releaseHook!();
    await flush();
    expect(h.prompt.mock.calls.length).toBe(0);
    expect(h.followUp.mock.calls.length).toBe(0);
    h.settleIdle();
    await flush();
    expect(h.prompt.mock.calls.length).toBe(1);
    expect(h.prompt.mock.calls[0]![0]).toMatchObject({ role: "user", content: "[user]: racing prompt" });
    body.stop();
  });

  test("an entry waiting at agent_end stays dequeueable until the run settles", async () => {
    const body = h.makeBody();
    await body.start();
    const queueUpdates: EventEnvelope<"agent.prompt.queue.update">[] = [];
    h.subscribeSubject("agent.prompt.queue.update", (env) => queueUpdates.push(env));
    h.state.isStreaming = true;
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "removable"));
    await flush();
    h.fireEvent({ type: "agent_end", messages: [] });
    h.events.publish(Events.userPromptDequeue({ kind: "user" }, "t1", "general-1", "removable"));
    expect(queueUpdates[queueUpdates.length - 1]!.payload.prompts).toEqual([]);
    h.settleIdle();
    await flush();
    expect(h.prompt.mock.calls.length).toBe(0);
    expect(h.followUp.mock.calls.length).toBe(0);
    body.stop();
  });

  test("successive runs drain the queue in arrival order", async () => {
    const body = h.makeBody();
    await body.start();
    h.state.isStreaming = true;
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "first"));
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "second"));
    await flush();
    h.fireEvent({ type: "agent_end", messages: [] });
    h.settleIdle();
    await flush();
    expect(h.prompt.mock.calls.length).toBe(1);
    h.state.isStreaming = true;
    h.fireEvent({ type: "agent_end", messages: [] });
    h.state.isStreaming = false;
    await flush();
    expect(h.prompt.mock.calls.length).toBe(2);
    expect(h.prompt.mock.calls[0]![0]).toMatchObject({ content: "[user]: first" });
    expect(h.prompt.mock.calls[1]![0]).toMatchObject({ content: "[user]: second" });
    body.stop();
  });

  test("agent_end with no queued message: neither followUp nor prompt is called", async () => {
    h.makeBody();
    h.fireEvent({ type: "agent_end", messages: [] });
    h.settleIdle();
    await flush();
    expect(h.followUp.mock.calls.length).toBe(0);
    expect(h.prompt.mock.calls.length).toBe(0);
  });

  test("turn_end drains the queue via followUp (no idle publish) (#89)", async () => {
    const body = h.makeBody();
    await body.start();
    h.state.isStreaming = true;
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "queued msg"));
    await flush();
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

  test("turn_end with an aborted turn does not feed followUp; the entry drains as a new run after settle", async () => {
    const body = h.makeBody();
    await body.start();
    h.state.isStreaming = true;
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "queued msg"));
    await flush();
    h.fireEvent({
      type: "turn_end",
      message: makeAssistantMessage({ stopReason: "aborted" }),
      toolResults: [],
    });
    expect(h.followUp.mock.calls.length).toBe(0);
    h.fireEvent({ type: "agent_end", messages: [] });
    expect(h.prompt.mock.calls.length).toBe(0);
    h.settleIdle();
    await flush();
    expect(h.prompt.mock.calls.length).toBe(1);
    expect(h.prompt.mock.calls[0]![0]).toMatchObject({ role: "user", content: "[user]: queued msg" });
    body.stop();
  });

  test("a new prompt submitted behind a leftover queue waits its turn", async () => {
    const body = h.makeBody();
    await body.start();
    h.state.isStreaming = true;
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "leftover"));
    await flush();
    h.fireEvent({
      type: "turn_end",
      message: makeAssistantMessage({ stopReason: "aborted" }),
      toolResults: [],
    });
    h.fireEvent({ type: "agent_end", messages: [] });
    h.state.isStreaming = false;
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "fresh"));
    await flush();
    expect(h.prompt.mock.calls.length).toBe(1);
    expect(h.prompt.mock.calls[0]![0]).toMatchObject({ content: "[user]: leftover" });
    h.settleIdle();
    await flush();
    expect(h.prompt.mock.calls.length).toBe(2);
    expect(h.prompt.mock.calls[1]![0]).toMatchObject({ content: "[user]: fresh" });
    body.stop();
  });
});

describe("JieAgentBody — turn.start prompt payload", () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
  });

  test("turn_start after an immediate user ingress carries the raw prompt", async () => {
    const body = h.makeBody();
    await body.start();
    const turnStart: EventEnvelope<"agent.turn.start">[] = [];
    h.subscribeSubject("agent.turn.start", (env) => turnStart.push(env));
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "hello"));
    await flush();
    h.fireEvent({ type: "turn_start" });
    h.fireEvent({ type: "message_start", message: h.prompt.mock.calls[0]![0] as AgentMessage });
    expect(turnStart).toHaveLength(1);
    expect(turnStart[0]!.payload).toBe("hello");
    body.stop();
  });

  test("the pending prompt is consumed once — a later turn_start carries null", async () => {
    const body = h.makeBody();
    await body.start();
    const turnStart: EventEnvelope<"agent.turn.start">[] = [];
    h.subscribeSubject("agent.turn.start", (env) => turnStart.push(env));
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "hello"));
    await flush();
    h.fireEvent({ type: "turn_start" });
    h.fireEvent({ type: "message_start", message: h.prompt.mock.calls[0]![0] as AgentMessage });
    h.fireEvent({ type: "message_end", message: makeAssistantMessage() });
    h.fireEvent({
      type: "turn_end",
      message: makeAssistantMessage(),
      toolResults: [],
    });
    h.fireEvent({ type: "agent_end", messages: [] });
    h.fireEvent({ type: "turn_start" });
    h.fireEvent({
      type: "turn_end",
      message: makeAssistantMessage(),
      toolResults: [],
    });
    expect(turnStart.map((env) => env.payload)).toEqual(["hello", null]);
    body.stop();
  });

  test("turn_start after a custom-source ingress carries a null prompt", async () => {
    const body = h.makeBody({ soul: makeSoul({ subscribe: ["task.researched"] }) });
    await body.start();
    const turnStart: EventEnvelope<"agent.turn.start">[] = [];
    h.subscribeSubject("agent.turn.start", (env) => turnStart.push(env));
    h.events.publish(Events.custom({ kind: "agent", teamId: "t1", agentKey: "researcher-1" }, "t1.task.researched", "report"));
    await flush();
    h.fireEvent({ type: "turn_start" });
    h.fireEvent({ type: "message_start", message: h.prompt.mock.calls[0]![0] as AgentMessage });
    expect(turnStart).toHaveLength(1);
    expect(turnStart[0]!.payload).toBeNull();
    body.stop();
  });

  test("queued ingress: the consuming turn_end hands the prompt to the next turn_start", async () => {
    const body = h.makeBody();
    await body.start();
    const turnStart: EventEnvelope<"agent.turn.start">[] = [];
    const queueUpdates: EventEnvelope<"agent.prompt.queue.update">[] = [];
    h.subscribeSubject("agent.turn.start", (env) => turnStart.push(env));
    h.subscribeSubject("agent.prompt.queue.update", (env) => queueUpdates.push(env));
    h.state.isStreaming = true;
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "first queued"));
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "second queued"));
    await flush();
    expect(queueUpdates[queueUpdates.length - 1]!.payload.prompts).toEqual([
      { text: "first queued", source: "user" },
      { text: "second queued", source: "user" },
    ]);
    h.state.isStreaming = false;
    h.fireEvent({
      type: "turn_end",
      message: { role: "assistant", content: [] } as unknown as AssistantMessage,
      toolResults: [],
    });
    expect(h.followUp.mock.calls.length).toBe(1);
    expect(queueUpdates[queueUpdates.length - 1]!.payload.prompts).toEqual([{ text: "second queued", source: "user" }]);
    h.fireEvent({ type: "turn_start" });
    h.fireEvent({ type: "message_start", message: h.followUp.mock.calls[0]![0] as AgentMessage });
    expect(turnStart[turnStart.length - 1]!.payload).toBe("first queued");
    body.stop();
  });

  test("agent_end draining the queue hands the prompt to the next turn_start", async () => {
    const body = h.makeBody();
    await body.start();
    const turnStart: EventEnvelope<"agent.turn.start">[] = [];
    h.subscribeSubject("agent.turn.start", (env) => turnStart.push(env));
    h.state.isStreaming = true;
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "queued msg"));
    await flush();
    h.fireEvent({ type: "agent_end", messages: [] });
    h.settleIdle();
    await flush();
    expect(h.prompt.mock.calls.length).toBe(1);
    h.fireEvent({ type: "turn_start" });
    h.fireEvent({ type: "message_start", message: h.prompt.mock.calls[0]![0] as AgentMessage });
    expect(turnStart[turnStart.length - 1]!.payload).toBe("queued msg");
    body.stop();
  });

  test("agent_end without a queue shift clears the pending prompt", async () => {
    const body = h.makeBody();
    await body.start();
    const turnStart: EventEnvelope<"agent.turn.start">[] = [];
    h.subscribeSubject("agent.turn.start", (env) => turnStart.push(env));
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "lost run"));
    await flush();
    h.fireEvent({ type: "agent_end", messages: [] });
    h.fireEvent({ type: "turn_start" });
    h.fireEvent({
      type: "turn_end",
      message: makeAssistantMessage(),
      toolResults: [],
    });
    expect(turnStart[turnStart.length - 1]!.payload).toBeNull();
    body.stop();
  });

  test("a followUp fed at turn_end labels its own turn, not the intervening tool-continuation turn", async () => {
    const body = h.makeBody();
    await body.start();
    const turnStart: EventEnvelope<"agent.turn.start">[] = [];
    h.subscribeSubject("agent.turn.start", (env) => turnStart.push(env));
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "first"));
    await flush();
    const firstMessage = h.prompt.mock.calls[0]![0] as AgentMessage;
    h.state.isStreaming = true;
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "second"));
    await flush();
    h.fireEvent({ type: "turn_start" });
    h.fireEvent({ type: "message_start", message: firstMessage });
    h.fireEvent({ type: "message_end", message: makeAssistantMessage() });
    h.fireEvent({ type: "turn_end", message: makeAssistantMessage({ stopReason: "toolUse" }), toolResults: [] });
    expect(h.followUp.mock.calls.length).toBe(1);
    const followUpMessage = h.followUp.mock.calls[0]![0] as AgentMessage;
    h.fireEvent({ type: "turn_start" });
    h.fireEvent({ type: "message_start", message: makeAssistantMessage() });
    h.fireEvent({ type: "message_end", message: makeAssistantMessage({ stopReason: "toolUse" }) });
    h.fireEvent({ type: "turn_end", message: makeAssistantMessage({ stopReason: "toolUse" }), toolResults: [] });
    h.fireEvent({ type: "turn_start" });
    h.fireEvent({ type: "message_start", message: followUpMessage });
    expect(turnStart.map((env) => env.payload)).toEqual(["first", null, "second"]);
    body.stop();
  });

  test("a followUp-fed peer notification keeps a null turn.start payload", async () => {
    const body = h.makeBody({ soul: makeSoul({ subscribe: ["task.recorded"] }) });
    await body.start();
    const turnStart: EventEnvelope<"agent.turn.start">[] = [];
    h.subscribeSubject("agent.turn.start", (env) => turnStart.push(env));
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "first"));
    await flush();
    h.state.isStreaming = true;
    h.events.publish(Events.custom({ kind: "agent", teamId: "t1", agentKey: "leader-1" }, "t1.task.recorded", "do X"));
    await flush();
    h.fireEvent({ type: "turn_start" });
    h.fireEvent({ type: "message_start", message: h.prompt.mock.calls[0]![0] as AgentMessage });
    h.fireEvent({ type: "message_end", message: makeAssistantMessage() });
    h.fireEvent({ type: "turn_end", message: makeAssistantMessage({ stopReason: "toolUse" }), toolResults: [] });
    const followUpMessage = h.followUp.mock.calls[0]![0] as AgentMessage;
    h.fireEvent({ type: "turn_start" });
    h.fireEvent({ type: "message_start", message: followUpMessage });
    expect(turnStart.map((env) => env.payload)).toEqual(["first", null]);
    body.stop();
  });

  test("queue snapshots carry the raw user text without the synthetic prefix", async () => {
    const body = h.makeBody();
    await body.start();
    const queueUpdates: EventEnvelope<"agent.prompt.queue.update">[] = [];
    h.subscribeSubject("agent.prompt.queue.update", (env) => queueUpdates.push(env));
    h.state.isStreaming = true;
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "hello"));
    await flush();
    expect(queueUpdates[queueUpdates.length - 1]!.payload.prompts).toEqual([{ text: "hello", source: "user" }]);
    body.stop();
  });
});

describe("JieAgentBody — user.prompt.dequeue", () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
  });

  test("dequeue addressed to another agent or team is ignored", async () => {
    const body = h.makeBody();
    await body.start();
    const queueUpdates: EventEnvelope<"agent.prompt.queue.update">[] = [];
    h.subscribeSubject("agent.prompt.queue.update", (env) => queueUpdates.push(env));
    h.state.isStreaming = true;
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "first"));
    await flush();
    const countBefore = queueUpdates.length;
    h.events.publish(Events.userPromptDequeue({ kind: "user" }, "t1", "worker-1", "first"));
    h.events.publish(Events.userPromptDequeue({ kind: "user" }, "t2", "general-1", "first"));
    expect(queueUpdates.length).toBe(countBefore);
    body.stop();
  });

  test("stop() unsubscribes from user.prompt.dequeue", async () => {
    const body = h.makeBody();
    await body.start();
    const queueUpdates: EventEnvelope<"agent.prompt.queue.update">[] = [];
    h.subscribeSubject("agent.prompt.queue.update", (env) => queueUpdates.push(env));
    h.state.isStreaming = true;
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "first"));
    await flush();
    const countBefore = queueUpdates.length;
    body.stop();
    h.events.publish(Events.userPromptDequeue({ kind: "user" }, "t1", "general-1", "first"));
    expect(queueUpdates.length).toBe(countBefore);
  });
});

describe("JieAgentBody — user.prompt.requeue", () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
  });

  test("restores a dequeued user prompt to the queue tail and republishes the snapshot", async () => {
    const body = h.makeBody();
    await body.start();
    const queueUpdates: EventEnvelope<"agent.prompt.queue.update">[] = [];
    h.subscribeSubject("agent.prompt.queue.update", (env) => queueUpdates.push(env));
    h.state.isStreaming = true;
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "first"));
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "second"));
    await flush();
    h.events.publish(Events.userPromptDequeue({ kind: "user" }, "t1", "general-1", "second"));
    h.events.publish(Events.userPromptRequeue({ kind: "user" }, "t1", "general-1", "second"));
    expect(queueUpdates[queueUpdates.length - 1]!.payload.prompts).toEqual([
      { text: "first", source: "user" },
      { text: "second", source: "user" },
    ]);
    body.stop();
  });

  test("a resubmitted dequeued prompt is consumed and not restored a second time", async () => {
    const body = h.makeBody();
    await body.start();
    const queueUpdates: EventEnvelope<"agent.prompt.queue.update">[] = [];
    h.subscribeSubject("agent.prompt.queue.update", (env) => queueUpdates.push(env));
    h.state.isStreaming = true;
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "first"));
    await flush();
    h.events.publish(Events.userPromptDequeue({ kind: "user" }, "t1", "general-1", "first"));
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "first"));
    await flush();
    h.events.publish(Events.userPromptRequeue({ kind: "user" }, "t1", "general-1", "first"));
    expect(queueUpdates[queueUpdates.length - 1]!.payload.prompts).toEqual([{ text: "first", source: "user" }]);
    body.stop();
  });

  test("requeue addressed to another agent or team is ignored", async () => {
    const body = h.makeBody();
    await body.start();
    const queueUpdates: EventEnvelope<"agent.prompt.queue.update">[] = [];
    h.subscribeSubject("agent.prompt.queue.update", (env) => queueUpdates.push(env));
    h.state.isStreaming = true;
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "first"));
    await flush();
    h.events.publish(Events.userPromptDequeue({ kind: "user" }, "t1", "general-1", "first"));
    const countBefore = queueUpdates.length;
    h.events.publish(Events.userPromptRequeue({ kind: "user" }, "t1", "worker-1", "first"));
    h.events.publish(Events.userPromptRequeue({ kind: "user" }, "t2", "general-1", "first"));
    expect(queueUpdates.length).toBe(countBefore);
    body.stop();
  });

  test("stop() unsubscribes from user.prompt.requeue", async () => {
    const body = h.makeBody();
    await body.start();
    const queueUpdates: EventEnvelope<"agent.prompt.queue.update">[] = [];
    h.subscribeSubject("agent.prompt.queue.update", (env) => queueUpdates.push(env));
    h.state.isStreaming = true;
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "first"));
    await flush();
    h.events.publish(Events.userPromptDequeue({ kind: "user" }, "t1", "general-1", "first"));
    const countBefore = queueUpdates.length;
    body.stop();
    h.events.publish(Events.userPromptRequeue({ kind: "user" }, "t1", "general-1", "first"));
    expect(queueUpdates.length).toBe(countBefore);
  });

});

describe("JieAgentBody — user.effort.update", () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
  });

  test("updates the agent thinkingLevel and republishes agent.model.assigned with the new effort", async () => {
    const body = h.makeBody({ model: makeModel("anthropic", "claude-sonnet-4") });
    await body.start();
    const received: EventEnvelope<"agent.model.assigned">[] = [];
    h.subscribeSubject("agent.model.assigned", (env) => received.push(env));
    h.events.publish(Events.userEffortUpdate({ kind: "user" }, "high"));
    expect(h.state.thinkingLevel).toBe("high");
    expect(received).toHaveLength(1);
    expect(received[0]!.payload).toEqual({ provider: "anthropic", model: "claude-sonnet-4", effort: "high", contextWindow: 200000 });
    body.stop();
  });

  test("maps effort 'max' to the 'xhigh' thinkingLevel while reporting 'max'", async () => {
    const body = h.makeBody({ model: makeModel("anthropic", "claude-sonnet-4") });
    await body.start();
    h.events.publish(Events.userEffortUpdate({ kind: "user" }, "max"));
    expect(h.state.thinkingLevel).toBe("xhigh");
    body.stop();
  });

  test("identity.model reflects the updated effort", async () => {
    const body = h.makeBody({ model: makeModel("anthropic", "claude-sonnet-4") });
    await body.start();
    h.events.publish(Events.userEffortUpdate({ kind: "user" }, "medium"));
    expect(body.identity.model).toEqual({ provider: "anthropic", id: "claude-sonnet-4", effort: "medium", contextWindow: 200000 });
    body.stop();
  });

  test("without a model the thinkingLevel still updates but nothing is republished", async () => {
    const body = h.makeBody();
    await body.start();
    const received: EventEnvelope<"agent.model.assigned">[] = [];
    h.subscribeSubject("agent.model.assigned", (env) => received.push(env));
    h.events.publish(Events.userEffortUpdate({ kind: "user" }, "low"));
    expect(h.state.thinkingLevel).toBe("low");
    expect(received).toHaveLength(0);
    body.stop();
  });

  test("applies to every live body regardless of team and agent key", async () => {
    const cap2 = makeFakeAgentFactory();
    const second = h.makeBody({ agentKey: "worker-1", teamId: "t2", factory: cap2.factory });
    const body = h.makeBody();
    await body.start();
    await second.start();
    h.events.publish(Events.userEffortUpdate({ kind: "user" }, "high"));
    expect(h.state.thinkingLevel).toBe("high");
    expect(cap2.fake.state.thinkingLevel).toBe("high");
    body.stop();
    second.stop();
  });

  test("stop() unsubscribes from user.effort.update", async () => {
    const body = h.makeBody();
    await body.start();
    body.stop();
    h.events.publish(Events.userEffortUpdate({ kind: "user" }, "high"));
    expect(h.state.thinkingLevel).toBe("off");
  });
});

describe("JieAgentBody — user.model.update", () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
  });

  test("swaps the agent model and republishes agent.model.assigned with the new model", async () => {
    const nextModel = makeModel("lm-studio", "qwen3.5-2b");
    h.resolveModel.mockReturnValue(nextModel);
    const body = h.makeBody({ soul: makeSoul({ model: "" }), model: makeModel("anthropic", "claude-sonnet-4") });
    await body.start();
    const received: EventEnvelope<"agent.model.assigned">[] = [];
    h.subscribeSubject("agent.model.assigned", (env) => received.push(env));
    h.events.publish(Events.userModelUpdate({ kind: "user" }, "lm-studio", "qwen3.5-2b"));
    expect(h.resolveModel).toHaveBeenCalledWith("lm-studio", "qwen3.5-2b");
    expect(h.state.model).toBe(nextModel);
    expect(received).toHaveLength(1);
    expect(received[0]!.payload).toEqual({ provider: "lm-studio", model: "qwen3.5-2b", effort: "off", contextWindow: 200000 });
    expect(body.identity.model).toEqual({ provider: "lm-studio", id: "qwen3.5-2b", effort: "off", contextWindow: 200000 });
    body.stop();
  });

  test("preserves the current effort across the swap", async () => {
    h.resolveModel.mockReturnValue(makeModel("lm-studio", "qwen3.5-2b"));
    const body = h.makeBody({ soul: makeSoul({ model: "" }), model: makeModel("anthropic", "claude-sonnet-4"), effort: "high" });
    await body.start();
    const received: EventEnvelope<"agent.model.assigned">[] = [];
    h.subscribeSubject("agent.model.assigned", (env) => received.push(env));
    h.events.publish(Events.userModelUpdate({ kind: "user" }, "lm-studio", "qwen3.5-2b"));
    expect(received).toHaveLength(1);
    expect(received[0]!.payload).toEqual({ provider: "lm-studio", model: "qwen3.5-2b", effort: "high", contextWindow: 200000 });
    body.stop();
  });

  test("ignores the update when the soul pins a model", async () => {
    const pinned = makeModel("anthropic", "claude-sonnet-4");
    const body = h.makeBody({ model: pinned });
    await body.start();
    const received: EventEnvelope<"agent.model.assigned">[] = [];
    h.subscribeSubject("agent.model.assigned", (env) => received.push(env));
    h.events.publish(Events.userModelUpdate({ kind: "user" }, "lm-studio", "qwen3.5-2b"));
    expect(h.resolveModel).not.toHaveBeenCalled();
    expect(h.state.model).toBe(pinned);
    expect(received).toHaveLength(0);
    expect(body.identity.model).toEqual({ provider: "anthropic", id: "claude-sonnet-4", effort: "off", contextWindow: 200000 });
    body.stop();
  });

  test("ignores an unresolvable model reference", async () => {
    const initial = makeModel("anthropic", "claude-sonnet-4");
    const body = h.makeBody({ soul: makeSoul({ model: "" }), model: initial });
    await body.start();
    const received: EventEnvelope<"agent.model.assigned">[] = [];
    h.subscribeSubject("agent.model.assigned", (env) => received.push(env));
    h.events.publish(Events.userModelUpdate({ kind: "user" }, "lm-studio", "no-such-model"));
    expect(h.resolveModel).toHaveBeenCalledWith("lm-studio", "no-such-model");
    expect(h.state.model).toBe(initial);
    expect(received).toHaveLength(0);
    body.stop();
  });

  test("stop() unsubscribes from user.model.update", async () => {
    h.resolveModel.mockReturnValue(makeModel("lm-studio", "qwen3.5-2b"));
    const body = h.makeBody({ soul: makeSoul({ model: "" }), model: makeModel("anthropic", "claude-sonnet-4") });
    await body.start();
    body.stop();
    h.events.publish(Events.userModelUpdate({ kind: "user" }, "lm-studio", "qwen3.5-2b"));
    expect(h.resolveModel).not.toHaveBeenCalled();
  });
});

describe("JieAgentBody — compaction", () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
  });

  function makeUserMessage(content: string): AgentMessage {
    return { role: "user", content, timestamp: 0 };
  }

  function makeFakeCompactor(): { compactor: Compactor; compact: ReturnType<typeof vi.fn<(input: CompactionInput) => Promise<CompactionResult | null>>> } {
    const compact = vi.fn<(input: CompactionInput) => Promise<CompactionResult | null>>(async () => null);
    const compactor: Compactor = { compact, fitToWindow: (messages) => messages };
    return { compactor, compact };
  }

  test("agent_end settle compacts and rewrites state to [summary, ...retainedTail]", async () => {
    const { compactor, compact } = makeFakeCompactor();
    const model = makeModel("anthropic", "claude-sonnet-4");
    const body = h.makeBody({ model, compactor });
    await body.start();
    const second = makeAssistantMessage({ content: [{ type: "text", text: "m2" }] });
    const third = makeUserMessage("m3");
    h.state.messages = [makeUserMessage("m1"), second, third];
    const summary = createCompactionSummaryMessage("the summary", 500, "2026-01-01T00:00:00.000Z");
    compact.mockResolvedValueOnce({ summaryMessage: summary, firstKeptIndex: 1, tokensBefore: 500 });
    h.fireEvent({ type: "agent_end", messages: [] });
    h.settleIdle();
    await flush();
    expect(compact).toHaveBeenCalledTimes(1);
    expect(h.state.messages).toEqual([summary, second, third]);
    body.stop();
  });

  test("agent_end settle compacts even with an empty queue", async () => {
    const { compactor, compact } = makeFakeCompactor();
    const body = h.makeBody({ model: makeModel("anthropic", "claude-sonnet-4"), compactor });
    h.fireEvent({ type: "agent_end", messages: [] });
    h.settleIdle();
    await flush();
    expect(compact).toHaveBeenCalledTimes(1);
    body.stop();
  });

  test("without a model compaction is skipped and the prompt still dispatches", async () => {
    const { compactor, compact } = makeFakeCompactor();
    const body = h.makeBody({ compactor });
    await body.start();
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "hello"));
    await flush();
    expect(compact).not.toHaveBeenCalled();
    expect(h.prompt.mock.calls.length).toBe(1);
    body.stop();
  });

  test("compaction resolves the api key from the model provider", async () => {
    const { compactor, compact } = makeFakeCompactor();
    const body = h.makeBody({
      model: makeModel("anthropic", "claude-sonnet-4"),
      compactor,
      getApiKey: (provider) => `key-for-${provider}`,
    });
    h.fireEvent({ type: "agent_end", messages: [] });
    h.settleIdle();
    await flush();
    expect(compact.mock.calls[0]![0]!.apiKey).toBe("key-for-anthropic");
    body.stop();
  });

  test("dispatch waits for an in-flight compaction before prompting", async () => {
    const { compactor, compact } = makeFakeCompactor();
    let release: ((result: CompactionResult | null) => void) | undefined;
    compact.mockReturnValueOnce(new Promise<CompactionResult | null>((resolve) => {
      release = resolve;
    }));
    const body = h.makeBody({ model: makeModel("anthropic", "claude-sonnet-4"), compactor });
    await body.start();
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "hello"));
    await flush();
    expect(h.prompt.mock.calls.length).toBe(0);
    release!(null);
    await flush();
    expect(h.prompt.mock.calls.length).toBe(1);
    body.stop();
  });

  test("settle and dispatch share one in-flight compaction", async () => {
    const { compactor, compact } = makeFakeCompactor();
    let release: ((result: CompactionResult | null) => void) | undefined;
    compact.mockReturnValueOnce(new Promise<CompactionResult | null>((resolve) => {
      release = resolve;
    }));
    const body = h.makeBody({ model: makeModel("anthropic", "claude-sonnet-4"), compactor });
    await body.start();
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "hello"));
    await flush();
    expect(compact).toHaveBeenCalledTimes(1);
    h.fireEvent({ type: "agent_end", messages: [] });
    h.settleIdle();
    await flush();
    release!(null);
    await flush();
    expect(compact).toHaveBeenCalledTimes(1);
    expect(h.prompt.mock.calls.length).toBe(1);
    body.stop();
  });

  test("stop() aborts an in-flight compaction without publishing an error", async () => {
    const { compactor, compact } = makeFakeCompactor();
    let captured: AbortSignal | undefined;
    compact.mockImplementationOnce((input) => {
      captured = input.signal;
      return new Promise<CompactionResult | null>((_resolve, reject) => {
        input.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      });
    });
    const errors: EventEnvelope<"system.error">[] = [];
    h.subscribeSubject("system.error", (env) => errors.push(env));
    const body = h.makeBody({ model: makeModel("anthropic", "claude-sonnet-4"), compactor });
    await body.start();
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "hello"));
    await flush();
    if (captured === undefined) throw new Error("compaction signal not captured");
    expect(captured.aborted).toBe(false);
    body.stop();
    expect(captured.aborted).toBe(true);
    await flush();
    expect(errors).toHaveLength(0);
  });

  test("a compaction that resolves after stop() neither rewrites the history nor publishes", async () => {
    const { compactor, compact } = makeFakeCompactor();
    let release: ((result: CompactionResult | null) => void) | undefined;
    compact.mockReturnValueOnce(new Promise<CompactionResult | null>((resolve) => {
      release = resolve;
    }));
    const compacted: EventEnvelope<"agent.compacted">[] = [];
    h.subscribeSubject("agent.compacted", (env) => compacted.push(env));
    const body = h.makeBody({ model: makeModel("anthropic", "claude-sonnet-4"), compactor });
    await body.start();
    const first = makeUserMessage("m1");
    const second = makeAssistantMessage({ content: [{ type: "text", text: "m2" }] });
    h.state.messages = [first, second];
    h.fireEvent({ type: "agent_end", messages: [] });
    h.settleIdle();
    await flush();
    expect(compact).toHaveBeenCalledTimes(1);
    body.stop();
    release!({
      summaryMessage: createCompactionSummaryMessage("the summary", 500, "2026-01-01T00:00:00.000Z"),
      firstKeptIndex: 1,
      tokensBefore: 500,
    });
    await flush();
    expect(compacted).toHaveLength(0);
    expect(h.state.messages).toEqual([first, second]);
  });

  test("a failed compaction publishes system.error and leaves the history untouched", async () => {
    const { compactor, compact } = makeFakeCompactor();
    compact.mockRejectedValueOnce(new Error("boom"));
    const errors: EventEnvelope<"system.error">[] = [];
    h.subscribeSubject("system.error", (env) => errors.push(env));
    const body = h.makeBody({ model: makeModel("anthropic", "claude-sonnet-4"), compactor });
    await body.start();
    const first = makeUserMessage("m1");
    const second = makeAssistantMessage({ content: [{ type: "text", text: "m2" }] });
    h.state.messages = [first, second];
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "hello"));
    await flush();
    expect(errors).toHaveLength(1);
    expect(errors[0]!.payload.error).toContain("boom");
    expect(h.prompt.mock.calls.length).toBe(1);
    expect(h.state.messages).toEqual([first, second]);
    body.stop();
  });
});

describe("JieAgentBody — stop()", () => {
  test("stop() unsubscribes bus subscriptions registered via start()", async () => {
    const h = makeHarness();
    const body = h.makeBody();
    await body.start();
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "before stop"));
    await flush();
    h.state.isStreaming = true;
    h.events.publish(Events.agentInterrupt({ kind: "user" }, "t1", "general-1"));
    expect(h.prompt.mock.calls.length).toBe(1);
    expect(h.abort.mock.calls.length).toBe(1);
    body.stop();
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "after stop"));
    await flush();
    h.events.publish(Events.agentInterrupt({ kind: "user" }, "t1", "general-1"));
    expect(h.prompt.mock.calls.length).toBe(1);
    expect(h.abort.mock.calls.length).toBe(1);
  });

  test("stop() during start()'s drain wait ends start() without draining the queue", async () => {
    const h = makeHarness();
    let releaseRestore: ((messages: AgentMessage[]) => void) | undefined;
    h.restore.mockReturnValueOnce(new Promise<AgentMessage[]>((resolve) => {
      releaseRestore = resolve;
    }));
    const body = h.makeBody();
    const startPromise = body.start();
    await flush();
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "first"));
    await flush();
    expect(h.prompt.mock.calls.length).toBe(1);
    h.state.isStreaming = true;
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "second"));
    await flush();
    releaseRestore!([]);
    await flush();
    body.stop();
    h.settleIdle();
    await startPromise;
    expect(h.prompt.mock.calls.length).toBe(1);
  });

  test("start() is idempotent (second call does not re-subscribe)", async () => {
    const h = makeHarness();
    const body = h.makeBody();
    await body.start();
    await body.start();
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "once"));
    await flush();
    expect(h.prompt.mock.calls.length).toBe(1);
    body.stop();
  });
});
