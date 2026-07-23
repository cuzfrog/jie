import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { asValue, type AwilixContainer } from "awilix";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Command, CommandExecutor, CommandName } from "./command";
import type { Settings } from "./config";
import { bootPlatform, type PlatformCradle } from "./container";
import { Events, type EventEnvelope } from "./event";

const commandExecutor = vi.mocked<CommandExecutor>({
  execute: vi.fn(),
});

const DEFAULT_SETTINGS: Settings = {
  defaultProvider: "anthropic",
  defaultModel: "claude-sonnet-4-5",
};

function bootContainer(workspace: string, homeJieDir: string, overrides: { commandExecutor?: CommandExecutor } = {}): AwilixContainer<PlatformCradle> {
  writeFileSync(join(homeJieDir, "settings.json"), JSON.stringify(DEFAULT_SETTINGS));
  const container = bootPlatform({ cwd: workspace, homeJieDir, projectJieDir: null, inMemory: true });
  if (overrides.commandExecutor !== undefined) {
    container.register({ commandExecutor: asValue(overrides.commandExecutor) });
  }
  return container;
}

function assistantMessage(text: string, timestamp: number): AgentMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "openai", provider: "openai", model: "m",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "stop", timestamp,
  };
}

describe("bootPlatform", () => {
  let workspace: string;
  let homeJieDir: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-platform-"));
    homeJieDir = mkdtempSync(join(tmpdir(), "jie-platform-home-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(homeJieDir, { recursive: true, force: true });
  });

  test("resolves platform as a singleton", () => {
    const container = bootContainer(workspace, homeJieDir);
    expect(container.resolve("platform")).toBe(container.cradle.platform);
  });

  test("handle.settings reflects the settings file at boot", () => {
    const platform = bootContainer(workspace, homeJieDir).cradle.platform;
    expect(platform.settings).toEqual(DEFAULT_SETTINGS);
  });

  test("construction does not eagerly load teams; teams() is empty", () => {
    const container = bootContainer(workspace, homeJieDir);
    const seen: EventEnvelope<"system.team.loaded">[] = [];
    container.cradle.eventManager.subscribe("system.team.loaded", (env) => seen.push(env));
    expect(container.cradle.platform.teams()).toEqual([]);
    expect(seen).toEqual([]);
  });

  describe("execute", () => {
    test("delegates every command to the cradle commandExecutor", async () => {
      const platform = bootContainer(workspace, homeJieDir, { commandExecutor }).cradle.platform;
      const commands: ReadonlyArray<Command<CommandName>> = [
        { name: "login", provider: "anthropic", apiKey: "sk-test" },
        { name: "logout" },
        { name: "setApiKey", apiKey: "sk-test" },
        { name: "setDefaultModel", provider: "anthropic", id: "claude-sonnet-4-5", effort: "off", contextWindow: null },
        { name: "getDefaultModel" },
        { name: "setDefaultTeam", teamId: "alpha" },
        { name: "team", teamId: "alpha" },
        { name: "getTeamInfo" },
        { name: "getGitStatus" },
        { name: "stop" },
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
      const platform = bootContainer(workspace, homeJieDir, { commandExecutor }).cradle.platform;
      commandExecutor.execute.mockResolvedValueOnce({ provider: "anthropic", id: "claude-sonnet-4-5", effort: "off", contextWindow: null });
      const result = await platform.execute({ name: "getDefaultModel" });
      expect(result).toEqual({ provider: "anthropic", id: "claude-sonnet-4-5", effort: "off", contextWindow: null });
    });

    test("propagates the executor's rejection to the caller", async () => {
      const platform = bootContainer(workspace, homeJieDir, { commandExecutor }).cradle.platform;
      commandExecutor.execute.mockRejectedValueOnce(new Error("boom"));
      expect(platform.execute({ name: "stop" })).rejects.toThrow("boom");
    });
  });

  describe("subscribe", () => {
    test("forwards events on the requested topic only", () => {
      const container = bootContainer(workspace, homeJieDir);
      const seen: string[] = [];
      container.cradle.platform.subscribe("agent.interrupt", (env) => seen.push(env.type));
      container.cradle.eventManager.publish(Events.agentInterrupt({ kind: "user" }, "t1", "general-1"));
      container.cradle.eventManager.publish(Events.systemError({ kind: "system" }, "boom"));
      expect(seen).toEqual(["agent.interrupt"]);
    });

    test("returns an unsubscribe function that detaches the subscription", () => {
      const container = bootContainer(workspace, homeJieDir);
      const seen: string[] = [];
      const unsubscribe = container.cradle.platform.subscribe("agent.interrupt", (env) => seen.push(env.type));
      unsubscribe();
      container.cradle.eventManager.publish(Events.agentInterrupt({ kind: "user" }, "t1", "general-1"));
      expect(seen).toEqual([]);
    });
  });

  describe("prompt", () => {
    test("publishes a user.prompt event addressed to the given agent", () => {
      const container = bootContainer(workspace, homeJieDir);
      const events: EventEnvelope<"user.prompt">[] = [];
      container.cradle.eventManager.subscribe("user.prompt", (env) => events.push(env));
      container.cradle.platform.prompt("minimal", "general-1", "hello");
      expect(events).toHaveLength(1);
      expect(events[0]!.payload).toEqual({ teamId: "minimal", agentKey: "general-1", prompt: "hello" });
      expect(events[0]!.sender).toEqual({ kind: "user" });
    });
  });

  describe("interrupt", () => {
    test("publishes an agent.interrupt event addressed to the given agent", () => {
      const container = bootContainer(workspace, homeJieDir);
      const events: EventEnvelope<"agent.interrupt">[] = [];
      container.cradle.eventManager.subscribe("agent.interrupt", (env) => events.push(env));
      container.cradle.platform.interrupt("minimal", "general-1");
      expect(events).toHaveLength(1);
      expect(events[0]!.sender).toEqual({ kind: "user" });
      expect(events[0]!.payload).toEqual({ teamId: "minimal", agentKey: "general-1" });
    });
  });

  describe("team integration through the real container", () => {
    test("execute team loads the builtin minimal team; agent.model.assigned precedes system.team.loaded", async () => {
      const container = bootContainer(workspace, homeJieDir);
      const platform = container.cradle.platform;
      const order: string[] = [];
      let loaded: EventEnvelope<"system.team.loaded"> | undefined;
      container.cradle.eventManager.subscribe("agent.model.assigned", () => order.push("model.assigned"));
      container.cradle.eventManager.subscribe("system.team.loaded", (env) => {
        order.push("team.loaded");
        loaded = env;
      });
      const team = await platform.execute({ name: "team" });
      expect(team.id).toBe("minimal");
      expect(order).toEqual(["model.assigned", "team.loaded"]);
      for (const agent of loaded!.payload.agents) {
        expect(agent.model).not.toBeNull();
      }
      expect(platform.teams().map((t) => t.id)).toEqual(["minimal"]);
      container.cradle.teamManager.stop();
    });

    test("resumeSession carries restored history on the event; the returned identity carries empty history", async () => {
      const container = bootContainer(workspace, homeJieDir);
      const platform = container.cradle.platform;
      container.cradle.memoryManager.persist({ role: "user", content: "[user]: hello", timestamp: 1 }, "general-1", "01-seeded", "minimal");
      container.cradle.memoryManager.persist(assistantMessage("hi there", 2), "general-1", "01-seeded", "minimal");
      const loaded: EventEnvelope<"system.team.loaded">[] = [];
      container.cradle.eventManager.subscribe("system.team.loaded", (env) => loaded.push(env));
      const team = await platform.execute({ name: "resumeSession", teamId: "minimal", sessionId: "01-seeded" });
      expect(team.history[0]?.messages).toEqual([]);
      expect(loaded[0]?.payload.history[0]?.messages).toHaveLength(2);
      container.cradle.teamManager.stop();
    });
  });
});
