import { type Api, type Model } from "@earendil-works/pi-ai";
import { type AuthStore, type ModelRegistry, type Settings, type SettingsStore } from "../config";
import { type EventManager } from "../event";
import { JiePlatformError } from "../jie-platform-errors";
import { type LlmService } from "../llm";
import { type GitService, type GitSnapshot } from "../services";
import { type KanbanStore } from "../storage";
import { type TeamManager } from "../team";
import { type KanbanCard, type TeamInfo } from "../types";
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
  resumeSession: vi.fn(),
  renameSession: vi.fn(),
  listInstalled: vi.fn(),
  agentCount: vi.fn(),
  listLoaded: vi.fn(),
  locate: vi.fn(),
  agents: vi.fn(),
  bodies: vi.fn(),
  listSessions: vi.fn(),
  currentSessionId: vi.fn(),
  compact: vi.fn(),
  stop: vi.fn(),
  spawnAdHoc: vi.fn(),
  resetAgent: vi.fn(),
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
  executor = new CommandExecutorImpl(authStore, settingsStore, modelRegistry, teamManager, gitService, eventManager, kanbanStore, llmService);
  settingsStore.load.mockReturnValue(DEFAULT_SETTINGS);
  authStore.load.mockReturnValue({});
  gitService.getSnapshot.mockReturnValue(EMPTY_GIT_SNAPSHOT);
  modelRegistry.providers.mockReturnValue(["anthropic", "my-local"]);
  teamManager.currentSessionId.mockReturnValue("session-1");
  kanbanStore.load.mockReturnValue([]);
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

    test("with '*', clears all providers", async () => {
      const result = await executor.execute({ name: "logout", provider: "*" });
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

    test("publishes user.model.update so live agents apply the new model", async () => {
      await executor.execute({ name: "setDefaultModel", provider: "my-local", id: "qwen3.5-2b" });
      expect(eventManager.publish).toHaveBeenCalledWith(
        expect.objectContaining({ type: "user.model.update", payload: { provider: "my-local", modelId: "qwen3.5-2b" } }));
    });

    test("does not publish user.model.update when the provider is unknown", async () => {
      await expect(executor.execute({ name: "setDefaultModel", provider: "no-such-provider", id: "x" })).rejects.toThrow(JiePlatformError);
      expect(eventManager.publish).not.toHaveBeenCalled();
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

  describe("setModelAlias", () => {
    test("persists a resolvable alias", async () => {
      modelRegistry.resolve.mockReturnValueOnce(fakeModel("anthropic", "claude-sonnet-4-5", "Claude"));
      const result = await executor.execute({ name: "setModelAlias", alias: "large", provider: "anthropic", id: "claude-sonnet-4-5" });
      expect(result).toBeNull();
      expect(settingsStore.setModelAlias).toHaveBeenCalledWith("large", "anthropic/claude-sonnet-4-5");
    });

    test("throws UNKNOWN_PROVIDER for an unregistered provider", async () => {
      const pending = executor.execute({ name: "setModelAlias", alias: "large", provider: "no-such-provider", id: "x" });
      await expect(pending).rejects.toThrow(JiePlatformError);
      await expect(pending).rejects.toMatchObject({ code: "UNKNOWN_PROVIDER" });
      expect(settingsStore.setModelAlias).not.toHaveBeenCalled();
    });

    test("throws MODEL_UNRESOLVED for a provider/model that the registry cannot resolve", async () => {
      const pending = executor.execute({ name: "setModelAlias", alias: "large", provider: "anthropic", id: "no-such-model" });
      await expect(pending).rejects.toThrow(JiePlatformError);
      await expect(pending).rejects.toMatchObject({ code: "MODEL_UNRESOLVED" });
      expect(settingsStore.setModelAlias).not.toHaveBeenCalled();
    });
  });

  describe("getModelAliases", () => {
    test("returns configured aliases", async () => {
      settingsStore.load.mockReturnValueOnce({ modelAliases: { large: "anthropic/claude-sonnet-4-5", small: "openai/gpt-4o-mini" } });
      const result = await executor.execute({ name: "getModelAliases" });
      expect(result).toEqual([
        { alias: "large", modelRef: "anthropic/claude-sonnet-4-5" },
        { alias: "small", modelRef: "openai/gpt-4o-mini" },
      ]);
    });

    test("returns an empty array when no aliases are configured", async () => {
      settingsStore.load.mockReturnValueOnce({});
      const result = await executor.execute({ name: "getModelAliases" });
      expect(result).toEqual([]);
    });
  });

  describe("setDefaultEffort", () => {
    test("persists the effort via settingsStore.setDefaultEffort", async () => {
      const result = await executor.execute({ name: "setDefaultEffort", effort: "high" });
      expect(result).toBeNull();
      expect(settingsStore.setDefaultEffort).toHaveBeenCalledWith("high");
    });

    test("publishes user.effort.update so live agents apply the new effort", async () => {
      await executor.execute({ name: "setDefaultEffort", effort: "high" });
      expect(eventManager.publish).toHaveBeenCalledWith(expect.objectContaining({ type: "user.effort.update", payload: { effort: "high" } }));
    });

    test("does not publish for other commands", async () => {
      await executor.execute({ name: "getDefaultEffort" });
      expect(eventManager.publish).not.toHaveBeenCalled();
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
    test("flattens each provider's models and marks availability from config or credentials", async () => {
      modelRegistry.listProviders.mockReturnValueOnce([
        { id: "anthropic", configured: false, envKeys: ["ANTHROPIC_API_KEY"] },
        { id: "my-local", configured: true, envKeys: [] },
        { id: "openai", configured: false, envKeys: [] },
      ]);
      authStore.load.mockReturnValueOnce({ anthropic: { type: "api_key", key: "sk-test" } });
      modelRegistry.listModels.mockImplementation((provider) =>
        provider === "anthropic" ? [fakeModel("anthropic", "claude-sonnet-4-5", "Claude Sonnet 4.5")]
        : provider === "my-local" ? [fakeModel("openai", "qwen3.5-2b", "Qwen 3.5 2B")]
        : [fakeModel("openai", "gpt-5", "GPT-5")]);
      const result = await executor.execute({ name: "listModels" });
      expect(result).toEqual([
        { provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", available: true },
        { provider: "my-local", id: "qwen3.5-2b", name: "Qwen 3.5 2B", available: true },
        { provider: "openai", id: "gpt-5", name: "GPT-5", available: false },
      ]);
      expect(modelRegistry.listModels).toHaveBeenCalledWith("anthropic");
      expect(modelRegistry.listModels).toHaveBeenCalledWith("my-local");
    });

    test("returns an empty array when no provider lists models", async () => {
      modelRegistry.listProviders.mockReturnValueOnce([]);
      modelRegistry.listModels.mockReturnValue([]);
      const result = await executor.execute({ name: "listModels" });
      expect(result).toEqual([]);
    });
  });

  describe("model filters", () => {
    test("setModelFilters persists the patterns through the settings store", async () => {
      const result = await executor.execute({ name: "setModelFilters", filters: ["qwen", "gpt"] });
      expect(result).toBeNull();
      expect(settingsStore.setModelFilters).toHaveBeenCalledWith(["qwen", "gpt"]);
    });

    test("getModelFilters returns the stored patterns", async () => {
      settingsStore.load.mockReturnValueOnce({ ...DEFAULT_SETTINGS, modelFilters: ["qwen"] });
      const result = await executor.execute({ name: "getModelFilters" });
      expect(result).toEqual(["qwen"]);
    });

    test("getModelFilters returns an empty list when none are stored", async () => {
      const result = await executor.execute({ name: "getModelFilters" });
      expect(result).toEqual([]);
    });

    test("listFilteredModels returns all available models with no filters", async () => {
      modelRegistry.listProviders.mockReturnValueOnce([{ id: "anthropic", configured: false, envKeys: ["ANTHROPIC_API_KEY"] }]);
      authStore.load.mockReturnValueOnce({ anthropic: { type: "api_key", key: "sk-test" } });
      modelRegistry.listModels.mockReturnValueOnce([fakeModel("anthropic", "claude-sonnet-4-5", "Claude Sonnet 4.5")]);
      const result = await executor.execute({ name: "listFilteredModels" });
      expect(result).toEqual({
        models: [{ provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", available: true }],
        filteredOut: 0,
      });
    });

    test("listFilteredModels applies stored filters and reports the filtered-out count", async () => {
      settingsStore.load.mockReturnValueOnce({ ...DEFAULT_SETTINGS, modelFilters: ["gpt"] });
      modelRegistry.listProviders.mockReturnValueOnce([
        { id: "anthropic", configured: true, envKeys: [] },
        { id: "openai", configured: true, envKeys: [] },
      ]);
      authStore.load.mockReturnValueOnce({});
      modelRegistry.listModels.mockImplementation((provider) =>
        provider === "anthropic" ? [fakeModel("anthropic", "claude-sonnet-4-5", "Claude Sonnet 4.5")]
        : [fakeModel("openai", "gpt-5", "GPT-5")]);
      const result = await executor.execute({ name: "listFilteredModels" });
      expect(result).toEqual({
        models: [{ provider: "openai", id: "gpt-5", name: "GPT-5", available: true }],
        filteredOut: 1,
      });
    });

    test("validateModelFilter returns null when the combined filters match an available model", async () => {
      modelRegistry.listProviders.mockReturnValueOnce([{ id: "openai", configured: true, envKeys: [] }]);
      authStore.load.mockReturnValueOnce({});
      modelRegistry.listModels.mockReturnValueOnce([fakeModel("openai", "gpt-5", "GPT-5")]);
      const result = await executor.execute({ name: "validateModelFilter", pattern: "gpt", existingFilters: [] });
      expect(result).toBeNull();
    });

    test("validateModelFilter returns a rejection string when the pattern matches no available models", async () => {
      modelRegistry.listProviders.mockReturnValueOnce([{ id: "openai", configured: true, envKeys: [] }]);
      authStore.load.mockReturnValueOnce({});
      modelRegistry.listModels.mockReturnValueOnce([fakeModel("openai", "gpt-5", "GPT-5")]);
      const result = await executor.execute({ name: "validateModelFilter", pattern: "claude", existingFilters: [] });
      expect(result).toBe("/model-filter: pattern 'claude' rejected — it matches none of the 1 available models");
    });

    test("validateModelFilter mentions existing filters in the rejection", async () => {
      modelRegistry.listProviders.mockReturnValueOnce([{ id: "openai", configured: true, envKeys: [] }]);
      authStore.load.mockReturnValueOnce({});
      modelRegistry.listModels.mockReturnValueOnce([fakeModel("openai", "gpt-5", "GPT-5")]);
      const result = await executor.execute({ name: "validateModelFilter", pattern: "claude", existingFilters: ["qwen"] });
      expect(result).toBe("/model-filter: pattern 'claude' rejected — combined with existing filters (qwen) it matches none of the 1 available models");
    });

    test("validateModelFilter allows a duplicate pattern", async () => {
      modelRegistry.listProviders.mockReturnValueOnce([{ id: "openai", configured: true, envKeys: [] }]);
      authStore.load.mockReturnValueOnce({});
      modelRegistry.listModels.mockReturnValueOnce([fakeModel("openai", "gpt-5", "GPT-5")]);
      const result = await executor.execute({ name: "validateModelFilter", pattern: "gpt", existingFilters: ["gpt"] });
      expect(result).toBeNull();
    });

    test("validateModelFilter allows any pattern when there are no available models", async () => {
      modelRegistry.listProviders.mockReturnValueOnce([]);
      modelRegistry.listModels.mockReturnValue([]);
      const result = await executor.execute({ name: "validateModelFilter", pattern: "anything", existingFilters: [] });
      expect(result).toBeNull();
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
        sessionName: null,
        currentSessionId: null,
        kanbanCards: [],
        history: [],
        agents: [{ teamId: "alpha", role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null }],
      };
      teamManager.load.mockResolvedValue(identity);
      const result = await executor.execute({ name: "team", teamId: "alpha" });
      expect(result).toBe(identity);
      expect(teamManager.load).toHaveBeenCalledWith("alpha");
    });
  });

  describe("reload", () => {
    test("delegates to teamManager.reload and returns the reloaded teams", async () => {
      const identities: TeamInfo[] = [
        { id: "default-solo", leaderKey: "general-1", sessionName: null, currentSessionId: null, agents: [], history: [], kanbanCards: [] },
        { id: "alpha", leaderKey: "general-1", sessionName: null, currentSessionId: null, agents: [], history: [], kanbanCards: [] },
      ];
      teamManager.reload.mockResolvedValue(identities);
      const result = await executor.execute({ name: "reload" });
      expect(result).toBe(identities);
      expect(teamManager.reload).toHaveBeenCalledTimes(1);
    });
  });

  describe("resumeSession", () => {
    test("delegates to teamManager.resumeSession with teamId and sessionId", async () => {
      const identity: TeamInfo = { id: "alpha", leaderKey: "general-1", sessionName: null, currentSessionId: null, agents: [], history: [], kanbanCards: [] };
      teamManager.resumeSession.mockResolvedValue(identity);
      const result = await executor.execute({ name: "resumeSession", teamId: "alpha", sessionId: "s1" });
      expect(result).toBe(identity);
      expect(teamManager.resumeSession).toHaveBeenCalledWith("alpha", "s1");
    });
  });

  describe("getTeamInfo", () => {
    test("returns defaultTeam from settings and the installed list from teamManager", async () => {
      settingsStore.load.mockReturnValueOnce({ defaultProvider: "anthropic", defaultModel: "m", defaultTeam: "alpha" });
      teamManager.listInstalled.mockReturnValue(["default-solo", "alpha", "beta"]);
      teamManager.agentCount.mockImplementation((teamId: string) => (teamId === "alpha" ? 3 : 1));
      teamManager.locate.mockImplementation((teamId: string) => (teamId === "default-solo" ? "builtin" : "user"));
      const result = await executor.execute({ name: "getTeamInfo" });
      expect(result).toEqual({
        defaultTeam: "alpha",
        installed: [
          { id: "default-solo", agentCount: 1, location: "builtin" },
          { id: "alpha", agentCount: 3, location: "user" },
          { id: "beta", agentCount: 1, location: "user" },
        ],
      });
    });

    test("returns defaultTeam: null when settings has no defaultTeam", async () => {
      settingsStore.load.mockReturnValueOnce({ defaultProvider: "anthropic", defaultModel: "m" });
      teamManager.listInstalled.mockReturnValue(["default-solo"]);
      teamManager.agentCount.mockReturnValue(2);
      teamManager.locate.mockReturnValue("builtin");
      const result = await executor.execute({ name: "getTeamInfo" });
      expect(result).toEqual({ defaultTeam: null, installed: [{ id: "default-solo", agentCount: 2, location: "builtin" }] });
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

  describe("getNotificationSoundEnabled", () => {
    test("returns true by default when notification.soundEnabled is absent", async () => {
      settingsStore.load.mockReturnValueOnce({});
      const result = await executor.execute({ name: "getNotificationSoundEnabled" });
      expect(result).toBe(true);
    });

    test("returns the configured value", async () => {
      settingsStore.load.mockReturnValueOnce({ notification: { soundEnabled: false } });
      const result = await executor.execute({ name: "getNotificationSoundEnabled" });
      expect(result).toBe(false);
    });
  });

  describe("setNotificationSoundEnabled", () => {
    test("persists the value via settingsStore.setNotificationSoundEnabled", async () => {
      const result = await executor.execute({ name: "setNotificationSoundEnabled", enabled: false });
      expect(result).toBeNull();
      expect(settingsStore.setNotificationSoundEnabled).toHaveBeenCalledWith(false);
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

  describe("kanbanAdd", () => {
    test("short description becomes the card title without an LLM call", async () => {
      kanbanStore.add.mockReturnValue({ id: "#1", content: "write tests", status: "pending" });
      const result = await executor.execute({ name: "kanbanAdd", teamId: "alpha", description: "write tests" });
      expect(kanbanStore.add).toHaveBeenCalledWith("alpha", "session-1", "write tests", undefined, "team");
      expect(result).toEqual({ board: [], card: { id: "#1", content: "write tests", status: "pending" } });
      expect(llmService.complete).not.toHaveBeenCalled();
    });

    test("explicit title is used verbatim and the description is kept", async () => {
      kanbanStore.add.mockReturnValue({ id: "#1", content: "short title", status: "pending" });
      const result = await executor.execute({ name: "kanbanAdd", teamId: "alpha", title: "short title", description: "a very long description body" });
      expect(kanbanStore.add).toHaveBeenCalledWith("alpha", "session-1", "short title", "a very long description body", "team");
      expect(result.card).toMatchObject({ id: "#1", content: "short title" });
      expect(llmService.complete).not.toHaveBeenCalled();
    });

    test("long description is distilled to a title via the LLM", async () => {
      const long = "x".repeat(80);
      modelRegistry.resolve.mockReturnValue(fakeModel("anthropic", "claude-sonnet-4-5", "claude"));
      llmService.complete.mockResolvedValue("distilled title");
      kanbanStore.add.mockReturnValue({ id: "#1", content: "distilled title", status: "pending" });
      const result = await executor.execute({ name: "kanbanAdd", teamId: "alpha", description: long });
      expect(llmService.complete).toHaveBeenCalledWith(expect.objectContaining({ maxTokens: 20, prompt: long }));
      expect(kanbanStore.add).toHaveBeenCalledWith("alpha", "session-1", "distilled title", long, "team");
      expect(result.card.content).toBe("distilled title");
    });

    test("LLM failure falls back to the raw description as the title", async () => {
      const long = "y".repeat(80);
      modelRegistry.resolve.mockReturnValue(fakeModel("anthropic", "claude-sonnet-4-5", "claude"));
      llmService.complete.mockRejectedValue(new Error("llm down"));
      kanbanStore.add.mockReturnValue({ id: "#1", content: long, status: "pending" });
      const result = await executor.execute({ name: "kanbanAdd", teamId: "alpha", description: long });
      expect(kanbanStore.add).toHaveBeenCalledWith("alpha", "session-1", long, undefined, "team");
      expect(result.card.content).toBe(long);
    });

    test("no model configured skips distillation", async () => {
      settingsStore.load.mockReturnValue({});
      const long = "z".repeat(80);
      kanbanStore.add.mockReturnValue({ id: "#1", content: long, status: "pending" });
      await executor.execute({ name: "kanbanAdd", teamId: "alpha", description: long });
      expect(llmService.complete).not.toHaveBeenCalled();
    });

    test("empty description -> KANBAN_TEXT_EMPTY", async () => {
      const pending = executor.execute({ name: "kanbanAdd", teamId: "alpha", description: "" });
      await expect(pending).rejects.toMatchObject({ code: "KANBAN_TEXT_EMPTY" });
      expect(kanbanStore.add).not.toHaveBeenCalled();
    });

    test("content already on the board -> KANBAN_DUPLICATE_CONTENT", async () => {
      kanbanStore.add.mockReturnValue(null);
      const pending = executor.execute({ name: "kanbanAdd", teamId: "alpha", description: "write tests" });
      await expect(pending).rejects.toMatchObject({ code: "KANBAN_DUPLICATE_CONTENT" });
    });

    test("a multi-line bulleted LLM title is sanitized to a single line", async () => {
      const long = "x".repeat(80);
      modelRegistry.resolve.mockReturnValue(fakeModel("anthropic", "claude-sonnet-4-5", "claude"));
      llmService.complete.mockResolvedValue("- fix the bug\n  then verify");
      kanbanStore.add.mockReturnValue({ id: "#1", content: "fix the bug then verify", status: "pending" });
      await executor.execute({ name: "kanbanAdd", teamId: "alpha", description: long });
      expect(kanbanStore.add).toHaveBeenCalledWith("alpha", "session-1", "fix the bug then verify", long, "team");
    });

    test("throws NO_TEAM when the team has no loaded session", async () => {
      teamManager.currentSessionId.mockReturnValueOnce(null);
      const pending = executor.execute({ name: "kanbanAdd", teamId: "ghost", description: "task" });
      await expect(pending).rejects.toMatchObject({ code: "NO_TEAM" });
    });
  });

  describe("kanbanRemove", () => {
    test("removes the card and returns the remaining board", async () => {
      kanbanStore.remove.mockReturnValue(true);
      const board: KanbanCard[] = [{ id: "#2", content: "second", status: "pending" }];
      kanbanStore.load.mockReturnValueOnce(board);
      const result = await executor.execute({ name: "kanbanRemove", teamId: "alpha", cardId: "#1" });
      expect(kanbanStore.remove).toHaveBeenCalledWith("alpha", "session-1", "#1");
      expect(result).toEqual({ board });
    });

    test("unknown cardId -> KANBAN_CARD_NOT_FOUND", async () => {
      kanbanStore.remove.mockReturnValue(false);
      const pending = executor.execute({ name: "kanbanRemove", teamId: "alpha", cardId: "#9" });
      await expect(pending).rejects.toMatchObject({ code: "KANBAN_CARD_NOT_FOUND" });
    });
  });

  describe("kanbanSetStatus", () => {
    test("sets the card status and returns the updated board", async () => {
      kanbanStore.setStatus.mockReturnValue(true);
      const board: KanbanCard[] = [{ id: "#1", content: "first", status: "in_review" }];
      kanbanStore.load.mockReturnValueOnce(board);
      const result = await executor.execute({ name: "kanbanSetStatus", teamId: "alpha", cardId: "#1", status: "in_review" });
      expect(kanbanStore.setStatus).toHaveBeenCalledWith("alpha", "session-1", "#1", "in_review");
      expect(result).toEqual({ board });
    });

    test("sets completed as a valid status", async () => {
      kanbanStore.setStatus.mockReturnValue(true);
      const board: KanbanCard[] = [{ id: "#1", content: "first", status: "completed" }];
      kanbanStore.load.mockReturnValueOnce(board);
      const result = await executor.execute({ name: "kanbanSetStatus", teamId: "alpha", cardId: "#1", status: "completed" });
      expect(kanbanStore.setStatus).toHaveBeenCalledWith("alpha", "session-1", "#1", "completed");
      expect(result).toEqual({ board });
    });

    test("unknown cardId -> KANBAN_CARD_NOT_FOUND", async () => {
      kanbanStore.setStatus.mockReturnValue(false);
      const pending = executor.execute({ name: "kanbanSetStatus", teamId: "alpha", cardId: "#9", status: "completed" });
      await expect(pending).rejects.toMatchObject({ code: "KANBAN_CARD_NOT_FOUND" });
    });
  });

  describe("kanbanEdit", () => {
    test("edits the card content and returns the updated board", async () => {
      kanbanStore.editContent.mockReturnValue({ id: "#1", content: "revised", status: "pending" });
      const board: KanbanCard[] = [{ id: "#1", content: "revised", status: "pending" }];
      kanbanStore.load.mockReturnValueOnce(board);
      const result = await executor.execute({ name: "kanbanEdit", teamId: "alpha", cardId: "#1", field: "content", text: "revised" });
      expect(kanbanStore.editContent).toHaveBeenCalledWith("alpha", "session-1", "#1", "revised");
      expect(result).toEqual({ board });
    });

    test("edits the card description", async () => {
      kanbanStore.editDescription.mockReturnValue({ id: "#1", content: "first", status: "pending", description: "cover Q3" });
      const board: KanbanCard[] = [{ id: "#1", content: "first", status: "pending", description: "cover Q3" }];
      kanbanStore.load.mockReturnValueOnce(board);
      const result = await executor.execute({ name: "kanbanEdit", teamId: "alpha", cardId: "#1", field: "description", text: "cover Q3" });
      expect(kanbanStore.editDescription).toHaveBeenCalledWith("alpha", "session-1", "#1", "cover Q3");
      expect(result).toEqual({ board });
    });

    test("empty text on the content field -> KANBAN_TEXT_EMPTY", async () => {
      const pending = executor.execute({ name: "kanbanEdit", teamId: "alpha", cardId: "#1", field: "content", text: "  " });
      await expect(pending).rejects.toMatchObject({ code: "KANBAN_TEXT_EMPTY" });
      expect(kanbanStore.editContent).not.toHaveBeenCalled();
    });

    test("empty text on the description field clears the description", async () => {
      kanbanStore.editDescription.mockReturnValue({ id: "#1", content: "first", status: "pending" });
      kanbanStore.load.mockReturnValueOnce([{ id: "#1", content: "first", status: "pending" }]);
      await executor.execute({ name: "kanbanEdit", teamId: "alpha", cardId: "#1", field: "description", text: "  " });
      expect(kanbanStore.editDescription).toHaveBeenCalledWith("alpha", "session-1", "#1", undefined);
    });

    test("unknown cardId -> KANBAN_CARD_NOT_FOUND", async () => {
      kanbanStore.editContent.mockReturnValue(null);
      const pending = executor.execute({ name: "kanbanEdit", teamId: "alpha", cardId: "#9", field: "content", text: "x" });
      await expect(pending).rejects.toMatchObject({ code: "KANBAN_CARD_NOT_FOUND" });
    });

    test("content duplicating another card -> KANBAN_DUPLICATE_CONTENT", async () => {
      kanbanStore.editContent.mockReturnValue(null);
      kanbanStore.load.mockReturnValueOnce([{ id: "#1", content: "first", status: "pending" }, { id: "#2", content: "second", status: "pending" }]);
      const pending = executor.execute({ name: "kanbanEdit", teamId: "alpha", cardId: "#1", field: "content", text: "second" });
      await expect(pending).rejects.toMatchObject({ code: "KANBAN_DUPLICATE_CONTENT" });
    });
  });

  describe("kanbanHandoff", () => {
    test("moves a card to the target team and returns the source board", async () => {
      teamManager.locate.mockReturnValueOnce("project");
      const card: KanbanCard = { id: "#7", content: "hand me off", status: "pending" };
      kanbanStore.handoff.mockReturnValue(card);
      const board: KanbanCard[] = [];
      kanbanStore.load.mockReturnValueOnce(board);
      const result = await executor.execute({ name: "kanbanHandoff", teamId: "alpha", cardId: "#1", targetTeamId: "beta" });
      expect(kanbanStore.handoff).toHaveBeenCalledWith("alpha", "session-1", "#1", "beta");
      expect(teamManager.locate).toHaveBeenCalledWith("beta");
      expect(result).toEqual({ board, card });
    });

    test("supports cross-team identity <teamId>/<cardId>", async () => {
      teamManager.locate.mockReturnValueOnce("project");
      const card: KanbanCard = { id: "#7", content: "hand me off", status: "pending" };
      kanbanStore.handoff.mockReturnValue(card);
      kanbanStore.load.mockReturnValueOnce([]);
      const result = await executor.execute({ name: "kanbanHandoff", teamId: "alpha", cardId: "gamma/#3", targetTeamId: "beta" });
      expect(kanbanStore.handoff).toHaveBeenCalledWith("gamma", "", "#3", "beta");
      expect(result).toEqual({ board: [], card });
    });

    test("unknown target team -> TEAM_NOT_FOUND", async () => {
      teamManager.locate.mockReturnValueOnce(null);
      const pending = executor.execute({ name: "kanbanHandoff", teamId: "alpha", cardId: "#1", targetTeamId: "ghost" });
      await expect(pending).rejects.toMatchObject({ code: "TEAM_NOT_FOUND" });
    });

    test("unknown cardId -> KANBAN_CARD_NOT_FOUND", async () => {
      teamManager.locate.mockReturnValueOnce("project");
      kanbanStore.handoff.mockReturnValue(null);
      const pending = executor.execute({ name: "kanbanHandoff", teamId: "alpha", cardId: "#9", targetTeamId: "beta" });
      await expect(pending).rejects.toMatchObject({ code: "KANBAN_CARD_NOT_FOUND" });
    });
  });

  describe("kanbanToggleTodo", () => {
    test("toggles the matching todo and returns the updated board", async () => {
      const initial: KanbanCard = {
        id: "#1",
        content: "task",
        status: "in_progress",
        todos: [
          { text: "one", done: false },
          { text: "two", done: false },
        ],
      };
      const updated: KanbanCard = {
        id: "#1",
        content: "task",
        status: "in_progress",
        todos: [
          { text: "one", done: true },
          { text: "two", done: false },
        ],
      };
      kanbanStore.load
        .mockReturnValueOnce([initial])
        .mockReturnValueOnce([updated]);
      kanbanStore.update.mockReturnValue(updated);
      const result = await executor.execute({ name: "kanbanToggleTodo", teamId: "alpha", cardId: "#1", todo: "one" });
      expect(kanbanStore.update).toHaveBeenCalledWith("alpha", "session-1", "task", {
        todos: [
          { text: "one", done: true },
          { text: "two", done: false },
        ],
      });
      expect(result).toEqual({ board: [updated] });
    });

    test("unknown cardId -> KANBAN_CARD_NOT_FOUND", async () => {
      kanbanStore.load.mockReturnValue([]);
      await expect(
        executor.execute({ name: "kanbanToggleTodo", teamId: "alpha", cardId: "#9", todo: "one" }),
      ).rejects.toMatchObject({ code: "KANBAN_CARD_NOT_FOUND" });
    });

    test("unknown todo text -> KANBAN_TODO_NOT_FOUND", async () => {
      kanbanStore.load.mockReturnValue([
        { id: "#1", content: "task", status: "in_progress", todos: [{ text: "one", done: false }] },
      ]);
      await expect(
        executor.execute({ name: "kanbanToggleTodo", teamId: "alpha", cardId: "#1", todo: "two" }),
      ).rejects.toMatchObject({ code: "KANBAN_TODO_NOT_FOUND" });
    });

    test("card with no todos -> KANBAN_TODO_NOT_FOUND", async () => {
      kanbanStore.load.mockReturnValue([{ id: "#1", content: "task", status: "in_progress" }]);
      await expect(
        executor.execute({ name: "kanbanToggleTodo", teamId: "alpha", cardId: "#1", todo: "one" }),
      ).rejects.toMatchObject({ code: "KANBAN_TODO_NOT_FOUND" });
    });
  });

  describe("compact", () => {
    test("calls teamManager.compact with the team and agent key and returns null", async () => {
      teamManager.compact.mockResolvedValue(undefined);
      const result = await executor.execute({ name: "compact", teamId: "alpha", agentKey: "general-1" });
      expect(teamManager.compact).toHaveBeenCalledWith("alpha", "general-1");
      expect(result).toBeNull();
    });
  });

  describe("dispatch", () => {
    test("executor.execute is the single entry point for every command name", async () => {
      teamManager.locate.mockReturnValue("user");
      teamManager.load.mockResolvedValue({ id: "alpha", leaderKey: "general-1", sessionName: null, currentSessionId: "s1", agents: [], history: [], kanbanCards: [] });
      teamManager.resumeSession.mockResolvedValue({ id: "alpha", leaderKey: "general-1", sessionName: null, currentSessionId: "s1", agents: [], history: [], kanbanCards: [] });
      teamManager.listInstalled.mockReturnValue([]);
      teamManager.listSessions.mockReturnValue([]);
      modelRegistry.listModels.mockReturnValue([]);
      modelRegistry.listProviders.mockReturnValue([]);
      kanbanStore.add.mockReturnValue({ id: "#1", content: "task", status: "pending" });
      kanbanStore.remove.mockReturnValue(true);
      kanbanStore.setStatus.mockReturnValue(true);
      kanbanStore.editContent.mockReturnValue({ id: "#1", content: "task", status: "pending" });
      kanbanStore.handoff.mockReturnValue({ id: "#7", content: "handed off", status: "pending" });
      kanbanStore.update.mockReturnValue({ id: "#1", content: "task", status: "pending", todos: [{ text: "one", done: true }] });
      kanbanStore.load.mockReturnValue([{ id: "#1", content: "task", status: "pending", todos: [{ text: "one", done: false }] }]);
      const commands: Array<Parameters<typeof executor.execute>[0]> = [
        { name: "login", provider: "anthropic", apiKey: "sk-test" },
        { name: "logout", provider: "*" },
        { name: "setApiKey", apiKey: "sk-test" },
        { name: "setDefaultModel", provider: "anthropic", id: "claude-sonnet-4-5" },
        { name: "getDefaultModel" },
        { name: "setDefaultEffort", effort: "high" },
        { name: "getDefaultEffort" },
        { name: "listModels" },
        { name: "listProviders" },
        { name: "setModelFilters", filters: ["qwen"] },
        { name: "getModelFilters" },
        { name: "setDefaultTeam", teamId: "alpha" },
        { name: "team", teamId: "alpha" },
        { name: "reload" },
        { name: "resumeSession", teamId: "alpha", sessionId: "s1" },
        { name: "renameSession", teamId: "alpha", sessionName: "my session" },
        { name: "getTeamInfo" },
        { name: "getGitStatus" },
        { name: "stop" },
        { name: "compact", teamId: "alpha", agentKey: "general-1" },
        { name: "listSessions", teamId: "alpha" },
        { name: "kanbanAdd", teamId: "alpha", description: "task" },
        { name: "kanbanRemove", teamId: "alpha", cardId: "#1" },
        { name: "kanbanSetStatus", teamId: "alpha", cardId: "#1", status: "completed" },
        { name: "kanbanEdit", teamId: "alpha", cardId: "#1", field: "content", text: "task" },
        { name: "kanbanHandoff", teamId: "alpha", cardId: "#1", targetTeamId: "beta" },
        { name: "kanbanToggleTodo", teamId: "alpha", cardId: "#1", todo: "one" },
      ];
      for (const command of commands) {
        await executor.execute(command);
      }
      expect(teamManager.stop).toHaveBeenCalled();
      expect(authStore.setProvider).toHaveBeenCalled();
    });
  });
});
