import { type AuthStore, type Settings, type SettingsStore } from "../config";
import { type TeamManager } from "../team";
import { type GitService, type GitSnapshot } from "../services";
import { type CommandExecutor, createCommandExecutor } from "./command-executor";

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
  stop: vi.fn(),
});

const gitService = vi.mocked<GitService>({
  getSnapshot: vi.fn(),
});

const DEFAULT_SETTINGS: Settings = {
  defaultProvider: "anthropic",
  defaultModel: "claude-sonnet-4-5",
};

const EMPTY_GIT_SNAPSHOT: GitSnapshot = { branch: "", dirty: false, ahead: 0, behind: 0 };

type AuthConfig = ReturnType<typeof authStore.setProvider>;
type AuthConfigRemoved = ReturnType<typeof authStore.removeProvider>;
type AuthConfigCleared = ReturnType<typeof authStore.clear>;
type TeamInfo = Awaited<ReturnType<typeof teamManager.load>>;

function makeExecutor(): CommandExecutor {
  return createCommandExecutor({ authStore, settingsStore, teamManager, gitService });
}

beforeEach(() => {
  settingsStore.load.mockReturnValue(DEFAULT_SETTINGS);
  authStore.load.mockReturnValue({});
  gitService.getSnapshot.mockReturnValue(EMPTY_GIT_SNAPSHOT);
});

