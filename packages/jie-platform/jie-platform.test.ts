import { join } from "node:path";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createEventManager, Events, type EventEnvelope, type EventManager } from "./event";
import { createJiePlatform } from "./jie-platform";
import { type Command, type CommandExecutor, type CommandName } from "./command";
import {
  type AuthStore,
  type ModelRegistry,
  type Settings,
  type SettingsStore,
  createModelRegistry,
} from "./config";
import { type TeamManager, createTeamManager } from "./team";
import { type ToolRegistry, createToolRegistry } from "./tools";
import {
  type ArtifactStore,
  type MemoryManager,
  type Storage,
  createArtifactStore,
  createMemoryManager,
  createStorage,
} from "./storage";

const commandExecutor = vi.mocked<CommandExecutor>({
  execute: vi.fn(),
});

const settingsStore = vi.mocked<SettingsStore>({
  load: vi.fn(),
  setDefaultProvider: vi.fn(),
  setDefaultTeam: vi.fn(),
});

const authStore = vi.mocked<AuthStore>({
  load: vi.fn(),
  saveAuthConfig: vi.fn(),
  setProvider: vi.fn(),
  removeProvider: vi.fn(),
  clear: vi.fn(),
});

const DEFAULT_SETTINGS: Settings = {
  defaultProvider: "anthropic",
  defaultModel: "claude-sonnet-4-5",
};

interface PlatformTestDeps {
  readonly eventManager: EventManager;
  readonly settingsStore: SettingsStore;
  readonly storage: Storage;
  readonly teamManager: TeamManager;
  readonly modelRegistry: ModelRegistry;
  readonly toolRegistry: ToolRegistry;
  readonly artifactStore: ArtifactStore;
  readonly memoryManager: MemoryManager;
  readonly commandExecutor: CommandExecutor;
}

function makeDeps(workspace: string, homeJieDir: string): PlatformTestDeps {
  const projectJieDir = join(workspace, ".jie");
  const storage = createStorage({ type: "sqlite", filePath: ":memory:" });
  const eventManager = createEventManager();
  const artifactStore = createArtifactStore(storage);
  const toolRegistry = createToolRegistry({
    workspaceRoot: workspace,
    eventManager,
    artifactStore,
  });
  const modelRegistry = createModelRegistry(homeJieDir, projectJieDir, authStore);
  const memoryManager = createMemoryManager(storage);
  const teamManager = createTeamManager(
    { homeJieDir, projectJieDir },
    { eventManager, settingsStore, modelRegistry, toolRegistry, artifactStore, memoryManager },
  );
  return {
    eventManager,
    settingsStore,
    storage,
    teamManager,
    modelRegistry,
    toolRegistry,
    artifactStore,
    memoryManager,
    commandExecutor,
  };
}

describe("createJiePlatform", () => {
  let workspace: string;
  let homeJieDir: string;
  let projectJieDir: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-platform-"));
    homeJieDir = mkdtempSync(join(tmpdir(), "jie-platform-home-"));
    projectJieDir = join(workspace, ".jie");
    mkdirSync(projectJieDir, { recursive: true });
    settingsStore.load.mockReturnValue(DEFAULT_SETTINGS);
  });

  afterEach(() => {
    rmSync(projectJieDir, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
    rmSync(homeJieDir, { recursive: true, force: true });
  });

  test("handle.settings reflects the snapshot from settingsStore.load() at construction", async () => {
    const customSettings: Settings = { defaultProvider: "openai", defaultModel: "gpt-5" };
    settingsStore.load.mockReturnValueOnce(customSettings);
    const deps = makeDeps(workspace, homeJieDir);
    const handle = await createJiePlatform({ cwd: workspace, homeJieDir, projectJieDir }, deps);
    expect(handle.settings).toBe(customSettings);
  });

  test("construction does not eagerly publish system.team.loaded; teams() is empty until execute({name:'team'})", async () => {
    const deps = makeDeps(workspace, homeJieDir);
    const seen: EventEnvelope<"system.team.loaded">[] = [];
    deps.eventManager.subscribe("system.team.loaded", (env) => seen.push(env));
    const handle = await createJiePlatform({ cwd: workspace, homeJieDir, projectJieDir }, deps);
    expect(seen).toEqual([]);
    expect(handle.teams()).toEqual([]);
    void handle;
  });

  describe("execute", () => {
    test("delegates every command to commandExecutor.execute with the same command", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform({ cwd: workspace, homeJieDir, projectJieDir }, deps);
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
        await handle.execute(command);
      }
      expect(commandExecutor.execute).toHaveBeenCalledTimes(commands.length);
      for (const command of commands) {
        expect(commandExecutor.execute).toHaveBeenCalledWith(command);
      }
    });

    test("propagates the executor's return value to the caller", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform({ cwd: workspace, homeJieDir, projectJieDir }, deps);
      commandExecutor.execute.mockResolvedValueOnce({ provider: "anthropic", id: "claude-sonnet-4-5", effort: "off", contextWindow: null });
      const result = await handle.execute({ name: "getDefaultModel" });
      expect(result).toEqual({ provider: "anthropic", id: "claude-sonnet-4-5", effort: "off", contextWindow: null });
    });

    test("propagates the executor's rejection to the caller", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform({ cwd: workspace, homeJieDir, projectJieDir }, deps);
      commandExecutor.execute.mockRejectedValueOnce(new Error("boom"));
      expect(handle.execute({ name: "stop" })).rejects.toThrow("boom");
    });
  });

  describe("subscribe", () => {
    test("forwards events on the requested topic only", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform({ cwd: workspace, homeJieDir, projectJieDir }, deps);
      const seen: string[] = [];
      handle.subscribe("agent.interrupt", (env) => seen.push(env.type));
      deps.eventManager.publish(Events.agentInterrupt({ kind: "user" }, "t1", "general-1"));
      deps.eventManager.publish(Events.systemError({ kind: "system" }, "boom"));
      expect(seen).toEqual(["agent.interrupt"]);
    });

    test("returns an unsubscribe function that detaches the subscription", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform({ cwd: workspace, homeJieDir, projectJieDir }, deps);
      const seen: string[] = [];
      const unsubscribe = handle.subscribe("agent.interrupt", (env) => seen.push(env.type));
      unsubscribe();
      deps.eventManager.publish(Events.agentInterrupt({ kind: "user" }, "t1", "general-1"));
      expect(seen).toEqual([]);
    });
  });

  describe("prompt", () => {
    test("publishes a user.prompt event addressed to the given agent on the active team", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform({ cwd: workspace, homeJieDir, projectJieDir }, deps);
      const events: EventEnvelope<"user.prompt">[] = [];
      deps.eventManager.subscribe("user.prompt", (env) => events.push(env));
      handle.prompt("minimal", "general-1", "hello");
      expect(events).toHaveLength(1);
      expect(events[0]!.payload).toEqual({ teamId: "minimal", agentKey: "general-1", prompt: "hello" });
      expect(events[0]!.sender).toEqual({ kind: "user" });
    });
  });

  describe("interrupt", () => {
    test("publishes an agent.interrupt event addressed to the given agent", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform({ cwd: workspace, homeJieDir, projectJieDir }, deps);
      const events: EventEnvelope<"agent.interrupt">[] = [];
      deps.eventManager.subscribe("agent.interrupt", (env) => events.push(env));
      handle.interrupt("minimal", "general-1");
      expect(events).toHaveLength(1);
      expect(events[0]!.sender).toEqual({ kind: "user" });
      expect(events[0]!.payload).toEqual({ teamId: "minimal", agentKey: "general-1" });
    });
  });
});
