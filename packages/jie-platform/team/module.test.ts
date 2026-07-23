import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { asValue, createContainer, InjectionMode, type AwilixContainer } from "awilix";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ModelRegistry, Settings, SettingsStore } from "../config";
import type { PlatformCradle } from "../container";
import type { AgentBody, AgentBodyParams } from "../core";
import type { EventManager } from "../event";
import type { MemoryManager } from "../storage";
import { registerTeamModule } from "./module";

const eventManager = vi.mocked<EventManager>({
  publish: vi.fn(),
  subscribe: vi.fn(),
});

const settingsStore = vi.mocked<SettingsStore>({
  load: vi.fn(),
  setDefaultProvider: vi.fn(),
  setDefaultTeam: vi.fn(),
});

const modelRegistry = vi.mocked<ModelRegistry>({
  providers: vi.fn(() => []),
  resolve: vi.fn(() => undefined),
  listModels: vi.fn(() => []),
  getApiKey: vi.fn(() => undefined),
});

const memoryManager = vi.mocked<MemoryManager>({
  persist: vi.fn(),
  compact: vi.fn(),
  restore: vi.fn(),
  hasSession: vi.fn(() => false),
  listSessions: vi.fn(() => []),
});

const agentBodyFactory = vi.fn<(params: AgentBodyParams) => AgentBody>();

const DEFAULT_SETTINGS: Settings = {
  defaultProvider: "anthropic",
  defaultModel: "claude-sonnet-4-5",
};

function bootedContainer(homeJieDir: string, projectJieDir: string | null): AwilixContainer<PlatformCradle> {
  const container = createContainer<PlatformCradle>({ injectionMode: InjectionMode.CLASSIC });
  container.register({
    homeJieDir: asValue(homeJieDir),
    projectJieDir: asValue(projectJieDir),
    eventManager: asValue(eventManager),
    settingsStore: asValue(settingsStore),
    modelRegistry: asValue(modelRegistry),
    memoryManager: asValue(memoryManager),
    agentBodyFactory: asValue(agentBodyFactory),
  });
  registerTeamModule(container);
  return container;
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

function makeFakeBody(params: AgentBodyParams): AgentBody {
  return {
    identity: {
      teamId: params.teamId,
      role: params.soul.role,
      agentKey: params.agentKey,
      isLeader: params.isLeader,
      model: null,
    },
    restore: async () => [],
    start: async () => {},
    stop: () => {},
  };
}

describe("registerTeamModule", () => {
  let homeJieDir: string;

  beforeEach(() => {
    homeJieDir = mkdtempSync(join(tmpdir(), "jie-team-module-"));
    settingsStore.load.mockReturnValue(DEFAULT_SETTINGS);
    modelRegistry.resolve.mockReturnValue(makeModel("anthropic", "claude-sonnet-4-5"));
    agentBodyFactory.mockImplementation(makeFakeBody);
  });

  afterEach(() => {
    rmSync(homeJieDir, { recursive: true, force: true });
  });

  test("registers teamManager as a singleton", () => {
    const container = bootedContainer(homeJieDir, null);
    expect(container.resolve("teamManager")).toBe(container.cradle.teamManager);
  });

  test("listInstalled flows through the registry built from the cradle dirs", () => {
    const container = bootedContainer(homeJieDir, null);
    expect(container.cradle.teamManager.listInstalled()).toContain("minimal");
  });

  test("load() builds the builtin minimal team through the cradle agentBodyFactory", async () => {
    const container = bootedContainer(homeJieDir, null);
    const team = await container.cradle.teamManager.load();
    expect(team.id).toBe("minimal");
    expect(team.leaderKey).toBe("general-1");
    expect(agentBodyFactory).toHaveBeenCalledTimes(1);
    expect(agentBodyFactory).toHaveBeenCalledWith(expect.objectContaining({ agentKey: "general-1", teamId: "minimal", isLeader: true }));
    container.cradle.teamManager.stop();
  });
});
