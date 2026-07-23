import { asValue, createContainer, InjectionMode, type AwilixContainer } from "awilix";
import type { AuthStore, SettingsStore } from "../config";
import type { PlatformCradle } from "../container";
import type { GitService, GitSnapshot } from "../services";
import type { TeamManager } from "../team";
import { registerCommandModule } from "./module";

const authStore = vi.mocked<AuthStore>({
  load: vi.fn(),
  saveAuthConfig: vi.fn(),
  setProvider: vi.fn(),
  removeProvider: vi.fn(),
  clear: vi.fn(),
});

const settingsStore = vi.mocked<SettingsStore>({
  load: vi.fn(),
  setDefaultProvider: vi.fn(),
  setDefaultTeam: vi.fn(),
});

const teamManager = vi.mocked<TeamManager>({
  load: vi.fn(),
  listInstalled: vi.fn(),
  listLoaded: vi.fn(),
  locate: vi.fn(),
  agents: vi.fn(),
  listSessions: vi.fn(),
  resumeSession: vi.fn(),
  stop: vi.fn(),
});

const gitService = vi.mocked<GitService>({
  getSnapshot: vi.fn(),
});

function bootedContainer(): AwilixContainer<PlatformCradle> {
  const container = createContainer<PlatformCradle>({ injectionMode: InjectionMode.CLASSIC });
  container.register({
    authStore: asValue(authStore),
    settingsStore: asValue(settingsStore),
    teamManager: asValue(teamManager),
    gitService: asValue(gitService),
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
