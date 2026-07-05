import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { join } from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createEventManager, Events, type EventEnvelope } from "./event";
import { createJiePlatform } from "./jie-platform";
import { createCommandExecutor } from "./command";
import {
  createModelRegistry,
  type AuthStore,
  type Settings,
  type SettingsStore,
} from "./config";
import { createTeamManager } from "./team";
import { createToolRegistry } from "./tools";
import { createArtifactStore, createMemoryManager, createStorage } from "./storage";
import { type GitService, type GitSnapshot } from "./services";

const settingsStore = vi.mocked<SettingsStore>({
  load: vi.fn(),
  write: vi.fn(),
  unsetDefaultTeam: vi.fn(),
});

const authStore = vi.mocked<AuthStore>({
  load: vi.fn(),
  saveAuthConfig: vi.fn(),
  setProvider: vi.fn(),
  removeProvider: vi.fn(),
  clear: vi.fn(),
});

const gitService = vi.mocked<GitService>({
  getSnapshot: vi.fn(),
});

const DEFAULT_SETTINGS: Settings = {
  defaultProvider: "anthropic",
  defaultModel: "claude-sonnet-4-5",
};

const EMPTY_GIT_SNAPSHOT: GitSnapshot = { branch: "", dirty: false, ahead: 0, behind: 0 };

function makeDeps(workspace: string, homeJieDir: string, filePath: string = ":memory:") {
  const projectJieDir = join(workspace, ".jie");
  const storage = createStorage({ type: "sqlite", filePath });
  const events = createEventManager();
  const artifactStore = createArtifactStore(storage);
  const toolRegistry = createToolRegistry({
    workspaceRoot: workspace,
    eventManager: events,
    artifactStore,
  });
  gitService.getSnapshot.mockReturnValue(EMPTY_GIT_SNAPSHOT);
  const modelRegistry = createModelRegistry(homeJieDir, projectJieDir, authStore);
  const memoryManager = createMemoryManager(storage);
  const teamManager = createTeamManager(
    { homeJieDir, projectJieDir },
    { eventManager: events, settingsStore, modelRegistry, toolRegistry, artifactStore, memoryManager },
  );
  const commandExecutor = createCommandExecutor({
    authStore,
    settingsStore,
    teamManager,
    gitService,
    defaultScope: "global",
  });
  return {
    eventManager: events,
    settingsStore,
    storage,
    teamManager,
    modelRegistry,
    toolRegistry,
    artifactStore,
    memoryManager: createMemoryManager(storage),
    commandExecutor,
    defaultScope: "global" as const,
  };
}

const STUB_MESSAGE: AgentMessage = {
  role: "user",
  content: "hello from h1",
  timestamp: Date.now(),
};

