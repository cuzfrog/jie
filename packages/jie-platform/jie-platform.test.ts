import type { Command, CommandExecutor, CommandName } from "./command";
import type { Settings, SettingsStore } from "./config";
import type { EventManager } from "./event";
import { JiePlatformImpl } from "./jie-platform";
import type { TeamManager } from "./team";
import type { ModelInfo, TeamInfo } from "./types";

const settingsStore = vi.mocked<SettingsStore>({
  load: vi.fn(),
  setDefaultProvider: vi.fn(),
  setDefaultTeam: vi.fn(),
});

const eventManager = vi.mocked<EventManager>({
  publish: vi.fn(),
  subscribe: vi.fn(),
});

const commandExecutor = vi.mocked<CommandExecutor>({
  execute: vi.fn(),
});

const teamManager = vi.mocked<TeamManager>({
  load: vi.fn(),
  resumeSession: vi.fn(),
  listInstalled: vi.fn(),
  listLoaded: vi.fn(),
  locate: vi.fn(),
  agents: vi.fn(),
  listSessions: vi.fn(),
  stop: vi.fn(),
});

const DEFAULT_SETTINGS: Settings = {
  defaultProvider: "anthropic",
  defaultModel: "claude-sonnet-4-5",
};

function createPlatform(): JiePlatformImpl {
  return new JiePlatformImpl(settingsStore, eventManager, commandExecutor, teamManager);
}

describe("JiePlatformImpl", () => {
  beforeEach(() => {
    settingsStore.load.mockReturnValue(DEFAULT_SETTINGS);
  });

  test("exposes the settings loaded from the settings store at construction", () => {
    const platform = createPlatform();
    expect(settingsStore.load).toHaveBeenCalledTimes(1);
    expect(platform.settings).toEqual(DEFAULT_SETTINGS);
  });

  describe("execute", () => {
    test("delegates every command to the command executor", async () => {
      const platform = createPlatform();
      const commands: ReadonlyArray<Command<CommandName>> = [
        { name: "login", provider: "anthropic", apiKey: "sk-test" },
        { name: "logout" },
        { name: "setApiKey", apiKey: "sk-test" },
        { name: "setDefaultModel", provider: "anthropic", id: "claude-sonnet-4-5" },
        { name: "getDefaultModel" },
        { name: "setDefaultTeam", teamId: "alpha" },
        { name: "team", teamId: "alpha" },
        { name: "resumeSession", teamId: "alpha", sessionId: "01-seeded" },
        { name: "getTeamInfo" },
        { name: "getGitStatus" },
        { name: "stop" },
        { name: "listSessions", teamId: "alpha" },
      ];
      for (const command of commands) {
        await platform.execute(command);
      }
      expect(commandExecutor.execute).toHaveBeenCalledTimes(commands.length);
      for (const command of commands) {
        expect(commandExecutor.execute).toHaveBeenCalledWith(command);
      }
    });

    test("propagates the executor's return value to the caller", async () => {
      const platform = createPlatform();
      const model: ModelInfo = { provider: "anthropic", id: "claude-sonnet-4-5", effort: "off", contextWindow: null };
      commandExecutor.execute.mockResolvedValueOnce(model);
      const result = await platform.execute({ name: "getDefaultModel" });
      expect(result).toEqual(model);
    });

    test("propagates the executor's rejection to the caller", async () => {
      const platform = createPlatform();
      commandExecutor.execute.mockRejectedValueOnce(new Error("boom"));
      await expect(platform.execute({ name: "stop" })).rejects.toThrow("boom");
    });
  });

  describe("subscribe", () => {
    test("delegates to the event manager and returns its unsubscribe function", () => {
      const platform = createPlatform();
      const unsubscribe = vi.fn();
      const callback = vi.fn();
      eventManager.subscribe.mockReturnValue(unsubscribe);
      const result = platform.subscribe("agent.interrupt", callback);
      expect(eventManager.subscribe).toHaveBeenCalledWith("agent.interrupt", callback);
      expect(result).toBe(unsubscribe);
    });
  });

  describe("prompt", () => {
    test("publishes a user.prompt event addressed to the given agent", () => {
      const platform = createPlatform();
      platform.prompt("minimal", "general-1", "hello");
      expect(eventManager.publish).toHaveBeenCalledTimes(1);
      const envelope = eventManager.publish.mock.calls[0]![0]!;
      expect(envelope.type).toBe("user.prompt");
      expect(envelope.topic).toBe("user.prompt");
      expect(envelope.sender).toEqual({ kind: "user" });
      expect(envelope.payload).toEqual({ teamId: "minimal", agentKey: "general-1", prompt: "hello" });
    });
  });

  describe("interrupt", () => {
    test("publishes an agent.interrupt event addressed to the given agent", () => {
      const platform = createPlatform();
      platform.interrupt("minimal", "general-1");
      expect(eventManager.publish).toHaveBeenCalledTimes(1);
      const envelope = eventManager.publish.mock.calls[0]![0]!;
      expect(envelope.type).toBe("agent.interrupt");
      expect(envelope.topic).toBe("agent.interrupt");
      expect(envelope.sender).toEqual({ kind: "user" });
      expect(envelope.payload).toEqual({ teamId: "minimal", agentKey: "general-1" });
    });
  });

  describe("teams", () => {
    test("returns the teams loaded in the team manager", () => {
      const platform = createPlatform();
      const alpha: TeamInfo = { id: "alpha", leaderKey: "alpha-1", agents: [], history: [] };
      const beta: TeamInfo = { id: "beta", leaderKey: "beta-1", agents: [], history: [] };
      teamManager.listLoaded.mockReturnValue(new Map([["alpha", alpha], ["beta", beta]]));
      expect(platform.teams()).toEqual([alpha, beta]);
      expect(teamManager.listLoaded).toHaveBeenCalledTimes(1);
    });
  });
});
