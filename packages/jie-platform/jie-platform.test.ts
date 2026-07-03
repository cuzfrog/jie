import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { join } from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createEventManager, type EventEnvelope } from "./event";
import { createJiePlatform } from "./jie-platform";
import {
  createModelRegistry,
  type AuthStore,
  type Settings,
  type SettingsStore,
} from "./config";
import { createTeamRegistry } from "./team";
import { createToolRegistry } from "./tools";
import { createArtifactStore, createMemoryManager, createStorage } from "./storage";
import { type GitService } from "./services";

const NO_MODEL_ERROR = "No model has been selected";

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

const EMPTY_GIT_SNAPSHOT = { branch: "", dirty: false, ahead: 0, behind: 0 };

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
  return {
    eventManager: events,
    settingsStore,
    storage,
    teamRegistry: createTeamRegistry({ homeJieDir, projectJieDir }),
    modelRegistry: createModelRegistry(homeJieDir, projectJieDir, authStore),
    toolRegistry,
    artifactStore,
    memoryManager: createMemoryManager(storage),
    authStore,
    gitService,
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

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-start-"));
    homeJieDir = mkdtempSync(join(tmpdir(), "jie-start-home-"));
    settingsStore.load.mockReturnValue(DEFAULT_SETTINGS);
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(homeJieDir, { recursive: true, force: true });
  });

  describe("happy path (minimal team)", () => {
    test("starts the minimal team; subscribe receives user.prompt events", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform(
        {
          workspace,
          homeJieDir,
          teamId: "minimal",
        },
        deps,
      );
      const events: EventEnvelope<"user.prompt">[] = [];
      handle.subscribe("user.prompt", (env) => events.push(env));
      expect(events).toHaveLength(0);
    });

    test("team.loaded is published once at start; the event carries is_leader per agent", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const events: EventEnvelope<"system.team.loaded">[] = [];
      deps.eventManager.subscribe("system.team.loaded", (env) => {
        events.push(env);
      });
      await createJiePlatform(
        {
          workspace,
          homeJieDir,
          teamId: "minimal",
        },
        deps,
      );
      expect(events).toHaveLength(1);
      const env = events[0]!;
      expect(env.payload.agents).toHaveLength(1);
      expect(env.payload.agents[0]!.is_leader).toBe(true);
    });

    test("model pre-check: no model in soul or settings throws NO_MODEL_ERROR", async () => {
      settingsStore.load.mockReturnValueOnce({});
      const filePath = join(workspace, "no-model.db");
      const storage = createStorage({ type: "sqlite", filePath });
      const projectJieDir = join(workspace, ".jie");
      const events = createEventManager();
      const artifactStore = createArtifactStore(storage);
      const deps = {
        eventManager: events,
        settingsStore,
        storage,
        teamRegistry: createTeamRegistry({ homeJieDir, projectJieDir }),
        modelRegistry: createModelRegistry(homeJieDir, projectJieDir, authStore),
        toolRegistry: createToolRegistry({ workspaceRoot: workspace, eventManager: events, artifactStore }),
        artifactStore,
        memoryManager: createMemoryManager(storage),
        authStore,
        gitService,
        defaultScope: "global" as const,
      };
      await expect(
        createJiePlatform({ workspace, homeJieDir, teamId: "minimal" }, deps),
      ).rejects.toThrow(NO_MODEL_ERROR);
    });

    test("handle.stop() detaches all bus subscriptions", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform(
        {
          workspace,
          homeJieDir,
          teamId: "minimal",
        },
        deps,
      );
      expect(deps.eventManager.subscriberCount("user.prompt")).toBeGreaterThan(0);
      await handle.stop();
      expect(deps.eventManager.subscriberCount("user.prompt")).toBe(0);
    });
  });

  describe("session id resolution", () => {
    test("resumeSessionId: valid id is used; invalid id rejects with 'unknown session_id:'", async () => {
      const filePath = join(workspace, "resume.db");
      const projectJieDir = join(workspace, ".jie");
      const storage1 = createStorage({ type: "sqlite", filePath });
      const events1 = createEventManager();
      const artifactStore1 = createArtifactStore(storage1);
      const deps1 = {
        eventManager: events1,
        settingsStore,
        storage: storage1,
        teamRegistry: createTeamRegistry({ homeJieDir, projectJieDir }),
        modelRegistry: createModelRegistry(homeJieDir, projectJieDir, authStore),
        toolRegistry: createToolRegistry({ workspaceRoot: workspace, eventManager: events1, artifactStore: artifactStore1 }),
        artifactStore: artifactStore1,
        memoryManager: createMemoryManager(storage1),
        authStore,
        gitService,
        defaultScope: "global" as const,
      };
      const h1 = await createJiePlatform(
        { workspace, homeJieDir, teamId: "minimal" },
        deps1,
      );
      createMemoryManager(createStorage({ type: "sqlite", filePath })).persist(
        STUB_MESSAGE,
        "general-1",
        "test-session-id",
        "minimal",
      );
      await h1.stop();
      const sessionId = "test-session-id";

      const storage2 = createStorage({ type: "sqlite", filePath });
      const events2 = createEventManager();
      const artifactStore2 = createArtifactStore(storage2);
      const deps2 = {
        eventManager: events2,
        settingsStore,
        storage: storage2,
        teamRegistry: createTeamRegistry({ homeJieDir, projectJieDir }),
        modelRegistry: createModelRegistry(homeJieDir, projectJieDir, authStore),
        toolRegistry: createToolRegistry({ workspaceRoot: workspace, eventManager: events2, artifactStore: artifactStore2 }),
        artifactStore: artifactStore2,
        memoryManager: createMemoryManager(storage2),
        authStore,
        gitService,
        defaultScope: "global" as const,
      };
      const h2 = await createJiePlatform(
        { workspace, homeJieDir, teamId: "minimal", resumeSessionId: sessionId },
        deps2,
      );
      await h2.stop();

      const storage3 = createStorage({ type: "sqlite", filePath });
      const events3 = createEventManager();
      const artifactStore3 = createArtifactStore(storage3);
      const deps3 = {
        eventManager: events3,
        settingsStore,
        storage: storage3,
        teamRegistry: createTeamRegistry({ homeJieDir, projectJieDir }),
        modelRegistry: createModelRegistry(homeJieDir, projectJieDir, authStore),
        toolRegistry: createToolRegistry({ workspaceRoot: workspace, eventManager: events3, artifactStore: artifactStore3 }),
        artifactStore: artifactStore3,
        memoryManager: createMemoryManager(storage3),
        authStore,
        gitService,
        defaultScope: "global" as const,
      };
      await expect(
        createJiePlatform(
          { workspace, homeJieDir, teamId: "minimal", resumeSessionId: "not-a-real-id" },
          deps3,
        ),
      ).rejects.toThrow(/unknown session_id: not-a-real-id/);
    });
  });

  describe("empty team (no .md files)", () => {
    test("team.loaded is published with empty agents array", async () => {
      const userTeam = join(homeJieDir, "teams", "ghost");
      mkdirSync(userTeam, { recursive: true });
      writeFileSync(join(userTeam, "TEAM.md"), "---\n---\n");

      const deps = makeDeps(workspace, homeJieDir);
      const events: EventEnvelope<"system.team.loaded">[] = [];
      deps.eventManager.subscribe("system.team.loaded", (env) => {
        events.push(env);
      });
      const handle = await createJiePlatform(
        { workspace, homeJieDir, teamId: "ghost" },
        deps,
      );
      expect(events).toHaveLength(1);
      expect(events[0]!.payload.agents).toEqual([]);
      await handle.stop();
    });
  });

  describe("loadTeam (v0.2 multi-team)", () => {
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

    test("loadTeam installs a second team and switches active team", async () => {
      installTeam(homeJieDir, "alpha", "general");
      installTeam(homeJieDir, "beta", "researcher");
      const deps = makeDeps(workspace, homeJieDir);
      const events: EventEnvelope<"system.team.loaded">[] = [];
      deps.eventManager.subscribe("system.team.loaded", (env) => {
        events.push(env);
      });
      const handle = await createJiePlatform({ workspace, homeJieDir, teamId: "alpha" }, deps);
      expect(handle.team.id).toBe("alpha");
      expect(events.map((e) => e.payload.teamId)).toEqual(["alpha"]);

      await handle.loadTeam("beta");
      expect(handle.team.id).toBe("beta");
      expect(events.map((e) => e.payload.teamId)).toEqual(["alpha", "beta"]);
      expect(handle.team.agents.length).toBeGreaterThan(0);

      await handle.stop();
    });

    test("loadTeam is idempotent: calling twice does not re-publish the team.loaded event", async () => {
      installTeam(homeJieDir, "alpha", "general");
      const deps = makeDeps(workspace, homeJieDir);
      const events: EventEnvelope<"system.team.loaded">[] = [];
      deps.eventManager.subscribe("system.team.loaded", (env) => {
        events.push(env);
      });
      const handle = await createJiePlatform({ workspace, homeJieDir, teamId: "alpha" }, deps);
      await handle.loadTeam("alpha");
      await handle.loadTeam("alpha");
      expect(events.filter((e) => e.payload.teamId === "alpha")).toHaveLength(1);
      await handle.stop();
    });
  });
});

