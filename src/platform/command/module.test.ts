import { asValue, createContainer, InjectionMode, type AwilixContainer } from "awilix";
import type { AuthStore, ModelRegistry, SettingsStore } from "../config";
import type { PlatformCradle } from "../container";
import type { EventManager } from "../event";
import type { LlmService } from "../llm";
import type { GitService, GitSnapshot } from "../services";
import type { KanbanStore } from "../storage";
import type { TeamManager } from "../team";
import { registerCommandModule } from "./module";

const authStore = vi.mocked<AuthStore>({
  load: vi.fn(),
  setProvider: vi.fn(),
  removeProvider: vi.fn(),
  clear: vi.fn(),
});

const settingsStore = vi.mocked<SettingsStore>({
  load: vi.fn(),
  setDefaultProvider: vi.fn(),
  setDefaultEffort: vi.fn(),
  setDefaultTeam: vi.fn(),
  setModelFilters: vi.fn(),
  setNotificationSoundEnabled: vi.fn(),
  setModelAlias: vi.fn(),
});

const modelRegistry = vi.mocked<ModelRegistry>({
  providers: vi.fn(),
  listProviders: vi.fn(),
  resolve: vi.fn(),
  listModels: vi.fn(),
  getApiKey: vi.fn(),
  reload: vi.fn(),
});

const teamManager = vi.mocked<TeamManager>({
  load: vi.fn(),
  reload: vi.fn(),
  listInstalled: vi.fn(),
  agentCount: vi.fn(),
  listLoaded: vi.fn(),
  locate: vi.fn(),
  agents: vi.fn(),
  listSessions: vi.fn(),
  resumeSession: vi.fn(),
  renameSession: vi.fn(),
  currentSessionId: vi.fn(),
  compact: vi.fn(),
  stop: vi.fn(),
});

const gitService = vi.mocked<GitService>({
  getSnapshot: vi.fn(),
});

const eventManager = vi.mocked<EventManager>({
  publish: vi.fn(),
  subscribe: vi.fn(),
});

const kanbanStore = vi.mocked<KanbanStore>({
  load: vi.fn(),
  replace: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  setStatus: vi.fn(),
  editContent: vi.fn(),
  editDescription: vi.fn(),
  handoff: vi.fn(),
  update: vi.fn(),
  claim: vi.fn(),
});

const llmService = vi.mocked<LlmService>({ complete: vi.fn() });

function bootedContainer(): AwilixContainer<PlatformCradle> {
  const container = createContainer<PlatformCradle>({ injectionMode: InjectionMode.CLASSIC });
  container.register({
    authStore: asValue(authStore),
    settingsStore: asValue(settingsStore),
    modelRegistry: asValue(modelRegistry),
    teamManager: asValue(teamManager),
    gitService: asValue(gitService),
    eventManager: asValue(eventManager),
    kanbanStore: asValue(kanbanStore),
    llmService: asValue(llmService),
  });
  registerCommandModule(container);
  return container;
}

describe("registerCommandModule", () => {
  test("registers commandExecutor as a singleton", () => {
    const container = bootedContainer();
    expect(container.resolve("commandExecutor")).toBe(container.cradle.commandExecutor);
  });

  test("execute dispatches through the cradle-resolved settingsStore", async () => {
    settingsStore.load.mockReturnValue({ defaultProvider: "anthropic", defaultModel: "claude-sonnet-4-5" });
    const container = bootedContainer();
    const result = await container.cradle.commandExecutor.execute({ name: "getDefaultModel" });
    expect(result).toEqual({ provider: "anthropic", id: "claude-sonnet-4-5", effort: "off", contextWindow: null });
  });

  test("getGitStatus delegates to the cradle gitService", async () => {
    const snapshot: GitSnapshot = { branch: "main", dirty: false, ahead: 0, behind: 0 };
    gitService.getSnapshot.mockReturnValue(snapshot);
    const container = bootedContainer();
    expect(await container.cradle.commandExecutor.execute({ name: "getGitStatus" })).toBe(snapshot);
  });
});