describe("createJiePlatform", () => {
  let workspace: string;
  let homeJieDir: string;
  let projectJieDir: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-start-"));
    homeJieDir = mkdtempSync(join(tmpdir(), "jie-start-home-"));
    projectJieDir = join(workspace, ".jie");
    mkdirSync(projectJieDir, { recursive: true });
    settingsStore.load.mockReturnValue(DEFAULT_SETTINGS);
  });

  afterEach(() => {
    rmSync(projectJieDir, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
    rmSync(homeJieDir, { recursive: true, force: true });
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(homeJieDir, { recursive: true, force: true });
  });

  describe("happy path (minimal team)", () => {
    test("loadTeam loads the minimal team; subscribe receives user.prompt events", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform(
        {
          cwd: workspace,
          homeJieDir,
          projectJieDir,
        },
        deps,
      );
      await handle.execute({ name: "team", teamId: "minimal" });
      const events: EventEnvelope<"user.prompt">[] = [];
      handle.subscribe("user.prompt", (env) => events.push(env));
      expect(events).toHaveLength(0);
      await handle.stop();
    });

    test("team.loaded is published when loadTeam runs; the event carries is_leader per agent", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const events: EventEnvelope<"system.team.loaded">[] = [];
      deps.eventManager.subscribe("system.team.loaded", (env) => {
        events.push(env);
      });
      const handle = await createJiePlatform(
        {
          cwd: workspace,
          homeJieDir,
          projectJieDir,
        },
        deps,
      );
      await handle.execute({ name: "team", teamId: "minimal" });
      expect(events).toHaveLength(1);
      const env = events[0]!;
      expect(env.payload.agents).toHaveLength(1);
      expect(env.payload.agents[0]!.is_leader).toBe(true);
      await handle.stop();
    });

    test("missing model: loadTeam throws and the body is not constructed", async () => {
      settingsStore.load.mockReturnValue({});
      const deps = makeDeps(workspace, homeJieDir);
      const errors: EventEnvelope<"system.error">[] = [];
      deps.eventManager.subscribe("system.error", (env) => errors.push(env));
      const handle = await createJiePlatform({ cwd: workspace, homeJieDir, projectJieDir }, deps);
      expect(handle.execute({ name: "team", teamId: "minimal" })).rejects.toThrow();
      expect(errors).toHaveLength(0);
    });

    test("handle.stop() detaches all bus subscriptions", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform(
        {
          cwd: workspace,
          homeJieDir,
          projectJieDir,
        },
        deps,
      );
      await handle.execute({ name: "team", teamId: "minimal" });
      expect(deps.eventManager.subscriberCount("user.prompt")).toBeGreaterThan(0);
      await handle.stop();
      expect(deps.eventManager.subscriberCount("user.prompt")).toBe(0);
    });
  });

  describe("session id resolution", () => {
    function makeExecutor(teamManager: ReturnType<typeof createTeamManager>) {
      return createCommandExecutor({ authStore, settingsStore, teamManager, gitService, defaultScope: "global" });
    }

    test("resumeSessionId: valid id is used; invalid id rejects with 'unknown session_id:'", async () => {
      const filePath = join(workspace, "resume.db");
      const storage1 = createStorage({ type: "sqlite", filePath });
      const events1 = createEventManager();
      const artifactStore1 = createArtifactStore(storage1);
      const memoryManager1 = createMemoryManager(storage1);
      const base1 = makeDeps(workspace, homeJieDir, ":memory:");
      const teamManager1 = createTeamManager(
        { homeJieDir, projectJieDir: join(workspace, ".jie") },
        { eventManager: events1, settingsStore, modelRegistry: base1.modelRegistry, toolRegistry: createToolRegistry({ workspaceRoot: workspace, eventManager: events1, artifactStore: artifactStore1 }), artifactStore: artifactStore1, memoryManager: memoryManager1 },
      );
      const deps1 = {
        ...base1,
        storage: storage1,
        memoryManager: memoryManager1,
        eventManager: events1,
        artifactStore: artifactStore1,
        toolRegistry: createToolRegistry({ workspaceRoot: workspace, eventManager: events1, artifactStore: artifactStore1 }),
        teamManager: teamManager1,
        commandExecutor: makeExecutor(teamManager1),
      };
      const h1 = await createJiePlatform(
        { cwd: workspace, homeJieDir, projectJieDir },
        deps1,
      );
      memoryManager1.persist(STUB_MESSAGE, "general-1", "test-session-id", "minimal");
      await h1.stop();
      const sessionId = "test-session-id";

      const storage2 = createStorage({ type: "sqlite", filePath });
      const events2 = createEventManager();
      const artifactStore2 = createArtifactStore(storage2);
      const memoryManager2 = createMemoryManager(storage2);
      const base2 = makeDeps(workspace, homeJieDir, ":memory:");
      const teamManager2 = createTeamManager(
        { homeJieDir, projectJieDir: join(workspace, ".jie"), resumeSessionId: sessionId },
        { eventManager: events2, settingsStore, modelRegistry: base2.modelRegistry, toolRegistry: createToolRegistry({ workspaceRoot: workspace, eventManager: events2, artifactStore: artifactStore2 }), artifactStore: artifactStore2, memoryManager: memoryManager2 },
      );
      const deps2 = {
        ...base2,
        storage: storage2,
        memoryManager: memoryManager2,
        eventManager: events2,
        artifactStore: artifactStore2,
        toolRegistry: createToolRegistry({ workspaceRoot: workspace, eventManager: events2, artifactStore: artifactStore2 }),
        teamManager: teamManager2,
        commandExecutor: makeExecutor(teamManager2),
      };
      const h2 = await createJiePlatform(
        { cwd: workspace, homeJieDir, projectJieDir, resumeSessionId: sessionId },
        deps2,
      );
      await h2.stop();

      const storage3 = createStorage({ type: "sqlite", filePath });
      const events3 = createEventManager();
      const artifactStore3 = createArtifactStore(storage3);
      const memoryManager3 = createMemoryManager(storage3);
      const base3 = makeDeps(workspace, homeJieDir, ":memory:");
      const teamManager3 = createTeamManager(
        { homeJieDir, projectJieDir: join(workspace, ".jie"), resumeSessionId: "not-a-real-id" },
        { eventManager: events3, settingsStore, modelRegistry: base3.modelRegistry, toolRegistry: createToolRegistry({ workspaceRoot: workspace, eventManager: events3, artifactStore: artifactStore3 }), artifactStore: artifactStore3, memoryManager: memoryManager3 },
      );
      const deps3 = {
        ...base3,
        storage: storage3,
        memoryManager: memoryManager3,
        eventManager: events3,
        artifactStore: artifactStore3,
        toolRegistry: createToolRegistry({ workspaceRoot: workspace, eventManager: events3, artifactStore: artifactStore3 }),
        teamManager: teamManager3,
        commandExecutor: makeExecutor(teamManager3),
      };
      const h3 = await createJiePlatform(
        { cwd: workspace, homeJieDir, projectJieDir, resumeSessionId: "not-a-real-id" },
        deps3,
      );
      expect(h3.execute({ name: "team", teamId: "minimal" })).rejects.toThrow(/unknown session_id: not-a-real-id/);

    });
  });

  describe("empty team (no .md files)", () => {
    test("team.loaded is published with the minimal team fallback", async () => {
      const userTeam = join(homeJieDir, "teams", "ghost");
      mkdirSync(userTeam, { recursive: true });
      writeFileSync(join(userTeam, "TEAM.md"), "---\n---\n");

      const deps = makeDeps(workspace, homeJieDir);
      const events: EventEnvelope<"system.team.loaded">[] = [];
      deps.eventManager.subscribe("system.team.loaded", (env) => {
        events.push(env);
      });
      const handle = await createJiePlatform(
        { cwd: workspace, homeJieDir, projectJieDir },
        deps,
      );
      await handle.execute({ name: "team", teamId: "ghost" });
      const ghostEvent = events.find((e) => e.payload.teamId === "ghost");
      expect(ghostEvent).toBeDefined();
      expect(ghostEvent!.payload.agents.map((a) => a.role)).toEqual(["general"]);
      expect(ghostEvent!.payload.agents.some((a) => a.is_leader)).toBe(true);
      await handle.stop();
    });
  });

  describe("team switch via execute", () => {
    function installTeam(dir: string, teamId: string, role: string, leaderRole: string = role): void {
      const teamDir = join(dir, "teams", teamId);
      mkdirSync(teamDir, { recursive: true });
      writeFileSync(
        join(teamDir, "TEAM.md"),
        `---\nleader: ${leaderRole}\n---\n`,
      );
      writeFileSync(
        join(teamDir, `${role}.md`),
        "---\ntools:\n  - bash\nmodel: anthropic/claude-sonnet-4-5\n---\n",
      );
    }

    test("execute({ name: 'team', teamId }) installs and switches active team", async () => {
      installTeam(homeJieDir, "alpha", "general");
      installTeam(homeJieDir, "beta", "researcher");
      const deps = makeDeps(workspace, homeJieDir);
      const events: EventEnvelope<"system.team.loaded">[] = [];
      deps.eventManager.subscribe("system.team.loaded", (env) => {
        events.push(env);
      });
      const handle = await createJiePlatform({ cwd: workspace, homeJieDir, projectJieDir }, deps);
      expect(await handle.execute({ name: "team", teamId: "alpha" })).toBeDefined();
      expect(events.map((e) => e.payload.teamId)).toContain("alpha");
      await handle.stop();
    });

    test("execute({ name: 'setDefaultTeam', teamId }) persists the new default team", async () => {
      installTeam(homeJieDir, "alpha", "general");
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform({ cwd: workspace, homeJieDir, projectJieDir }, deps);
      await handle.execute({ name: "setDefaultTeam", teamId: "alpha" });
      expect(settingsStore.write).toHaveBeenCalledWith(
        expect.objectContaining({ defaultTeam: "alpha" }),
        expect.any(String),
      );
      await handle.stop();
    });
  });
});

