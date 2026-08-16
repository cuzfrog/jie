import { asValue, createContainer, InjectionMode, type AwilixContainer } from "awilix";
import type { Api, Model } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import type { ModelRegistry, SettingsStore } from "../config";
import type { PlatformCradle } from "../container";
import { Events, type EventEnvelope, type EventManager, type EventType } from "../event";
import type { HookRunner } from "../hooks";
import type { LlmService } from "../llm";
import type { MemoryManager } from "../memory";
import type { ArtifactStore, TranscriptStore } from "../storage";
import type { AgentSoul } from "../team";
import type { SkillManager } from "../skills";
import type { Tool, ToolRegistry } from "../tools";
import type { AgentBodyParams } from "./agent-body";
import type { AgentDispatcher } from "../types";
import { isModelAlias } from "../types";
import { registerCoreModule } from "./module";

const eventManager = vi.mocked<EventManager>({
  publish: vi.fn(),
  subscribe: vi.fn(),
});

const artifactStore = vi.mocked<ArtifactStore>({
  write: vi.fn(),
  read: vi.fn(),
  list: vi.fn(),
});

const transcriptStore = vi.mocked<TranscriptStore>({
  persist: vi.fn(),
  compact: vi.fn(),
  restore: vi.fn(),
  restoreDisplay: vi.fn(async () => []),
  hasSession: vi.fn(),
  listSessions: vi.fn(),
  listAgentKeys: vi.fn(() => []),
  remove: vi.fn(),
  sessionName: vi.fn(() => null),
  renameSession: vi.fn(),
});

const stubTool: Tool = {
  name: "stub",
  description: "stub tool",
  label: "stub",
  parameters: Type.Object({}),
  execute: vi.fn(async () => ({ content: "ok" })),
};

const toolRegistry = vi.mocked<ToolRegistry>({
  register: vi.fn(),
  resolve: vi.fn(() => [stubTool]),
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

const modelRegistry = vi.mocked<ModelRegistry>({
  providers: vi.fn(() => []),
  listProviders: vi.fn(() => []),
  resolve: vi.fn(() => undefined),
  listModels: vi.fn(() => []),
  getAuth: vi.fn(() => Promise.resolve(undefined)),
  reload: vi.fn(),
});

const settingsStore = vi.mocked<SettingsStore>({
  load: vi.fn(() => ({})),
  setDefaultProvider: vi.fn(),
  setDefaultEffort: vi.fn(),
  setDefaultTeam: vi.fn(),
  setModelFilters: vi.fn(),
  setNotificationSoundEnabled: vi.fn(),
  setModelAlias: vi.fn(),
});

const llmService = vi.mocked<LlmService>({ complete: vi.fn(async () => "") });

const memoryManager = vi.mocked<MemoryManager>({ add: vi.fn(), search: vi.fn(), bootstrap: vi.fn(() => ""), distill: vi.fn(async () => {}) });

function bootedContainer(): AwilixContainer<PlatformCradle> {
  const container = createContainer<PlatformCradle>({ injectionMode: InjectionMode.CLASSIC });
  container.register({
    eventManager: asValue(eventManager),
    artifactStore: asValue(artifactStore),
    transcriptStore: asValue(transcriptStore),
    toolRegistry: asValue(toolRegistry),
    skillManager: asValue(skillManager),
    loadSystemContextBlock: asValue(() => ""),
    hookRunner: asValue(hookRunner),
    cwd: asValue("/work"),
    modelRegistry: asValue(modelRegistry),
    settingsStore: asValue(settingsStore),
    llmService: asValue(llmService),
    memoryManager: asValue(memoryManager),
    debug: asValue(false),
    logDir: asValue(null),
    agentDispatcher: asValue(vi.mocked<AgentDispatcher>({ call: vi.fn() })),
  });
  registerCoreModule(container);
  return container;
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

function makeParams(overrides: Partial<AgentBodyParams> = {}): AgentBodyParams {
  const soul = overrides.soul ?? makeSoul();
  return {
    agentKey: "general-1",
    teamId: "t1",
    soul,
    isLeader: false,
    isEphemeral: false,
    sessionId: "s1",
    model: undefined,
    effort: "off",
    modelPinned: soul.model !== "" && !isModelAlias(soul.model),
    ...overrides,
  };
}

describe("registerCoreModule", () => {
  test("agentBodyFactory returns an AgentBody whose identity reflects the params", () => {
    const container = bootedContainer();
    const body = container.cradle.agentBodyFactory(makeParams({ agentKey: "leader-1", isLeader: true }));
    expect(body.identity).toEqual({
      teamId: "t1",
      role: "general",
      agentKey: "leader-1",
      isLeader: true,
      ephemeral: false,
      tools: [],
      subscribe: [],
      skills: [],
      model: null,
    });
    body.stop();
  });

  test("resolves soul.tools specs through the cradle toolRegistry", () => {
    const container = bootedContainer();
    const body = container.cradle.agentBodyFactory(makeParams({ soul: makeSoul({ tools: ["noop", "mock-*"] }) }));
    expect(toolRegistry.resolve).toHaveBeenCalledWith("noop");
    expect(toolRegistry.resolve).toHaveBeenCalledWith("mock-*");
    body.stop();
  });

  test("publishes agent.model.assigned through the cradle eventManager when a model is given", () => {
    const container = bootedContainer();
    const body = container.cradle.agentBodyFactory(makeParams({ model: makeModel("anthropic", "claude-sonnet-4") }));
    expect(eventManager.publish).toHaveBeenCalledTimes(1);
    const env = eventManager.publish.mock.calls[0]![0]!;
    expect(env.topic).toBe("agent.model.assigned");
    expect(env.payload).toMatchObject({ provider: "anthropic", model: "claude-sonnet-4" });
    body.stop();
  });

  test("registers a singleton factory", () => {
    const container = bootedContainer();
    expect(container.cradle.agentBodyFactory).toBe(container.resolve("agentBodyFactory"));
  });

  test("does not snapshot settings at body construction so compaction settings stay live", () => {
    const container = bootedContainer();
    const body = container.cradle.agentBodyFactory(makeParams());
    expect(settingsStore.load).not.toHaveBeenCalled();
    body.stop();
  });

  test("wires resolveModel from modelRegistry so user.model.update hot-swaps the agent model", async () => {
    const subscribers = new Map<string, (event: EventEnvelope<EventType>) => void>();
    eventManager.subscribe.mockImplementation((eventType: string, callback: (event: EventEnvelope<EventType>) => void) => {
      subscribers.set(eventType, callback);
      return () => {
        subscribers.delete(eventType);
      };
    });
    transcriptStore.restore.mockResolvedValue([]);
    modelRegistry.resolve.mockReturnValue(makeModel("lm-studio", "qwen3.5-2b"));
    const container = bootedContainer();
    const body = container.cradle.agentBodyFactory(makeParams({
      soul: makeSoul({ model: "" }),
      model: makeModel("anthropic", "claude-sonnet-4"),
    }));
    await body.start();
    subscribers.get("user.model.update")!(Events.userModelUpdate({ kind: "user" }, "lm-studio", "qwen3.5-2b"));
    expect(modelRegistry.resolve).toHaveBeenCalledWith("lm-studio", "qwen3.5-2b");
    const last = eventManager.publish.mock.calls[eventManager.publish.mock.calls.length - 1]![0]!;
    expect(last.topic).toBe("agent.model.assigned");
    expect(last.payload).toMatchObject({ provider: "lm-studio", model: "qwen3.5-2b" });
    body.stop();
  });
});
