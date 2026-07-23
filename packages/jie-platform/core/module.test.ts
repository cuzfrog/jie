import { asValue, createContainer, InjectionMode, type AwilixContainer } from "awilix";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ModelRegistry } from "../config";
import type { PlatformCradle } from "../container";
import type { EventManager } from "../event";
import type { ArtifactStore, MemoryManager } from "../storage";
import type { AgentSoul } from "../team";
import type { ToolRegistry } from "../tools";
import type { AgentBodyParams } from "./agent-body";
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

const memoryManager = vi.mocked<MemoryManager>({
  persist: vi.fn(),
  compact: vi.fn(),
  restore: vi.fn(),
  hasSession: vi.fn(),
  listSessions: vi.fn(),
});

const toolRegistry = vi.mocked<ToolRegistry>({
  register: vi.fn(),
  resolve: vi.fn(() => []),
  list: vi.fn(() => []),
});

const modelRegistry = vi.mocked<ModelRegistry>({
  providers: vi.fn(() => []),
  resolve: vi.fn(() => undefined),
  listModels: vi.fn(() => []),
  getApiKey: vi.fn(() => undefined),
});

function bootedContainer(): AwilixContainer<PlatformCradle> {
  const container = createContainer<PlatformCradle>({ injectionMode: InjectionMode.CLASSIC });
  container.register({
    eventManager: asValue(eventManager),
    artifactStore: asValue(artifactStore),
    memoryManager: asValue(memoryManager),
    toolRegistry: asValue(toolRegistry),
    modelRegistry: asValue(modelRegistry),
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
  return {
    agentKey: "general-1",
    teamId: "t1",
    soul: makeSoul(),
    isLeader: false,
    sessionId: "s1",
    model: undefined,
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
});