describe("JiePlatform — execute(commands)", () => {
  let workspace: string;
  let homeJieDir: string;
  let projectJieDir: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-facade-"));
    homeJieDir = mkdtempSync(join(tmpdir(), "jie-facade-home-"));
    projectJieDir = join(workspace, ".jie");
    mkdirSync(projectJieDir, { recursive: true });
    settingsStore.load.mockReturnValue(DEFAULT_SETTINGS);
    authStore.load.mockReturnValue({});
    gitService.getSnapshot.mockReturnValue(EMPTY_GIT_SNAPSHOT);
  });

  afterEach(() => {
    rmSync(projectJieDir, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
    rmSync(homeJieDir, { recursive: true, force: true });
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
      await handle.stop();
    });

    test("returns an unsubscribe function that detaches the subscription", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform({ cwd: workspace, homeJieDir, projectJieDir }, deps);
      const seen: string[] = [];
      const unsubscribe = handle.subscribe("agent.interrupt", (env) => seen.push(env.type));
      unsubscribe();
      deps.eventManager.publish(Events.agentInterrupt({ kind: "user" }, "t1", "general-1"));
      expect(seen).toEqual([]);
      await handle.stop();
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
      await handle.stop();
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
      await handle.stop();
    });
  });

  describe("execute(login)", () => {
    test("writes the provider key via authStore", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform({ cwd: workspace, homeJieDir, projectJieDir }, deps);
      authStore.load.mockReturnValue({});
      authStore.setProvider.mockReturnValue({ anthropic: { type: "api_key", key: "sk-test" } });
      await handle.execute({ name: "login", provider: "anthropic", apiKey: "sk-test" });
      expect(authStore.setProvider).toHaveBeenCalledWith({}, "anthropic", "sk-test");
      expect(authStore.saveAuthConfig).toHaveBeenCalledWith({ anthropic: { type: "api_key", key: "sk-test" } });
      await handle.stop();
    });
  });

  describe("execute(logout)", () => {
    test("with no provider, clears all providers", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform({ cwd: workspace, homeJieDir, projectJieDir }, deps);
      authStore.clear.mockReturnValue({});
      await handle.execute({ name: "logout" });
      expect(authStore.clear).toHaveBeenCalled();
      expect(authStore.saveAuthConfig).toHaveBeenCalledWith({});
      expect(authStore.removeProvider).not.toHaveBeenCalled();
      await handle.stop();
    });

    test("with a provider, removes only that provider", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform({ cwd: workspace, homeJieDir, projectJieDir }, deps);
      authStore.load.mockReturnValue({ anthropic: { type: "api_key", key: "sk-test" } });
      authStore.removeProvider.mockReturnValue({});
      await handle.execute({ name: "logout", provider: "anthropic" });
      expect(authStore.removeProvider).toHaveBeenCalledWith(expect.anything(), "anthropic");
      expect(authStore.saveAuthConfig).toHaveBeenCalledWith({});
      expect(authStore.clear).not.toHaveBeenCalled();
      await handle.stop();
    });
  });

  describe("execute(setDefaultModel)", () => {
    test("writes the new model with the default scope for known providers", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform({ cwd: workspace, homeJieDir, projectJieDir }, deps);
      settingsStore.load.mockReturnValue({});
      await handle.execute({ name: "setDefaultModel", provider: "anthropic", modelId: "claude-sonnet-4-5" });
      expect(settingsStore.write).toHaveBeenCalledWith(
        { defaultProvider: "anthropic", defaultModel: "claude-sonnet-4-5" },
        "global",
      );
      await handle.stop();
    });

    test("throws UNKNOWN_PROVIDER for an unknown provider", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform({ cwd: workspace, homeJieDir, projectJieDir }, deps);
      const writeCallsBefore = settingsStore.write.mock.calls.length;
      expect(handle.execute({ name: "setDefaultModel", provider: "no-such-provider", modelId: "x" })).rejects.toThrow(/Unknown provider/);
      expect(settingsStore.write.mock.calls.length).toBe(writeCallsBefore);
      await handle.stop();
    });
  });

  describe("execute(unsetDefaultTeam)", () => {
    test("delegates to settingsStore.unsetDefaultTeam", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform({ cwd: workspace, homeJieDir, projectJieDir }, deps);
      await handle.execute({ name: "unsetDefaultTeam" });
      expect(settingsStore.unsetDefaultTeam).toHaveBeenCalledTimes(1);
      await handle.stop();
    });
  });

  describe("execute(getDefaultModel)", () => {
    test("returns the configured default model", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform({ cwd: workspace, homeJieDir, projectJieDir }, deps);
      settingsStore.load.mockReturnValueOnce({ defaultProvider: "anthropic", defaultModel: "claude-sonnet-4-5" });
      const result = await handle.execute({ name: "getDefaultModel" });
      expect(result).toEqual({ provider: "anthropic", modelId: "claude-sonnet-4-5" });
      await handle.stop();
    });

    test("returns null when no defaults are configured", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform({ cwd: workspace, homeJieDir, projectJieDir }, deps);
      settingsStore.load.mockReturnValueOnce({});
      const result = await handle.execute({ name: "getDefaultModel" });
      expect(result).toBeNull();
      await handle.stop();
    });
  });

  describe("execute(getTeamInfo)", () => {
    test("returns defaultTeam + installed list", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform({ cwd: workspace, homeJieDir, projectJieDir }, deps);
      const tm = deps.teamManager;
      const spy = vi.spyOn(tm, "listInstalled").mockReturnValue(["minimal", "alpha", "beta"]);
      const result = await handle.execute({ name: "getTeamInfo" });
      expect(result.installed).toEqual(["minimal", "alpha", "beta"]);
      spy.mockRestore();
      await handle.stop();
    });
  });

  describe("execute(getGitStatus)", () => {
    test("returns the cached git snapshot from gitService", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform({ cwd: workspace, homeJieDir, projectJieDir }, deps);
      gitService.getSnapshot.mockReturnValueOnce({ branch: "main", dirty: true, ahead: 2, behind: 0 });
      const result = await handle.execute({ name: "getGitStatus" });
      expect(result).toEqual({ branch: "main", dirty: true, ahead: 2, behind: 0 });
      await handle.stop();
    });
  });
});
