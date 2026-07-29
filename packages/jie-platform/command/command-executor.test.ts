import { type Api, type Model } from "@earendil-works/pi-ai";
import { type AuthStore, type ModelRegistry, type Settings, type SettingsStore } from "../config";
import { JiePlatformError } from "../jie-platform-errors";
import { type GitService, type GitSnapshot } from "../services";
import { type TeamManager } from "../team";
import { type TeamInfo } from "../types";
import { CommandExecutorImpl } from "./command-executor";

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
});

const modelRegistry = vi.mocked<ModelRegistry>({
  providers: vi.fn(),
  listProviders: vi.fn(),
  resolve: vi.fn(),
  listModels: vi.fn(),
  getApiKey: vi.fn(),
});

const teamManager = vi.mocked<TeamManager>({
  load: vi.fn(),
  resumeSession: vi.fn(),
  renameSession: vi.fn(),
  listInstalled: vi.fn(),
  agentCount: vi.fn(),
  listLoaded: vi.fn(),
  locate: vi.fn(),
  agents: vi.fn(),
  listSessions: vi.fn(),
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

function fakeModel(provider: "anthropic" | "openai", id: string, name: string): Model<Api> {
  return {
    id,
    name,
    api: provider === "anthropic" ? "anthropic-messages" : "openai-completions",
    provider,
    baseUrl: "https://example.com",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1000,
    maxTokens: 100,
  };
}

let executor: CommandExecutorImpl;

beforeEach(() => {
  executor = new CommandExecutorImpl(authStore, settingsStore, modelRegistry, teamManager, gitService);
  settingsStore.load.mockReturnValue(DEFAULT_SETTINGS);
  authStore.load.mockReturnValue({});
  gitService.getSnapshot.mockReturnValue(EMPTY_GIT_SNAPSHOT);
  modelRegistry.providers.mockReturnValue(["anthropic", "my-local"]);
});

describe("CommandExecutorImpl", () => {
  describe("login", () => {
    test("calls authStore.setProvider with the provider and key and returns null", async () => {
      const result = await executor.execute({ name: "login", provider: "anthropic", apiKey: "sk-test" });
      expect(result).toBeNull();
      expect(authStore.setProvider).toHaveBeenCalledWith("anthropic", "sk-test");
    });
  });

  describe("logout", () => {
    test("with provider, removes only that provider", async () => {
      const result = await executor.execute({ name: "logout", provider: "anthropic" });
      expect(result).toBeNull();
      expect(authStore.removeProvider).toHaveBeenCalledWith("anthropic");
      expect(authStore.clear).not.toHaveBeenCalled();
    });

    test("without provider, clears all providers", async () => {
      const result = await executor.execute({ name: "logout" });
      expect(result).toBeNull();
      expect(authStore.clear).toHaveBeenCalled();
      expect(authStore.removeProvider).not.toHaveBeenCalled();
    });
  });

  describe("setApiKey", () => {
    test("writes the api key for the configured default provider", async () => {
      settingsStore.load.mockReturnValue({ defaultProvider: "anthropic" });
      const result = await executor.execute({ name: "setApiKey", apiKey: "sk-new" });
      expect(result).toBeNull();
      expect(authStore.setProvider).toHaveBeenCalledWith("anthropic", "sk-new");
    });

    test("throws NO_DEFAULT_PROVIDER when settings has no defaultProvider", async () => {
      settingsStore.load.mockReturnValue({});
      const pending = executor.execute({ name: "setApiKey", apiKey: "sk-new" });
      await expect(pending).rejects.toThrow(JiePlatformError);
      await expect(pending).rejects.toMatchObject({ code: "NO_DEFAULT_PROVIDER" });
      expect(authStore.setProvider).not.toHaveBeenCalled();
    });
  });

  describe("setDefaultModel", () => {
    test("accepts a custom provider registered in models.json", async () => {
      const result = await executor.execute({ name: "setDefaultModel", provider: "my-local", id: "qwen3.5-2b" });
      expect(result).toBeNull();
      expect(settingsStore.setDefaultProvider).toHaveBeenCalledWith("my-local", "qwen3.5-2b");
    });

    test("accepts a builtin provider and writes the provider/model pair", async () => {
      const result = await executor.execute({ name: "setDefaultModel", provider: "anthropic", id: "claude-sonnet-4-5" });
      expect(result).toBeNull();
      expect(settingsStore.setDefaultProvider).toHaveBeenCalledWith("anthropic", "claude-sonnet-4-5");
    });

    test("throws UNKNOWN_PROVIDER for a provider that is not in the registry", async () => {
      const pending = executor.execute({ name: "setDefaultModel", provider: "no-such-provider", id: "x" });
      await expect(pending).rejects.toThrow(JiePlatformError);
      await expect(pending).rejects.toMatchObject({ code: "UNKNOWN_PROVIDER" });
      expect(settingsStore.setDefaultProvider).not.toHaveBeenCalled();
    });
  });

  describe("getDefaultModel", () => {
    test("returns the configured default model", async () => {
      settingsStore.load.mockReturnValueOnce({ defaultProvider: "anthropic", defaultModel: "claude-sonnet-4-5" });
      const result = await executor.execute({ name: "getDefaultModel" });
      expect(result).toEqual({ provider: "anthropic", id: "claude-sonnet-4-5", effort: "off", contextWindow: null });
    });

    test("carries the configured defaultEffort instead of 'off'", async () => {
      settingsStore.load.mockReturnValueOnce({ defaultProvider: "anthropic", defaultModel: "claude-sonnet-4-5", defaultEffort: "high" });
      const result = await executor.execute({ name: "getDefaultModel" });
      expect(result).toEqual({ provider: "anthropic", id: "claude-sonnet-4-5", effort: "high", contextWindow: null });
    });

    test("returns null when no defaults are configured", async () => {
      settingsStore.load.mockReturnValueOnce({});
      const result = await executor.execute({ name: "getDefaultModel" });
      expect(result).toBeNull();
    });

    test("returns null when only defaultProvider is set (no defaultModel)", async () => {
      settingsStore.load.mockReturnValueOnce({ defaultProvider: "anthropic" });
      const result = await executor.execute({ name: "getDefaultModel" });
      expect(result).toBeNull();
    });
  });

  describe("setDefaultEffort", () => {
    test("persists the effort via settingsStore.setDefaultEffort", async () => {
      const result = await executor.execute({ name: "setDefaultEffort", effort: "high" });
      expect(result).toBeNull();
      expect(settingsStore.setDefaultEffort).toHaveBeenCalledWith("high");
    });
  });

  describe("getDefaultEffort", () => {
    test("returns the configured defaultEffort", async () => {
      settingsStore.load.mockReturnValueOnce({ defaultEffort: "max" });
      const result = await executor.execute({ name: "getDefaultEffort" });
      expect(result).toBe("max");
    });

    test("returns 'off' when no defaultEffort is configured", async () => {
      settingsStore.load.mockReturnValueOnce({});
      const result = await executor.execute({ name: "getDefaultEffort" });
      expect(result).toBe("off");
    });
  });

  describe("listModels", () => {
    test("flattens each provider's models into provider/id/name entries", async () => {
      modelRegistry.providers.mockReturnValueOnce(["anthropic", "openai"]);
      modelRegistry.listModels.mockImplementation((provider) => provider === "anthropic"
        ? [fakeModel("anthropic", "claude-sonnet-4-5", "Claude Sonnet 4.5"), fakeModel("anthropic", "claude-opus-4-5", "Claude Opus 4.5")]
        : [fakeModel("openai", "gpt-5", "GPT-5")]);
      const result = await executor.execute({ name: "listModels" });
      expect(result).toEqual([
        { provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
        { provider: "anthropic", id: "claude-opus-4-5", name: "Claude Opus 4.5" },
        { provider: "openai", id: "gpt-5", name: "GPT-5" },
      ]);
      expect(modelRegistry.listModels).toHaveBeenCalledWith("anthropic");
      expect(modelRegistry.listModels).toHaveBeenCalledWith("openai");
    });

    test("returns an empty array when no provider lists models", async () => {
      modelRegistry.listModels.mockReturnValue([]);
      const result = await executor.execute({ name: "listModels" });
      expect(result).toEqual([]);
    });
  });

  describe("listProviders", () => {
    test("describes a provider by its set env var name", async () => {
      modelRegistry.listProviders.mockReturnValue([{ id: "anthropic", configured: false, envKeys: ["ANTHROPIC_API_KEY"] }]);
      const result = await executor.execute({ name: "listProviders" });
      expect(result).toEqual([{ id: "anthropic", description: "ANTHROPIC_API_KEY" }]);
    });

    test("describes a configured provider without env keys as configured", async () => {
      modelRegistry.listProviders.mockReturnValue([{ id: "my-local", configured: true, envKeys: [] }]);
      const result = await executor.execute({ name: "listProviders" });
      expect(result).toEqual([{ id: "my-local", description: "configured" }]);
    });

    test("omits the description for a built-in without env keys", async () => {
      modelRegistry.listProviders.mockReturnValue([{ id: "openai", configured: false, envKeys: [] }]);
      const result = await executor.execute({ name: "listProviders" });
      expect(result).toEqual([{ id: "openai" }]);
    });
  });

  describe("setDefaultTeam", () => {
    test("maps a project-scoped blueprint to the project scope", async () => {
      teamManager.locate.mockReturnValue("project");
      const result = await executor.execute({ name: "setDefaultTeam", teamId: "alpha" });
      expect(result).toBeNull();
      expect(teamManager.locate).toHaveBeenCalledWith("alpha");
      expect(settingsStore.setDefaultTeam).toHaveBeenCalledWith("alpha", "project");
    });

    test("maps a user-scoped blueprint to the global scope", async () => {
      teamManager.locate.mockReturnValue("user");
      const result = await executor.execute({ name: "setDefaultTeam", teamId: "alpha" });
      expect(result).toBeNull();
      expect(settingsStore.setDefaultTeam).toHaveBeenCalledWith("alpha", "global");
    });

    test("throws TEAM_NOT_FOUND when the blueprint is not installed", async () => {
      teamManager.locate.mockReturnValue(null);
      const pending = executor.execute({ name: "setDefaultTeam", teamId: "ghost" });
      await expect(pending).rejects.toThrow(JiePlatformError);
      await expect(pending).rejects.toMatchObject({ code: "TEAM_NOT_FOUND" });
      expect(settingsStore.setDefaultTeam).not.toHaveBeenCalled();
    });
  });

  describe("team", () => {
    test("delegates to teamManager.load and returns the team identity", async () => {
      const identity: TeamInfo = {
        id: "alpha",
        leaderKey: "general-1",
        history: [],
        agents: [{ teamId: "alpha", role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], model: null }],
      };
      teamManager.load.mockResolvedValue(identity);
      const result = await executor.execute({ name: "team", teamId: "alpha" });
      expect(result).toBe(identity);
      expect(teamManager.load).toHaveBeenCalledWith("alpha");
    });
  });

  describe("resumeSession", () => {
    test("delegates to teamManager.resumeSession with teamId and sessionId", async () => {
      const identity: TeamInfo = { id: "alpha", leaderKey: "general-1", agents: [], history: [] };
      teamManager.resumeSession.mockResolvedValue(identity);
      const result = await executor.execute({ name: "resumeSession", teamId: "alpha", sessionId: "s1" });
      expect(result).toBe(identity);
      expect(teamManager.resumeSession).toHaveBeenCalledWith("alpha", "s1");
    });
  });

  describe("getTeamInfo", () => {
    test("returns defaultTeam from settings and the installed list from teamManager", async () => {
      settingsStore.load.mockReturnValueOnce({ defaultProvider: "anthropic", defaultModel: "m", defaultTeam: "alpha" });
      teamManager.listInstalled.mockReturnValue(["minimal", "alpha", "beta"]);
      teamManager.agentCount.mockImplementation((teamId: string) => (teamId === "alpha" ? 3 : 1));
      const result = await executor.execute({ name: "getTeamInfo" });
      expect(result).toEqual({
        defaultTeam: "alpha",
        installed: [
          { id: "minimal", agentCount: 1 },
          { id: "alpha", agentCount: 3 },
          { id: "beta", agentCount: 1 },
        ],
      });
    });

    test("returns defaultTeam: null when settings has no defaultTeam", async () => {
      settingsStore.load.mockReturnValueOnce({ defaultProvider: "anthropic", defaultModel: "m" });
      teamManager.listInstalled.mockReturnValue(["minimal"]);
      teamManager.agentCount.mockReturnValue(2);
      const result = await executor.execute({ name: "getTeamInfo" });
      expect(result).toEqual({ defaultTeam: null, installed: [{ id: "minimal", agentCount: 2 }] });
    });
  });

  describe("getGitStatus", () => {
    test("returns the cached git snapshot from gitService", async () => {
      const snapshot: GitSnapshot = { branch: "main", dirty: true, ahead: 2, behind: 0 };
      gitService.getSnapshot.mockReturnValueOnce(snapshot);
      const result = await executor.execute({ name: "getGitStatus" });
      expect(result).toBe(snapshot);
      expect(gitService.getSnapshot).toHaveBeenCalled();
    });
  });

  describe("stop", () => {
    test("delegates to teamManager.stop", async () => {
      const result = await executor.execute({ name: "stop" });
      expect(result).toBeNull();
      expect(teamManager.stop).toHaveBeenCalledTimes(1);
    });
  });

  describe("listSessions", () => {
    test("returns the sessions for the requested teamId via teamManager", async () => {
      const fakeSessions = [
        { sessionId: "s1", messageCount: 3, lastActivity: "2026-07-13T10:00:00.000Z" },
        { sessionId: "s2", messageCount: 7, lastActivity: "2026-07-13T11:00:00.000Z" },
      ];
      teamManager.listSessions.mockReturnValueOnce(fakeSessions);
      const result = await executor.execute({ name: "listSessions", teamId: "alpha" });
      expect(result).toBe(fakeSessions);
      expect(teamManager.listSessions).toHaveBeenCalledWith("alpha");
    });

    test("returns an empty array for a team with no sessions", async () => {
      teamManager.listSessions.mockReturnValueOnce([]);
      const result = await executor.execute({ name: "listSessions", teamId: "ghost" });
      expect(result).toEqual([]);
    });
  });

  describe("renameSession", () => {
    test("delegates teamId and session name to the team manager", async () => {
      const result = await executor.execute({ name: "renameSession", teamId: "alpha", sessionName: "my session" });
      expect(result).toBeNull();
      expect(teamManager.renameSession).toHaveBeenCalledWith("alpha", "my session");
    });

    test("propagates team manager errors", async () => {
      teamManager.renameSession.mockImplementationOnce(() => {
        throw new JiePlatformError("NO_TEAM", { detail: "no session loaded for team 'ghost'" });
      });
      const pending = executor.execute({ name: "renameSession", teamId: "ghost", sessionName: "x" });
      await expect(pending).rejects.toMatchObject({ code: "NO_TEAM" });
    });
  });

  describe("dispatch", () => {
    test("executor.execute is the single entry point for every command name", async () => {
      teamManager.locate.mockReturnValue("user");
      teamManager.load.mockResolvedValue({ id: "alpha", leaderKey: "general-1", agents: [], history: [] });
      teamManager.resumeSession.mockResolvedValue({ id: "alpha", leaderKey: "general-1", agents: [], history: [] });
      teamManager.listInstalled.mockReturnValue([]);
      teamManager.listSessions.mockReturnValue([]);
      modelRegistry.listModels.mockReturnValue([]);
      const commands: Array<Parameters<typeof executor.execute>[0]> = [
        { name: "login", provider: "anthropic", apiKey: "sk-test" },
        { name: "logout" },
        { name: "setApiKey", apiKey: "sk-test" },
        { name: "setDefaultModel", provider: "anthropic", id: "claude-sonnet-4-5" },
        { name: "getDefaultModel" },
        { name: "setDefaultEffort", effort: "high" },
        { name: "getDefaultEffort" },
        { name: "listModels" },
        { name: "setDefaultTeam", teamId: "alpha" },
        { name: "team", teamId: "alpha" },
        { name: "resumeSession", teamId: "alpha", sessionId: "s1" },
        { name: "renameSession", teamId: "alpha", sessionName: "my session" },
        { name: "getTeamInfo" },
        { name: "getGitStatus" },
        { name: "stop" },
        { name: "listSessions", teamId: "alpha" },
      ];
      for (const command of commands) {
        await executor.execute(command);
      }
      expect(teamManager.stop).toHaveBeenCalled();
      expect(authStore.setProvider).toHaveBeenCalled();
    });
  });
});
