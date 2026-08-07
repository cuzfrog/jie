import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { asValue, createContainer, InjectionMode, type AwilixContainer } from "awilix";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { ModelRegistry, Settings, SettingsStore } from "../config";
import type { PlatformCradle } from "../container";
import type { AgentBody, AgentBodyParams } from "../core";
import type { EventManager } from "../event";
import type { SkillManager } from "../skills";
import type { KanbanStore, TranscriptStore } from "../storage";
import { registerTeamModule } from "./module";

const eventManager = vi.mocked<EventManager>({
  publish: vi.fn(),
  subscribe: vi.fn(),
});

const settingsStore = vi.mocked<SettingsStore>({
  load: vi.fn(),
  setDefaultProvider: vi.fn(),
  setDefaultEffort: vi.fn(),
  setDefaultTeam: vi.fn(),
  setModelFilters: vi.fn(),
});

const modelRegistry = vi.mocked<ModelRegistry>({
  providers: vi.fn(() => []),
  listProviders: vi.fn(() => []),
  resolve: vi.fn(() => undefined),
  listModels: vi.fn(() => []),
  getApiKey: vi.fn(() => undefined),
  reload: vi.fn(),
});

const skillManager = vi.mocked<SkillManager>({
  resolve: vi.fn(() => []),
  reload: vi.fn(),
});

const transcriptStore = vi.mocked<TranscriptStore>({
  persist: vi.fn(),
  compact: vi.fn(),
  restore: vi.fn(),
  hasSession: vi.fn(() => false),
  listSessions: vi.fn(() => []),
  sessionName: vi.fn(() => null),
  renameSession: vi.fn(),
});

const kanbanStore = vi.mocked<KanbanStore>({
  load: vi.fn(() => []),
  replace: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  complete: vi.fn(),
  editContent: vi.fn(),
  editDescription: vi.fn(),
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
    transcriptStore: asValue(transcriptStore),
    kanbanStore: asValue(kanbanStore),
    skillManager: asValue(skillManager),
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
      tools: params.soul.tools,
      subscribe: params.soul.subscribe,
      skills: params.soul.skills.map((name) => ({ name, description: "", argumentHint: null })),
      model: null,
    },
    restore: async () => [],
    messages: () => [],
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
    expect(container.cradle.teamManager.listInstalled()).toContain("default-solo");
  });

  test("load() builds the builtin default-solo team through the cradle agentBodyFactory", async () => {
    const container = bootedContainer(homeJieDir, null);
    const team = await container.cradle.teamManager.load();
    expect(team.id).toBe("default-solo");
    expect(team.leaderKey).toBe("general-1");
    expect(agentBodyFactory).toHaveBeenCalledTimes(1);
    expect(agentBodyFactory).toHaveBeenCalledWith(
      expect.objectContaining({ agentKey: "general-1", teamId: "default-solo", isLeader: true }));
    container.cradle.teamManager.stop();
  });
});