describe("CommandExecutor", () => {
  describe("login", () => {
    test("calls authStore.setProvider and persists the new auth config", async () => {
      const next: AuthConfig = { anthropic: { type: "api_key", key: "sk-test" } };
      authStore.load.mockReturnValue({});
      authStore.setProvider.mockReturnValue(next);
      const executor = makeExecutor();
      const result = await executor.execute({ name: "login", provider: "anthropic", apiKey: "sk-test" });
      expect(result).toBeNull();
      expect(authStore.load).toHaveBeenCalled();
      expect(authStore.setProvider).toHaveBeenCalledWith({}, "anthropic", "sk-test");
      expect(authStore.saveAuthConfig).toHaveBeenCalledWith(next);
    });
  });

  describe("logout", () => {
    test("without provider, clears all providers", async () => {
      const cleared: AuthConfigCleared = {};
      authStore.clear.mockReturnValue(cleared);
      const executor = makeExecutor();
      const result = await executor.execute({ name: "logout" });
      expect(result).toBeNull();
      expect(authStore.clear).toHaveBeenCalled();
      expect(authStore.saveAuthConfig).toHaveBeenCalledWith(cleared);
      expect(authStore.removeProvider).not.toHaveBeenCalled();
    });

    test("with provider, removes only that provider", async () => {
      const existing: AuthConfig = { anthropic: { type: "api_key", key: "sk-test" } };
      const after: AuthConfigRemoved = {};
      authStore.load.mockReturnValue(existing);
      authStore.removeProvider.mockReturnValue(after);
      const executor = makeExecutor();
      const result = await executor.execute({ name: "logout", provider: "anthropic" });
      expect(result).toBeNull();
      expect(authStore.removeProvider).toHaveBeenCalledWith(existing, "anthropic");
      expect(authStore.saveAuthConfig).toHaveBeenCalledWith(after);
      expect(authStore.clear).not.toHaveBeenCalled();
    });
  });

  describe("setApiKey", () => {
    test("writes the api key for the configured default provider", async () => {
      const next: AuthConfig = { anthropic: { type: "api_key", key: "sk-new" } };
      authStore.load.mockReturnValue({});
      authStore.setProvider.mockReturnValue(next);
      const executor = makeExecutor();
      const result = await executor.execute({ name: "setApiKey", apiKey: "sk-new" });
      expect(result).toBeNull();
      expect(authStore.setProvider).toHaveBeenCalledWith({}, "anthropic", "sk-new");
      expect(authStore.saveAuthConfig).toHaveBeenCalledWith(next);
    });

    test("throws NO_DEFAULT_PROVIDER when settings has no defaultProvider", async () => {
      settingsStore.load.mockReturnValue({});
      const executor = makeExecutor();
      expect(executor.execute({ name: "setApiKey", apiKey: "sk-new" })).rejects.toThrow(
        /NO_DEFAULT_PROVIDER|default provider/,
      );
      expect(authStore.saveAuthConfig).not.toHaveBeenCalled();
    });
  });

  describe("setDefaultModel", () => {
    test("writes the provider/model pair via settingsStore", async () => {
      const executor = makeExecutor();
      const result = await executor.execute({ name: "setDefaultModel", provider: "anthropic", id: "claude-sonnet-4-5", effort: "off" });
      expect(result).toBeNull();
      expect(settingsStore.setDefaultProvider).toHaveBeenCalledWith("anthropic", "claude-sonnet-4-5");
    });

    test("throws UNKNOWN_PROVIDER for a provider that is not in the known list", async () => {
      const executor = makeExecutor();
      const callsBefore = settingsStore.setDefaultProvider.mock.calls.length;
      expect(
        executor.execute({ name: "setDefaultModel", provider: "no-such-provider", id: "x", effort: "off" }),
      ).rejects.toThrow(/Unknown provider/);
      expect(settingsStore.setDefaultProvider.mock.calls.length).toBe(callsBefore);
    });
  });

  describe("getDefaultModel", () => {
    test("returns the configured default model", async () => {
      settingsStore.load.mockReturnValueOnce({ defaultProvider: "anthropic", defaultModel: "claude-sonnet-4-5" });
      const executor = makeExecutor();
      const result = await executor.execute({ name: "getDefaultModel" });
      expect(result).toEqual({ provider: "anthropic", id: "claude-sonnet-4-5", effort: "off" });
    });

    test("returns null when no defaults are configured", async () => {
      settingsStore.load.mockReturnValueOnce({});
      const executor = makeExecutor();
      const result = await executor.execute({ name: "getDefaultModel" });
      expect(result).toBeNull();
    });

    test("returns null when only defaultProvider is set (no defaultModel)", async () => {
      settingsStore.load.mockReturnValueOnce({ defaultProvider: "anthropic" });
      const executor = makeExecutor();
      const result = await executor.execute({ name: "getDefaultModel" });
      expect(result).toBeNull();
    });
  });

  describe("setDefaultTeam", () => {
    test("delegates to settingsStore.setDefaultTeam with the requested teamId", async () => {
      const executor = makeExecutor();
      const result = await executor.execute({ name: "setDefaultTeam", teamId: "alpha" });
      expect(result).toBeNull();
      expect(teamManager.locate).not.toHaveBeenCalled();
      expect(settingsStore.setDefaultTeam).toHaveBeenCalledWith("alpha");
    });
  });

  describe("team", () => {
    test("delegates to teamManager.load and returns the team identity", async () => {
      const identity: TeamInfo = {
        id: "alpha",
        leaderKey: "general-1",
        agents: [{ teamId: "alpha", role: "general", agentKey: "general-1", isLeader: true, model: null }],
      };
      teamManager.load.mockResolvedValue(identity);
      const executor = makeExecutor();
      const result = await executor.execute({ name: "team", teamId: "alpha" });
      expect(result).toBe(identity);
      expect(teamManager.load).toHaveBeenCalledWith("alpha");
    });
  });

  describe("getTeamInfo", () => {
    test("returns defaultTeam from settings and the installed list from teamManager", async () => {
      settingsStore.load.mockReturnValueOnce({ defaultProvider: "anthropic", defaultModel: "m", defaultTeam: "alpha" });
      teamManager.listInstalled.mockReturnValue(["minimal", "alpha", "beta"]);
      const executor = makeExecutor();
      const result = await executor.execute({ name: "getTeamInfo" });
      expect(result).toEqual({ defaultTeam: "alpha", installed: ["minimal", "alpha", "beta"] });
    });

    test("returns defaultTeam: null when settings has no defaultTeam", async () => {
      settingsStore.load.mockReturnValueOnce({ defaultProvider: "anthropic", defaultModel: "m" });
      teamManager.listInstalled.mockReturnValue(["minimal"]);
      const executor = makeExecutor();
      const result = await executor.execute({ name: "getTeamInfo" });
      expect(result).toEqual({ defaultTeam: null, installed: ["minimal"] });
    });
  });

  describe("getGitStatus", () => {
    test("returns the cached git snapshot from gitService", async () => {
      const snapshot: GitSnapshot = { branch: "main", dirty: true, ahead: 2, behind: 0 };
      gitService.getSnapshot.mockReturnValueOnce(snapshot);
      const executor = makeExecutor();
      const result = await executor.execute({ name: "getGitStatus" });
      expect(result).toBe(snapshot);
      expect(gitService.getSnapshot).toHaveBeenCalled();
    });
  });

  describe("stop", () => {
    test("delegates to teamManager.stop", async () => {
      const executor = makeExecutor();
      const result = await executor.execute({ name: "stop" });
      expect(result).toBeNull();
      expect(teamManager.stop).toHaveBeenCalledTimes(1);
    });
  });

  describe("dispatch", () => {
    test("executor.execute is the single entry point for every command name", async () => {
      teamManager.locate.mockReturnValue("user");
      teamManager.load.mockResolvedValue({ id: "alpha", leaderKey: "general-1", agents: [] });
      teamManager.listInstalled.mockReturnValue([]);
      authStore.load.mockReturnValue({});
      authStore.setProvider.mockReturnValue({});
      authStore.clear.mockReturnValue({});
      const executor = makeExecutor();
      const commands: Array<Parameters<typeof executor.execute>[0]> = [
        { name: "login", provider: "anthropic", apiKey: "sk-test" },
        { name: "logout" },
        { name: "setApiKey", apiKey: "sk-test" },
        { name: "setDefaultModel", provider: "anthropic", id: "claude-sonnet-4-5", effort: "off" },
        { name: "getDefaultModel" },
        { name: "setDefaultTeam", teamId: "alpha" },
        { name: "team", teamId: "alpha" },
        { name: "getTeamInfo" },
        { name: "getGitStatus" },
        { name: "stop" },
      ];
      for (const command of commands) {
        await executor.execute(command);
      }
      expect(teamManager.stop).toHaveBeenCalled();
      expect(authStore.saveAuthConfig).toHaveBeenCalled();
    });
  });
});