describe("JiePlatform — facade methods", () => {
  let workspace: string;
  let homeJieDir: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-facade-"));
    homeJieDir = mkdtempSync(join(tmpdir(), "jie-facade-home-"));
    settingsStore.load.mockReturnValue(DEFAULT_SETTINGS);
    authStore.load.mockReturnValue({});
    gitService.getSnapshot.mockReturnValue(EMPTY_GIT_SNAPSHOT);
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(homeJieDir, { recursive: true, force: true });
  });

  describe("subscribe", () => {
    test("forwards events on the requested topic only", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform({ workspace, homeJieDir, teamId: "minimal" }, deps);
      const seen: string[] = [];
      handle.subscribe("system.interrupted", (env) => seen.push(env.type));
      deps.eventManager.publish({ type: "system.interrupted", topic: "system.interrupted", version: 1, sender: { kind: "system" }, timestamp: new Date().toISOString(), payload: null });
      deps.eventManager.publish({ type: "system.error", topic: "system.error", version: 1, sender: { kind: "system" }, timestamp: new Date().toISOString(), payload: { error: "boom" } });
      expect(seen).toEqual(["system.interrupted"]);
      await handle.stop();
    });

    test("returns an unsubscribe function that detaches the subscription", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform({ workspace, homeJieDir, teamId: "minimal" }, deps);
      const seen: string[] = [];
      const unsubscribe = handle.subscribe("system.interrupted", (env) => seen.push(env.type));
      unsubscribe();
      deps.eventManager.publish({ type: "system.interrupted", topic: "system.interrupted", version: 1, sender: { kind: "system" }, timestamp: new Date().toISOString(), payload: null });
      expect(seen).toEqual([]);
      await handle.stop();
    });
  });

  describe("userPrompt", () => {
    test("publishes a user.prompt event addressed to the given agent on the active team", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform({ workspace, homeJieDir, teamId: "minimal" }, deps);
      const events: EventEnvelope<"user.prompt">[] = [];
      deps.eventManager.subscribe("user.prompt", (env) => events.push(env));
      handle.userPrompt("general-1", "hello");
      expect(events).toHaveLength(1);
      expect(events[0]!.payload).toEqual({ teamId: "minimal", agentKey: "general-1", prompt: "hello" });
      expect(events[0]!.sender).toEqual({ kind: "user" });
      await handle.stop();
    });
  });

  describe("interrupt", () => {
    test("publishes a system.interrupted event", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform({ workspace, homeJieDir, teamId: "minimal" }, deps);
      const events: EventEnvelope<"system.interrupted">[] = [];
      deps.eventManager.subscribe("system.interrupted", (env) => events.push(env));
      handle.interrupt();
      expect(events).toHaveLength(1);
      expect(events[0]!.sender).toEqual({ kind: "system" });
      await handle.stop();
    });
  });

  describe("login", () => {
    test("writes the provider key via authStore", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform({ workspace, homeJieDir, teamId: "minimal" }, deps);
      authStore.load.mockReturnValue({});
      authStore.setProvider.mockReturnValue({ anthropic: { type: "api_key", key: "sk-test" } });
      handle.login("anthropic", "sk-test");
      expect(authStore.setProvider).toHaveBeenCalledWith({}, "anthropic", "sk-test");
      expect(authStore.saveAuthConfig).toHaveBeenCalledWith({ anthropic: { type: "api_key", key: "sk-test" } });
      await handle.stop();
    });
  });

  describe("logout", () => {
    test("with no provider, clears all providers", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform({ workspace, homeJieDir, teamId: "minimal" }, deps);
      authStore.clear.mockReturnValue({});
      handle.logout();
      expect(authStore.clear).toHaveBeenCalled();
      expect(authStore.saveAuthConfig).toHaveBeenCalledWith({});
      expect(authStore.removeProvider).not.toHaveBeenCalled();
      await handle.stop();
    });

    test("with a provider, removes only that provider", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform({ workspace, homeJieDir, teamId: "minimal" }, deps);
      authStore.load.mockReturnValue({ anthropic: { type: "api_key", key: "sk-test" } });
      authStore.removeProvider.mockReturnValue({});
      handle.logout("anthropic");
      expect(authStore.removeProvider).toHaveBeenCalledWith(expect.anything(), "anthropic");
      expect(authStore.saveAuthConfig).toHaveBeenCalledWith({});
      expect(authStore.clear).not.toHaveBeenCalled();
      await handle.stop();
    });
  });

  describe("setDefaultModel", () => {
    test("writes the new model with the default scope for known providers", async () => {
      const deps = makeDeps(workspace, homeJieDir, ":memory:");
      const handle = await createJiePlatform({ workspace, homeJieDir, teamId: "minimal" }, deps);
      settingsStore.load.mockReturnValue({});
      handle.setDefaultModel("anthropic", "claude-sonnet-4-5");
      expect(settingsStore.write).toHaveBeenCalledWith(
        { defaultProvider: "anthropic", defaultModel: "claude-sonnet-4-5" },
        "global",
      );
      await handle.stop();
    });

    test("throws UNKNOWN_PROVIDER for an unknown provider", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform({ workspace, homeJieDir, teamId: "minimal" }, deps);
      expect(() => handle.setDefaultModel("no-such-provider", "x")).toThrow(/Unknown provider/);
      expect(settingsStore.write).not.toHaveBeenCalled();
      await handle.stop();
    });

    test("uses project scope when defaultScope is project", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const projectDeps = { ...deps, defaultScope: "project" as const };
      const handle = await createJiePlatform({ workspace, homeJieDir, teamId: "minimal" }, projectDeps);
      settingsStore.load.mockReturnValue({});
      handle.setDefaultModel("anthropic", "claude-sonnet-4-5");
      expect(settingsStore.write).toHaveBeenCalledWith(expect.anything(), "project");
      await handle.stop();
    });
  });

  describe("unsetDefaultTeam", () => {
    test("delegates to settingsStore.unsetDefaultTeam", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform({ workspace, homeJieDir, teamId: "minimal" }, deps);
      handle.unsetDefaultTeam();
      expect(settingsStore.unsetDefaultTeam).toHaveBeenCalledTimes(1);
      await handle.stop();
    });
  });

  describe("getDefaultTeam / getDefaultModel", () => {
    test("returns the configured default team and model", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform({ workspace, homeJieDir, teamId: "minimal" }, deps);
      settingsStore.load.mockReturnValue({ defaultTeam: "alpha", defaultProvider: "anthropic", defaultModel: "claude-sonnet-4-5" });
      expect(handle.getDefaultTeam()).toBe("alpha");
      expect(handle.getDefaultModel()).toEqual({ provider: "anthropic", modelId: "claude-sonnet-4-5" });
      await handle.stop();
    });

    test("returns null when no defaults are configured", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform({ workspace, homeJieDir, teamId: "minimal" }, deps);
      settingsStore.load.mockReturnValue({});
      expect(handle.getDefaultTeam()).toBeNull();
      expect(handle.getDefaultModel()).toBeNull();
      await handle.stop();
    });
  });

  describe("listInstalledTeams", () => {
    test("delegates to teamRegistry.listInstalled", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const spy = vi.spyOn(deps.teamRegistry, "listInstalled").mockReturnValue(["minimal", "alpha", "beta"]);
      const handle = await createJiePlatform({ workspace, homeJieDir, teamId: "minimal" }, deps);
      expect(handle.listInstalledTeams()).toEqual(["minimal", "alpha", "beta"]);
      spy.mockRestore();
      await handle.stop();
    });
  });

  describe("getGitStatus", () => {
    test("returns the cached git snapshot from gitService", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform({ workspace, homeJieDir, teamId: "minimal" }, deps);
      gitService.getSnapshot.mockReturnValue({ branch: "main", dirty: true, ahead: 2, behind: 0 });
      expect(handle.getGitStatus()).toEqual({ branch: "main", dirty: true, ahead: 2, behind: 0 });
      await handle.stop();
    });
  });
});
