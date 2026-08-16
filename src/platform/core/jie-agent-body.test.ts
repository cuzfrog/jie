import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createCompactionSummaryMessage,
  estimateTokens,
  type Agent as PiAgent,
  type AgentEvent as PiAgentEvent,
  type AgentMessage,
  type BeforeToolCallContext,
  type PrepareNextTurnContext,
  type ThinkingLevel,
} from "@earendil-works/pi-agent-core";
import type { Api, AssistantMessage, AssistantMessageEventStream, AuthResult, Context, Model } from "@earendil-works/pi-ai";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import { Type } from "typebox";
import { JieAgentBody } from "./jie-agent-body";
import type { AgentBodyParams } from "./agent-body";
import type { CompactionInput, CompactionResult, Compactor } from "./compaction";
import { Events, type EventEnvelope, type EventManager, type EventType } from "../event";
import type { MemoryManager } from "../memory";
import type { ArtifactStore, TranscriptStore } from "../storage";
import type { ExecutionContext, Tool, ToolRegistry, ToolResult } from "../tools";
import type { Skill, SkillManager } from "../skills";
import type { HookRunner } from "../hooks";
import type { AgentSoul } from "../team";
import { isModelAlias } from "../types";
import type { AgentDispatcher, EffortLevel, UserIngressMessage } from "../types";

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const noopCompactor: Compactor = {
  needsCompaction() {
    return false;
  },
  contextTokens() {
    return 0;
  },
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
    replicas: 1,
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
    name: "write_kanban",
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
    hasQueuedMessages: ReturnType<typeof vi.fn>;
  };
  readonly agentListener: ((event: PiAgentEvent) => void) | undefined;
  readonly capturedOptions: ConstructorParameters<typeof PiAgent>[0] | undefined;
  settleIdle: () => void;
}

function makeFakeAgentFactory(): FakeAgentCapture {
  let listener: ((event: PiAgentEvent) => void) | undefined;
  let capturedOptions: ConstructorParameters<typeof PiAgent>[0] | undefined;
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
    hasQueuedMessages: vi.fn(() => false),
  };
  const stub = fake as unknown as PiAgent;
  return {
    factory: (opts) => {
      capturedOptions = opts;
      return stub;
    },
    fake,
    get agentListener() {
      return listener;
    },
    get capturedOptions() {
      return capturedOptions;
    },
    settleIdle: () => {
      resolveIdle?.();
    },
  };
}

function makeFakeTranscriptStore(): {
  transcriptStore: TranscriptStore;
  persisted: AgentMessage[];
  restore: ReturnType<typeof vi.fn>;
  restoreDisplay: ReturnType<typeof vi.fn>;
} {
  const persisted: AgentMessage[] = [];
  const persist = vi.fn(async (message: AgentMessage) => {
    persisted.push(message);
  });
  const restore = vi.fn(async () => persisted.slice());
  const restoreDisplay = vi.fn(async () => persisted.slice());
  const transcriptStore = vi.mocked<TranscriptStore>({
    persist,
    compact: vi.fn(),
    restore,
    restoreDisplay,
    hasSession: vi.fn(() => false),
    listSessions: vi.fn(() => []),
    listAgentKeys: vi.fn(() => []),
    remove: vi.fn(),
    sessionName: vi.fn(() => null),
    renameSession: vi.fn(),
  });
  return { transcriptStore, persisted, restore, restoreDisplay };
}

interface MakeBodyOverrides {
  agentKey?: string;
  teamId?: string;
  soul?: AgentSoul;
  isLeader?: boolean;
  isEphemeral?: boolean;
  sessionId?: string;
  model?: Model<Api>;
  effort?: EffortLevel;
  modelPinned?: boolean;
  factory?: (opts: ConstructorParameters<typeof PiAgent>[0]) => PiAgent;
  systemContextBlock?: string;
  compactor?: Compactor;
  getAuth?: (provider: string) => Promise<AuthResult | undefined>;
  streamFn?: StreamFn;
  logDir?: string | null;
}

interface Harness {
  events: EventManager;
  resolveModel: ReturnType<typeof vi.fn<(provider: string, modelId: string) => Model<Api> | undefined>>;
  toolRegistry: ReturnType<typeof vi.mocked<ToolRegistry>>;
  skillManager: ReturnType<typeof vi.mocked<SkillManager>>;
  hookRunner: ReturnType<typeof vi.mocked<HookRunner>>;
  memoryManager: ReturnType<typeof vi.mocked<MemoryManager>>;
  transcriptStore: TranscriptStore;
  persisted: AgentMessage[];
  restore: ReturnType<typeof vi.fn>;
  restoreDisplay: ReturnType<typeof vi.fn>;
  cap: FakeAgentCapture;
  state: FakeAgentState;
  prompt: ReturnType<typeof vi.fn>;
  followUp: ReturnType<typeof vi.fn>;
  steer: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
  continue: ReturnType<typeof vi.fn>;
  hasQueuedMessages: ReturnType<typeof vi.fn>;
  subscribeSubject: <T extends EventType>(topic: T, cb: (env: EventEnvelope<T>) => void) => () => void;
  fireEvent: (event: PiAgentEvent) => void;
  makeBody: (overrides?: MakeBodyOverrides) => JieAgentBody;
  settleIdle: () => void;
  agentDispatcher: ReturnType<typeof vi.mocked<AgentDispatcher>>;
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
  const { transcriptStore, persisted, restore, restoreDisplay } = makeFakeTranscriptStore();
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
  const memoryManager = vi.mocked<MemoryManager>({ add: vi.fn(), search: vi.fn(), bootstrap: vi.fn(() => ""), distill: vi.fn(async () => {}) });
  const agentDispatcher = vi.mocked<AgentDispatcher>({ call: vi.fn() });
  const subscribeSubject = <T extends EventType>(topic: T, cb: (env: EventEnvelope<T>) => void): (() => void) =>
    events.subscribe(topic, (env) => cb(env));
  const makeBody: Harness["makeBody"] = (overrides = {}) => {
    const soul = overrides.soul ?? makeSoul();
    const params: AgentBodyParams = {
      agentKey: overrides.agentKey ?? "general-1",
      teamId: overrides.teamId ?? "t1",
      soul,
      isLeader: overrides.isLeader ?? false,
      isEphemeral: overrides.isEphemeral ?? false,
      sessionId: overrides.sessionId ?? "s1",
      model: overrides.model,
      effort: overrides.effort ?? "off",
      modelPinned: overrides.modelPinned ?? (soul.model !== "" && !isModelAlias(soul.model)),
    };
    return new JieAgentBody(params, {
      eventManager: events,
      artifactStore,
      transcriptStore,
      toolRegistry,
      skillManager,
      systemContextBlock: overrides.systemContextBlock ?? "",
      hookRunner,
      cwd: "/work",
      getAuth: overrides.getAuth ?? (() => Promise.resolve(undefined)),
      streamFn: overrides.streamFn,
      resolveModel,
      createAgent: overrides.factory ?? cap.factory,
      compactor: overrides.compactor ?? noopCompactor,
      memoryManager,
      logDir: overrides.logDir ?? null,
      agentDispatcher,
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
    memoryManager,
    agentDispatcher,
    transcriptStore,
    persisted,
    restore,
    restoreDisplay,
    cap,
    state: cap.fake.state,
    prompt: cap.fake.prompt,
    followUp: cap.fake.followUp,
    steer: cap.fake.steer,
    abort: cap.fake.abort,
    continue: cap.fake.continue,
    hasQueuedMessages: cap.fake.hasQueuedMessages,
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

  test("resolved skills are included after the context block", () => {
    const h = makeHarness();
    h.skillManager.resolve.mockReturnValue([deploySkill]);
    h.makeBody({ soul: makeSoul({ skills: ["deploy"] }) });
    expect(h.skillManager.resolve).toHaveBeenCalledWith("deploy");
    expect(h.state.systemPrompt).toContain("you are a general assistant");
    expect(h.state.systemPrompt).toContain("SKILL-ENTRY-deploy");
  });

  test("composes role prompt, available tools, guidelines, and cwd with no optional sections", () => {
    const h = makeHarness();
    h.makeBody({ soul: makeSoul() });
    const expected =
      "you are a general assistant\n\n" +
      "Available tools:\n(none)\n\n" +
      "Guidelines:\n- Be concise in your responses\n- Show file paths clearly when working with files\n\n" +
      "Current working directory: /work";
    expect(h.state.systemPrompt).toBe(expected);
  });

  test("places the shared context block after the guidelines", () => {
    const h = makeHarness();
    h.makeBody({ systemContextBlock: "<context_files>X</context_files>" });
    const prompt = h.state.systemPrompt;
    expect(prompt.indexOf("Guidelines:")).toBeLessThan(prompt.indexOf("<context_files>"));
    expect(prompt.endsWith("Current working directory: /work")).toBe(true);
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
      ephemeral: false,
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
    expect(names).toEqual(["noop", "write_kanban"]);
  });

  test("a utility tool already matched by a soul spec is not added twice", () => {
    const h = makeHarness();
    const cap = makeFakeAgentFactory();
    const utility = makeUtilityTool();
    h.toolRegistry.resolve.mockReturnValue([utility]);
    h.toolRegistry.list.mockReturnValue([utility]);
    h.makeBody({ soul: makeSoul({ tools: ["write_kanban"] }), factory: cap.factory });
    const names = (cap.fake.state.tools as Array<{ name: string }>).map((t) => t.name);
    expect(names).toEqual(["write_kanban"]);
  });

  test("a non-utility tool in the registry is not implicitly assigned", () => {
    const h = makeHarness();
    const cap = makeFakeAgentFactory();
    const utility = makeUtilityTool();
    h.toolRegistry.resolve.mockReturnValue([utility]);
    h.toolRegistry.list.mockReturnValue([makeNoopTool(), utility]);
    h.makeBody({ soul: makeSoul({ tools: ["write_kanban"] }), factory: cap.factory });
    const names = (cap.fake.state.tools as Array<{ name: string }>).map((t) => t.name);
    expect(names).toEqual(["write_kanban"]);
  });

  test("an empty soul tool list still receives the utility tools", () => {
    const h = makeHarness();
    const cap = makeFakeAgentFactory();
    h.toolRegistry.list.mockReturnValue([makeUtilityTool()]);
    h.makeBody({ factory: cap.factory });
    const names = (cap.fake.state.tools as Array<{ name: string }>).map((t) => t.name);
    expect(names).toEqual(["write_kanban"]);
  });
});

describe("JieAgentBody — agent configuration", () => {
  test("follow-up and steering modes are one-at-a-time so each queued prompt gets its own turn", () => {
    const h = makeHarness();
    h.makeBody();
    expect(h.cap.capturedOptions?.followUpMode).toBe("one-at-a-time");
    expect(h.cap.capturedOptions?.steeringMode).toBe("one-at-a-time");
  });
});

describe("JieAgentBody — auth resolution", () => {
  function makeStream(): AssistantMessageEventStream {
    return undefined as unknown as AssistantMessageEventStream;
  }

  test("merges resolved auth apiKey and headers into stream options", async () => {
    const h = makeHarness();
    const mockStreamFn = vi.fn<StreamFn>(() => makeStream());
    const getAuth = vi.fn(async () => ({ auth: { apiKey: "key", headers: { Authorization: "Bearer key" } } }));
    h.makeBody({ getAuth, streamFn: mockStreamFn });
    const model = makeModel("proxy", "claude");
    const context: Context = { systemPrompt: "", messages: [], tools: [] };
    await h.cap.capturedOptions?.streamFn(model, context, {});
    expect(getAuth).toHaveBeenCalledWith("proxy");
    expect(mockStreamFn).toHaveBeenCalledWith(model, context, { apiKey: "key", headers: { Authorization: "Bearer key" } });
  });

  test("passes options through unchanged when auth is unresolved", async () => {
    const h = makeHarness();
    const mockStreamFn = vi.fn<StreamFn>(() => makeStream());
    h.makeBody({ getAuth: async () => undefined, streamFn: mockStreamFn });
    const model = makeModel("proxy", "claude");
    const context: Context = { systemPrompt: "", messages: [], tools: [] };
    await h.cap.capturedOptions?.streamFn(model, context, { apiKey: "explicit" });
    expect(mockStreamFn).toHaveBeenCalledWith(model, context, { apiKey: "explicit" });
  });

  test("explicit options win over resolved auth", async () => {
    const h = makeHarness();
    const mockStreamFn = vi.fn<StreamFn>(() => makeStream());
    const getAuth = vi.fn(async () => ({ auth: { apiKey: "resolved", headers: { Authorization: "Bearer resolved", "x-provider": "v" } } }));
    h.makeBody({ getAuth, streamFn: mockStreamFn });
    const model = makeModel("proxy", "claude");
    const context: Context = { systemPrompt: "", messages: [], tools: [] };
    await h.cap.capturedOptions?.streamFn(model, context, { apiKey: "explicit", headers: { Authorization: "Bearer explicit" } });
    expect(mockStreamFn).toHaveBeenCalledWith(model, context, {
      apiKey: "explicit",
      headers: { Authorization: "Bearer explicit", "x-provider": "v" },
    });
  });

  test("encodes auth resolution failure as a stream error", async () => {
    const h = makeHarness();
    const mockStreamFn = vi.fn<StreamFn>(() => makeStream());
    h.makeBody({ getAuth: async () => Promise.reject(new Error("token refresh failed")), streamFn: mockStreamFn });
    const model = makeModel("proxy", "claude");
    const context: Context = { systemPrompt: "", messages: [], tools: [] };
    const stream = await h.cap.capturedOptions?.streamFn(model, context, {});
    expect(mockStreamFn).not.toHaveBeenCalled();
    const message = await stream?.result();
    expect(message?.stopReason).toBe("error");
    expect(message?.errorMessage).toContain("token refresh failed");
  });
});

describe("JieAgentBody — execution context toolArgs wiring", () => {
  function makeCapturingTool(received: Array<ExecutionContext["toolArgs"]>): Tool {
    return {
      name: "noop",
      description: "no-op",
      label: "Noop",
      parameters: Type.Object({}),
      async execute(_input, executionContext): Promise<ToolResult> {
        received.push(executionContext.toolArgs);
        return { content: "ok" };
      },
    };
  }

  async function executeFirstTool(cap: FakeAgentCapture): Promise<void> {
    const adapted = (cap.fake.state.tools as Array<{ execute: (toolCallId: string, params: unknown) => Promise<unknown> }>)[0]!;
    await adapted.execute("call-1", {});
  }

  test("adapted tools receive the toolArgs parsed from the soul's tool specs", async () => {
    const h = makeHarness();
    const cap = makeFakeAgentFactory();
    const received: Array<ReadonlyMap<string, ReadonlyArray<string>>> = [];
    h.toolRegistry.resolve.mockReturnValue([makeCapturingTool(received)]);
    h.makeBody({ soul: makeSoul({ tools: ["notify(task.recorded, task.done)", "noop"] }), factory: cap.factory });
    await executeFirstTool(cap);
    expect(received[0]?.get("notify")).toEqual(["task.recorded", "task.done"]);
    expect(received[0]?.get("noop")).toBeUndefined();
  });

  test("adapted tools receive an empty toolArgs map when no tool specs carry args", async () => {
    const h = makeHarness();
    const cap = makeFakeAgentFactory();
    const received: Array<ReadonlyMap<string, ReadonlyArray<string>>> = [];
    h.toolRegistry.resolve.mockReturnValue([makeCapturingTool(received)]);
    h.makeBody({ soul: makeSoul({ tools: ["noop"] }), factory: cap.factory });
    await executeFirstTool(cap);
    expect(received[0]?.size).toBe(0);
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
    expect((synthetic as { content: unknown }).content).toBe("hello\n\nextra");
    body.stop();
  });
});

describe("JieAgentBody — agent.model.assigned publication", () => {
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

  test("subscribes to and dispatches inbox.{agentKey} for call_agent", async () => {
    body.stop();
    const b2 = h.makeBody({ agentKey: "reviewer-1", soul: makeSoul() });
    await b2.start();
    h.events.publish(Events.custom(
      { kind: "agent", teamId: "t1", agentKey: "leader-1" },
      "t1.inbox.reviewer-1",
      "call_id: 1\ncallback: callback.leader-1\n\nreview",
    ));
    await flush();
    expect(h.prompt.mock.calls.length).toBe(1);
    const msg = h.prompt.mock.calls[0]![0] as { content: string };
    expect(msg.content).toContain("leader-1 on 'inbox.reviewer-1'");
    expect(msg.content).toContain("review");
    b2.stop();
  });

  test("subscribes to and dispatches callback.{agentKey}", async () => {
    body.stop();
    const b2 = h.makeBody({ agentKey: "leader-1", soul: makeSoul() });
    await b2.start();
    h.events.publish(Events.custom(
      { kind: "agent", teamId: "t1", agentKey: "reviewer-1" },
      "t1.callback.leader-1",
      "call_id: 1\n\nresult",
    ));
    await flush();
    expect(h.prompt.mock.calls.length).toBe(1);
    const msg = h.prompt.mock.calls[0]![0] as { content: string };
    expect(msg.content).toContain("reviewer-1 on 'callback.leader-1'");
    expect(msg.content).toContain("result");
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

  test("is idempotent — a second call returns the cached snapshot without re-querying the transcript store", async () => {
    h.persisted.push({ role: "user", content: "m1" } as unknown as AgentMessage);
    const body = h.makeBody();
    const first = await body.restore();
    const second = await body.restore();
    expect(second).toBe(first);
    expect(h.restore).toHaveBeenCalledTimes(1);
    body.stop();
  });

  test("a failing memory store load degrades to context + role prose without failing restore", async () => {
    h.memoryManager.bootstrap.mockImplementation(() => {
      throw new Error("db locked");
    });
    const body = h.makeBody({ systemContextBlock: "CONTEXT" });
    await body.restore();
    const expected =
      "you are a general assistant\n\n" +
      "Available tools:\n(none)\n\n" +
      "Guidelines:\n- Be concise in your responses\n- Show file paths clearly when working with files\n\n" +
      "CONTEXT\n\n" +
      "Current working directory: /work";
    expect(h.state.systemPrompt).toBe(expected);
    body.stop();
  });

  test("loads the team memory block into the system prompt after the role prose", async () => {
    h.memoryManager.bootstrap.mockReturnValue(
      "<memory team=\"t1\">\n- [instruction] keep the build green\n</memory>",
    );
    const body = h.makeBody({ systemContextBlock: "CONTEXT" });
    await body.restore();
    const expected =
      "you are a general assistant\n\n" +
      "Available tools:\n(none)\n\n" +
      "Guidelines:\n- Be concise in your responses\n- Show file paths clearly when working with files\n\n" +
      "CONTEXT\n\n" +
      "<memory team=\"t1\">\n- [instruction] keep the build green\n</memory>\n\n" +
      "Current working directory: /work";
    expect(h.state.systemPrompt).toBe(expected);
    body.stop();
  });

  test("composes the available tools and guidelines from the agent's adapted tools", async () => {
    h.toolRegistry.resolve.mockReturnValue([makeNoopTool()]);
    const body = h.makeBody({ soul: makeSoul({ tools: ["noop"] }) });
    await body.restore();
    const prompt = h.state.systemPrompt;
    expect(prompt).toContain("Available tools:\n- noop: no-op");
    expect(prompt).toContain("Guidelines:\n- Be concise in your responses");
    expect(prompt).toContain("Current working directory: /work");
    body.stop();
  });

  test("orders role, available tools, guidelines, context, memory, and cwd", async () => {
    h.memoryManager.bootstrap.mockReturnValue("<memory team=\"t1\">- [fact] x</memory>");
    const body = h.makeBody({ systemContextBlock: "CONTEXT" });
    await body.restore();
    const prompt = h.state.systemPrompt;
    expect(prompt.indexOf("you are a general assistant")).toBeLessThan(prompt.indexOf("Available tools:"));
    expect(prompt.indexOf("Available tools:")).toBeLessThan(prompt.indexOf("Guidelines:"));
    expect(prompt.indexOf("Guidelines:")).toBeLessThan(prompt.indexOf("CONTEXT"));
    expect(prompt.indexOf("CONTEXT")).toBeLessThan(prompt.indexOf("<memory"));
    expect(prompt.indexOf("<memory")).toBeLessThan(prompt.indexOf("Current working directory:"));
    body.stop();
  });

  test("restore re-composes the prompt with the memory block even for a fresh session", async () => {
    h.memoryManager.bootstrap.mockReturnValue(
      "<memory team=\"t1\">\n- [decision] sqlite over postgres (scene: store choice)\n</memory>",
    );
    const body = h.makeBody();
    await body.restore();
    expect(h.state.systemPrompt).toContain("<memory team=\"t1\">");
    expect(h.state.systemPrompt).toContain("- [decision] sqlite over postgres (scene: store choice)");
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

describe("JieAgentBody — displayMessages()", () => {
  let h: Harness;

  beforeEach(() => {
    h = makeHarness();
  });

  function makeUserMessage(content: string): AgentMessage {
    return { role: "user", content, timestamp: 0 };
  }

  test("returns an empty array before restore", () => {
    const body = h.makeBody();
    expect(body.displayMessages()).toEqual([]);
    body.stop();
  });

  test("matches messages when restoreDisplay has no extra rows", async () => {
    const body = h.makeBody();
    h.persisted.push(makeUserMessage("m1"), makeAssistantMessage({ content: [{ type: "text", text: "reply" }] }));
    await body.restore();
    expect(body.displayMessages()).toEqual(body.messages());
    body.stop();
  });

  test("includes the compacted prefix returned by restoreDisplay", async () => {
    const body = h.makeBody();
    const m1 = makeUserMessage("compacted");
    const m2 = makeAssistantMessage({ content: [{ type: "text", text: "reply" }] });
    const m3 = makeUserMessage("tail");
    h.restore.mockResolvedValue([m2, m3]);
    h.restoreDisplay.mockResolvedValue([m1, m2, m3]);
    await body.restore();
    expect(body.messages()).toEqual([m2, m3]);
    expect(body.displayMessages()).toEqual([m1, m2, m3]);
    body.stop();
  });

  test("returns the snapshot as a new array, not the internal state", async () => {
    const body = h.makeBody();
    h.persisted.push(makeUserMessage("m1"));
    await body.restore();
    const first = body.displayMessages();
    h.state.messages.push(makeAssistantMessage({ content: [{ type: "text", text: "extra" }] }));
    expect(first).toHaveLength(1);
    expect(body.displayMessages()).toHaveLength(2);
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
    expect((synthetic as { content: unknown }).content).toBe("EXPANDED");
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
    expect((synthetic as { content: unknown }).content).toBe("/skill:deploy now");
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
    expect((synthetic as { content: unknown }).content).toBe("/skill:dep now");
    body.stop();
  });

  test("an empty skill name passes through unchanged", async () => {
    h.skillManager.resolve.mockReturnValue([deploySkill]);
    const body = h.makeBody({ soul: makeSoul({ skills: ["deploy"] }) });
    await body.start();
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "/skill: now"));
    await flush();
    const synthetic = h.prompt.mock.calls[0]![0] as AgentMessage;
    expect((synthetic as { content: unknown }).content).toBe("/skill: now");
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
    expect((synthetic as { content: unknown }).content).toBe("BACKUP-EXPANDED");
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
    expect((synthetic as { content: unknown }).content).toBe("EXPANDED");
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
    expect((synthetic as { content: unknown }).content).toBe("EXPANDED");
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
    expect((synthetic as { content: unknown }).content).toBe("please /skill:deploy now");
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
    expect((synthetic as { content: unknown }).content).toBe("/skill:");
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
    expect(queueUpdates[queueUpdates.length - 1]!.payload.prompts).toEqual([{ text: "/skill:deploy now", source: "user", chained: false }]);
    h.fireEvent({ type: "agent_end", messages: [] });
    h.settleIdle();
    await flush();
    const drained = h.prompt.mock.calls[0]![0] as AgentMessage;
    expect((drained as { content: unknown }).content).toBe("EXPANDED");
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

  test("the prompt queue dispatcher routes steer to agent.steer and the run continues when the agent has queued messages", async () => {
    const body = h.makeBody();
    await body.start();
    h.hasQueuedMessages.mockReturnValue(true);
    h.fireEvent({
      type: "agent_end",
      messages: [makeAssistantMessage({ stopReason: "length", content: [] })],
    });
    expect(h.steer).toHaveBeenCalledTimes(1);
    expect(h.steer.mock.calls[0]![0]).toMatchObject({
      role: "user",
      content: expect.stringContaining("cut off"),
    });
    h.settleIdle();
    await flush();
    expect(h.continue).toHaveBeenCalledTimes(1);
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
    expect(h.prompt.mock.calls[0]![0]).toMatchObject({ role: "user", content: "queued msg" });
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
    expect(h.prompt.mock.calls[0]![0]).toMatchObject({ role: "user", content: "racing prompt" });
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
    expect(h.prompt.mock.calls[0]![0]).toMatchObject({ content: "first" });
    expect(h.prompt.mock.calls[1]![0]).toMatchObject({ content: "second" });
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
    expect(h.prompt.mock.calls[0]![0]).toMatchObject({ role: "user", content: "queued msg" });
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
    expect(h.prompt.mock.calls[0]![0]).toMatchObject({ content: "leftover" });
    h.settleIdle();
    await flush();
    expect(h.prompt.mock.calls.length).toBe(2);
    expect(h.prompt.mock.calls[1]![0]).toMatchObject({ content: "fresh" });
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

  test("the pending prompt is consumed once — a later continuation carries no label", async () => {
    const body = h.makeBody();
    await body.start();
    const turnStart: EventEnvelope<"agent.turn.start">[] = [];
    const turnContinue: EventEnvelope<"agent.turn.continue">[] = [];
    h.subscribeSubject("agent.turn.start", (env) => turnStart.push(env));
    h.subscribeSubject("agent.turn.continue", (env) => turnContinue.push(env));
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
    expect(turnStart.map((env) => env.payload)).toEqual(["hello"]);
    expect(turnContinue).toHaveLength(1);
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
      { text: "first queued", source: "user", chained: false },
      { text: "second queued", source: "user", chained: false },
    ]);
    h.state.isStreaming = false;
    h.fireEvent({
      type: "turn_end",
      message: { role: "assistant", content: [] } as unknown as AssistantMessage,
      toolResults: [],
    });
    expect(h.followUp.mock.calls.length).toBe(1);
    expect(queueUpdates[queueUpdates.length - 1]!.payload.prompts).toEqual([
      { text: "first queued", source: "user", chained: true },
      { text: "second queued", source: "user", chained: false },
    ]);
    h.fireEvent({ type: "turn_start" });
    h.fireEvent({ type: "message_start", message: h.followUp.mock.calls[0]![0] as AgentMessage });
    expect(turnStart[turnStart.length - 1]!.payload).toBe("first queued");
    body.stop();
  });

  test("two queued prompts released across two turn_ends each get their own turn.start payload", async () => {
    const body = h.makeBody();
    await body.start();
    const turnStart: EventEnvelope<"agent.turn.start">[] = [];
    h.subscribeSubject("agent.turn.start", (env) => turnStart.push(env));
    h.state.isStreaming = true;
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "first queued"));
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "second queued"));
    await flush();
    h.fireEvent({
      type: "turn_end",
      message: { role: "assistant", content: [] } as unknown as AssistantMessage,
      toolResults: [],
    });
    expect(h.followUp.mock.calls.length).toBe(1);
    h.fireEvent({ type: "turn_start" });
    h.fireEvent({ type: "message_start", message: h.followUp.mock.calls[0]![0] as AgentMessage });
    h.fireEvent({
      type: "turn_end",
      message: { role: "assistant", content: [] } as unknown as AssistantMessage,
      toolResults: [],
    });
    expect(h.followUp.mock.calls.length).toBe(2);
    h.fireEvent({ type: "turn_start" });
    h.fireEvent({ type: "message_start", message: h.followUp.mock.calls[1]![0] as AgentMessage });
    expect(turnStart.map((env) => env.payload)).toEqual(["first queued", "second queued"]);
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
    const turnContinue: EventEnvelope<"agent.turn.continue">[] = [];
    h.subscribeSubject("agent.turn.start", (env) => turnStart.push(env));
    h.subscribeSubject("agent.turn.continue", (env) => turnContinue.push(env));
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "lost run"));
    await flush();
    h.fireEvent({ type: "agent_end", messages: [] });
    h.fireEvent({ type: "turn_start" });
    h.fireEvent({
      type: "turn_end",
      message: makeAssistantMessage(),
      toolResults: [],
    });
    expect(turnStart).toHaveLength(0);
    expect(turnContinue).toHaveLength(1);
    body.stop();
  });

  test("a followUp fed at turn_end labels its own turn, not the intervening tool-continuation turn", async () => {
    const body = h.makeBody();
    await body.start();
    const turnStart: EventEnvelope<"agent.turn.start">[] = [];
    const turnContinue: EventEnvelope<"agent.turn.continue">[] = [];
    h.subscribeSubject("agent.turn.start", (env) => turnStart.push(env));
    h.subscribeSubject("agent.turn.continue", (env) => turnContinue.push(env));
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
    expect(turnStart.map((env) => env.payload)).toEqual(["first", "second"]);
    expect(turnContinue).toHaveLength(1);
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
    expect(queueUpdates[queueUpdates.length - 1]!.payload.prompts).toEqual([{ text: "hello", source: "user", chained: false }]);
    body.stop();
  });

  test("agent queues left after a run are continued before the prompt queue drains again", async () => {
    const body = h.makeBody();
    await body.start();
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "first"));
    await flush();
    const firstMessage = h.prompt.mock.calls[0]![0] as AgentMessage;
    h.state.isStreaming = true;
    h.hasQueuedMessages.mockReturnValue(true);
    h.events.publish(Events.userPrompt({ kind: "user" }, "t1", "general-1", "second"));
    await flush();
    h.fireEvent({ type: "turn_start" });
    h.fireEvent({ type: "message_start", message: firstMessage });
    h.fireEvent({ type: "message_end", message: makeAssistantMessage({ stopReason: "toolUse" }) });
    h.fireEvent({ type: "turn_end", message: makeAssistantMessage({ stopReason: "toolUse" }), toolResults: [] });
    expect(h.followUp.mock.calls.length).toBe(1);
    h.fireEvent({ type: "agent_end", messages: [makeAssistantMessage({ stopReason: "aborted" })] });
    h.settleIdle();
    await flush();
    expect(h.continue).toHaveBeenCalledTimes(1);
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
      { text: "first", source: "user", chained: false },
      { text: "second", source: "user", chained: false },
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
    expect(queueUpdates[queueUpdates.length - 1]!.payload.prompts).toEqual([{ text: "first", source: "user", chained: false }]);
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

  test("ignores the update when the soul pins effort", async () => {
    const body = h.makeBody({ soul: makeSoul({ model: "", effort: "low" }), effort: "low", model: makeModel("anthropic", "claude-sonnet-4") });
    await body.start();
    const received: EventEnvelope<"agent.model.assigned">[] = [];
    h.subscribeSubject("agent.model.assigned", (env) => received.push(env));
    h.events.publish(Events.userEffortUpdate({ kind: "user" }, "high"));
    expect(h.state.thinkingLevel).toBe("low");
    expect(received).toHaveLength(0);
    expect(body.identity.model).toEqual({ provider: "anthropic", id: "claude-sonnet-4", effort: "low", contextWindow: 200000 });
    body.stop();
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

  test("unmapped model alias follows user.model.update", async () => {
    const nextModel = makeModel("lm-studio", "qwen3.5-2b");
    h.resolveModel.mockReturnValue(nextModel);
    const body = h.makeBody({ soul: makeSoul({ model: "large" }), model: makeModel("anthropic", "claude-sonnet-4") });
    await body.start();
    const received: EventEnvelope<"agent.model.assigned">[] = [];
    h.subscribeSubject("agent.model.assigned", (env) => received.push(env));
    h.events.publish(Events.userModelUpdate({ kind: "user" }, "lm-studio", "qwen3.5-2b"));
    expect(h.resolveModel).toHaveBeenCalledWith("lm-studio", "qwen3.5-2b");
    expect(h.state.model).toBe(nextModel);
    expect(received).toHaveLength(1);
    expect(received[0]!.payload).toEqual({ provider: "lm-studio", model: "qwen3.5-2b", effort: "off", contextWindow: 200000 });
    body.stop();
  });

  test("mapped model alias stays pinned", async () => {
    const pinned = makeModel("anthropic", "claude-sonnet-4");
    const body = h.makeBody({ soul: makeSoul({ model: "large" }), model: pinned, modelPinned: true });
    await body.start();
    const received: EventEnvelope<"agent.model.assigned">[] = [];
    h.subscribeSubject("agent.model.assigned", (env) => received.push(env));
    h.events.publish(Events.userModelUpdate({ kind: "user" }, "lm-studio", "qwen3.5-2b"));
    expect(h.resolveModel).not.toHaveBeenCalled();
    expect(h.state.model).toBe(pinned);
    expect(received).toHaveLength(0);
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

  function makeFakeCompactor(): { compactor: Compactor; compact: ReturnType<typeof vi.fn<(input: CompactionInput) => Promise<CompactionResult | null>>>; needsCompaction: ReturnType<typeof vi.fn<(messages: ReadonlyArray<AgentMessage>, contextWindow: number) => boolean>>; contextTokens: ReturnType<typeof vi.fn<(messages: ReadonlyArray<AgentMessage>) => number>> } {
    const compact = vi.fn<(input: CompactionInput) => Promise<CompactionResult | null>>(async () => null);
    const needsCompaction = vi.fn<(messages: ReadonlyArray<AgentMessage>, contextWindow: number) => boolean>(() => true);
    const contextTokens = vi.fn<(messages: ReadonlyArray<AgentMessage>) => number>(() => 0);
    const compactor: Compactor = { needsCompaction, contextTokens, compact, fitToWindow: (messages) => messages };
    return { compactor, compact, needsCompaction, contextTokens };
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
    compact.mockResolvedValueOnce({ summaryMessage: summary, firstKeptIndex: 1, tokensBefore: 500, summarizedPrefix: [makeUserMessage("m1")] });
    h.fireEvent({ type: "agent_end", messages: [] });
    h.settleIdle();
    await flush();
    expect(compact).toHaveBeenCalledTimes(1);
    expect(h.state.messages).toEqual([summary, second, third]);
    body.stop();
  });

  test("compaction rewrite appends removed messages to the compacted prefix for display", async () => {
    const { compactor, compact } = makeFakeCompactor();
    const body = h.makeBody({ model: makeModel("anthropic", "claude-sonnet-4"), compactor });
    await body.start();
    const first = makeUserMessage("m1");
    const second = makeAssistantMessage({ content: [{ type: "text", text: "m2" }] });
    const third = makeUserMessage("m3");
    h.state.messages = [first, second, third];
    const summary = createCompactionSummaryMessage("the summary", 500, "2026-01-01T00:00:00.000Z");
    compact.mockResolvedValueOnce({ summaryMessage: summary, firstKeptIndex: 1, tokensBefore: 500, summarizedPrefix: [first] });
    h.fireEvent({ type: "agent_end", messages: [] });
    h.settleIdle();
    await flush();
    expect(body.displayMessages()).toEqual([first, summary, second, third]);
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
      summarizedPrefix: [first],
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

  test("prepareNextTurnWithContext compacts mid-run and returns the compacted context", async () => {
    const { compactor, compact } = makeFakeCompactor();
    const body = h.makeBody({ model: makeModel("anthropic", "claude-sonnet-4"), compactor });
    await body.start();
    const first = makeUserMessage("m1");
    const second = makeAssistantMessage({ content: [{ type: "text", text: "m2" }] });
    const third = makeUserMessage("m3");
    h.state.messages = [first, second, third];
    const summary = createCompactionSummaryMessage("the summary", 500, "2026-01-01T00:00:00.000Z");
    compact.mockResolvedValueOnce({ summaryMessage: summary, firstKeptIndex: 1, tokensBefore: 500, summarizedPrefix: [first] });
    const hook = h.cap.capturedOptions?.prepareNextTurnWithContext;
    if (hook === undefined) throw new Error("prepareNextTurnWithContext not wired");
    const turnContext: PrepareNextTurnContext = {
      message: second,
      toolResults: [],
      context: { systemPrompt: "sys", messages: h.state.messages, tools: [] },
      newMessages: [first, second, third],
    };
    const update = await hook(turnContext, new AbortController().signal);
    expect(update).toEqual({ context: { systemPrompt: "sys", messages: [summary, second, third], tools: [] } });
    expect(h.state.messages).toEqual([summary, second, third]);
    body.stop();
  });

  test("prepareNextTurnWithContext returns undefined when compaction is not needed", async () => {
    const { compactor, compact, needsCompaction } = makeFakeCompactor();
    needsCompaction.mockReturnValue(false);
    const body = h.makeBody({ model: makeModel("anthropic", "claude-sonnet-4"), compactor });
    await body.start();
    const first = makeUserMessage("m1");
    const second = makeAssistantMessage({ content: [{ type: "text", text: "m2" }] });
    h.state.messages = [first, second];
    const hook = h.cap.capturedOptions?.prepareNextTurnWithContext;
    if (hook === undefined) throw new Error("prepareNextTurnWithContext not wired");
    const turnContext: PrepareNextTurnContext = {
      message: second,
      toolResults: [],
      context: { systemPrompt: "sys", messages: h.state.messages, tools: [] },
      newMessages: [first, second],
    };
    const update = await hook(turnContext, new AbortController().signal);
    expect(update).toBeUndefined();
    expect(compact).not.toHaveBeenCalled();
    expect(h.state.messages).toEqual([first, second]);
    body.stop();
  });

  test("prepareNextTurnWithContext returns undefined without a model", async () => {
    const { compactor } = makeFakeCompactor();
    const body = h.makeBody({ compactor });
    await body.start();
    const hook = h.cap.capturedOptions?.prepareNextTurnWithContext;
    if (hook === undefined) throw new Error("prepareNextTurnWithContext not wired");
    const turnContext: PrepareNextTurnContext = {
      message: makeAssistantMessage({ content: [{ type: "text", text: "m" }] }),
      toolResults: [],
      context: { systemPrompt: "", messages: [], tools: [] },
      newMessages: [],
    };
    const update = await hook(turnContext, new AbortController().signal);
    expect(update).toBeUndefined();
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

describe("JieAgentBody — debug logging", () => {
  test("writes agent loop events to <logDir>/<agentKey>.log when logDir is provided", () => {
    const h = makeHarness();
    const logDir = mkdtempSync(join(tmpdir(), "jie-body-log-"));
    try {
      const body = h.makeBody({ logDir });
      h.fireEvent({ type: "agent_start" });
      h.fireEvent({ type: "message_start", message: { role: "user", content: [{ type: "text", text: "secret" }] } as unknown as AgentMessage });
      body.stop();

      const log = readFileSync(join(logDir, "general-1.log"), "utf8");
      const lines = log.trim().split("\n");
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0]!).agentKey).toBe("general-1");
      expect(JSON.parse(lines[1]!).event).toEqual({ type: "message_start", message: { role: "user" } });
      expect(log).not.toContain("secret");
    } finally {
      rmSync(logDir, { recursive: true, force: true });
    }
  });
});

describe("JieAgentBody — context overhead", () => {
  function makeUserMessage(content: string): AgentMessage {
    return { role: "user", content, timestamp: 0 };
  }

  function makeOverheadCompactor() {
    const fitToWindow = vi.fn(
      (messages: ReadonlyArray<AgentMessage>, _model?: Model<Api>, _contextWindow?: number, _overheadTokens?: number) => messages,
    );
    const compactor: Compactor = {
      needsCompaction: () => false,
      contextTokens: () => 0,
      compact: async () => null,
      fitToWindow,
    };
    return { compactor, fitToWindow };
  }

  test("seeds overhead from the composed system prompt and tool schemas", async () => {
    const { compactor, fitToWindow } = makeOverheadCompactor();
    const h = makeHarness();
    const body = h.makeBody({
      model: makeModel("anthropic", "claude-sonnet-4"),
      soul: makeSoul({ tools: ["noop"] }),
      compactor,
    });
    const transformContext = h.cap.capturedOptions?.transformContext;
    if (transformContext === undefined) throw new Error("transformContext not wired");
    await transformContext([makeUserMessage("hello")]);
    expect(fitToWindow).toHaveBeenCalled();
    const expected = estimateTokens({ role: "user", content: h.cap.fake.state.systemPrompt, timestamp: 0 })
      + Math.ceil(JSON.stringify(h.cap.fake.state.tools).length / 4);
    expect(fitToWindow.mock.calls[0]![3]).toBe(expected);
    body.stop();
  });

  test("passes the same overhead to fitToWindow on successive transformContext calls", async () => {
    const { compactor, fitToWindow } = makeOverheadCompactor();
    const h = makeHarness();
    const body = h.makeBody({
      model: makeModel("anthropic", "claude-sonnet-4"),
      compactor,
    });
    const transformContext = h.cap.capturedOptions?.transformContext;
    if (transformContext === undefined) throw new Error("transformContext not wired");
    const messages = [makeUserMessage("hello")];
    await transformContext([...messages]);
    await transformContext([...messages]);
    expect(fitToWindow).toHaveBeenCalledTimes(2);
    expect(fitToWindow.mock.calls[0]![3]).toBe(fitToWindow.mock.calls[1]![3]);
    body.stop();
  });

  test("calibrates overhead from assistant usage at message_end", async () => {
    const { compactor, fitToWindow } = makeOverheadCompactor();
    const h = makeHarness();
    const body = h.makeBody({
      model: makeModel("anthropic", "claude-sonnet-4"),
      compactor,
    });
    const transformContext = h.cap.capturedOptions?.transformContext;
    if (transformContext === undefined) throw new Error("transformContext not wired");
    const userMessage = makeUserMessage("hello");
    await transformContext([userMessage]);
    h.fireEvent({
      type: "message_end",
      message: makeAssistantMessage({
        usage: {
          input: 100,
          output: 20,
          cacheRead: 5,
          cacheWrite: 0,
          totalTokens: 125,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      }),
    });
    await transformContext([userMessage]);
    expect(fitToWindow).toHaveBeenCalledTimes(2);
    expect(fitToWindow.mock.calls[1]![3]).toBe(105 - estimateTokens(userMessage));
    body.stop();
  });

  test("does not calibrate overhead when the assistant model id does not match the pending model", async () => {
    const { compactor, fitToWindow } = makeOverheadCompactor();
    const h = makeHarness();
    const body = h.makeBody({
      model: makeModel("anthropic", "claude-sonnet-4"),
      compactor,
    });
    const transformContext = h.cap.capturedOptions?.transformContext;
    if (transformContext === undefined) throw new Error("transformContext not wired");
    await transformContext([makeUserMessage("hello")]);
    h.fireEvent({
      type: "message_end",
      message: makeAssistantMessage({
        model: "different-model",
        usage: {
          input: 10000,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 10000,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      }),
    });
    await transformContext([makeUserMessage("hello again")]);
    expect(fitToWindow).toHaveBeenCalledTimes(2);
    expect(fitToWindow.mock.calls[1]![3]).toBe(fitToWindow.mock.calls[0]![3]);
    body.stop();
  });

  test("does not calibrate overhead when the assistant provider does not match the pending model provider", async () => {
    const { compactor, fitToWindow } = makeOverheadCompactor();
    const h = makeHarness();
    const body = h.makeBody({
      model: makeModel("anthropic", "claude-sonnet-4"),
      compactor,
    });
    const transformContext = h.cap.capturedOptions?.transformContext;
    if (transformContext === undefined) throw new Error("transformContext not wired");
    await transformContext([makeUserMessage("hello")]);
    h.fireEvent({
      type: "message_end",
      message: makeAssistantMessage({
        provider: "openai",
        usage: {
          input: 10000,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 10000,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      }),
    });
    await transformContext([makeUserMessage("hello again")]);
    expect(fitToWindow).toHaveBeenCalledTimes(2);
    expect(fitToWindow.mock.calls[1]![3]).toBe(fitToWindow.mock.calls[0]![3]);
    body.stop();
  });

  test("resets overhead and clears the pending snapshot on model change", async () => {
    const { compactor, fitToWindow } = makeOverheadCompactor();
    const h = makeHarness();
    h.resolveModel.mockReturnValue(makeModel("lm-studio", "qwen3.5-2b"));
    const body = h.makeBody({
      soul: makeSoul({ model: "" }),
      model: makeModel("anthropic", "claude-sonnet-4"),
      compactor,
    });
    await body.start();
    const transformContext = h.cap.capturedOptions?.transformContext;
    if (transformContext === undefined) throw new Error("transformContext not wired");
    const userMessage = makeUserMessage("hello");
    await transformContext([userMessage]);
    h.fireEvent({
      type: "message_end",
      message: makeAssistantMessage({
        usage: {
          input: 100,
          output: 20,
          cacheRead: 5,
          cacheWrite: 0,
          totalTokens: 125,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      }),
    });
    await transformContext([userMessage]);
    expect(fitToWindow.mock.calls[1]![3]).toBe(105 - estimateTokens(userMessage));

    h.events.publish(Events.userModelUpdate({ kind: "user" }, "lm-studio", "qwen3.5-2b"));
    await transformContext([makeUserMessage("after model change")]);
    expect(fitToWindow).toHaveBeenCalledTimes(3);
    expect(fitToWindow.mock.calls[2]![3]).toBe(fitToWindow.mock.calls[0]![3]);

    h.fireEvent({
      type: "message_end",
      message: makeAssistantMessage({
        model: "claude-sonnet-4",
        usage: {
          input: 500,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 500,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      }),
    });
    await transformContext([makeUserMessage("old model ignored")]);
    expect(fitToWindow).toHaveBeenCalledTimes(4);
    expect(fitToWindow.mock.calls[3]![3]).toBe(fitToWindow.mock.calls[0]![3]);
    body.stop();
  });

  test("identity.model.contextWindow reflects the soul's target", () => {
    const h = makeHarness();
    const body = h.makeBody({
      soul: makeSoul({ targetContextWindowSize: 60_000 }),
      model: makeModel("anthropic", "claude-sonnet-4"),
    });
    expect(body.identity.model?.contextWindow).toBe(60_000);
  });
});

describe("JieAgentBody — loop guard integration", () => {
  function makeUserMessage(content: string): AgentMessage {
    return { role: "user", content, timestamp: 1 };
  }

  function loopCtx(toolCallId: string): BeforeToolCallContext {
    const toolCall = { type: "toolCall" as const, id: toolCallId, name: "ls", arguments: {} };
    return {
      assistantMessage: makeAssistantMessage({ content: [toolCall] }),
      toolCall,
      args: {},
      context: { systemPrompt: "", messages: [makeUserMessage("loop guard test")] },
    };
  }

  test("the observer escalates repeated identical tool calls through agent.interrupt and system.error", async () => {
    const h = makeHarness();
    const body = h.makeBody();
    await body.start();
    const beforeToolCall = h.cap.capturedOptions?.beforeToolCall;
    if (beforeToolCall === undefined) throw new Error("beforeToolCall not wired");
    const systemErrors: EventEnvelope<"system.error">[] = [];
    const agentInterrupts: EventEnvelope<"agent.interrupt">[] = [];
    h.subscribeSubject("system.error", (env) => systemErrors.push(env));
    h.subscribeSubject("agent.interrupt", (env) => agentInterrupts.push(env));
    h.state.isStreaming = true;
    for (let i = 0; i < 4; i += 1) {
      await beforeToolCall(loopCtx(`ls-guard-${i}`));
    }
    expect(h.abort).not.toHaveBeenCalled();
    await beforeToolCall(loopCtx("ls-guard-escalate"));
    expect(h.abort).toHaveBeenCalledTimes(1);
    expect(systemErrors).toHaveLength(1);
    expect(systemErrors[0]!.payload.error).toContain("ls");
    expect(agentInterrupts).toHaveLength(1);
    expect(agentInterrupts[0]!.payload).toEqual({ teamId: "t1", agentKey: "general-1" });
    body.stop();
  });
});
