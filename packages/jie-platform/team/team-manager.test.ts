import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTeamManager } from "./team-manager";
import { createEventManager, type EventEnvelope } from "../event";
import {
  createModelRegistry,
  type AuthStore,
  type Settings,
  type SettingsStore,
} from "../config";
import { createArtifactStore, createMemoryManager, createStorage } from "../storage";
import { createToolRegistry } from "../tools";

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

const DEFAULT_SETTINGS: Settings = {
  defaultProvider: "anthropic",
  defaultModel: "claude-sonnet-4-5",
};

function makeManager(workspace: string, homeJieDir: string, projectJieDir: string | null) {
  const storage = createStorage({ type: "sqlite", filePath: ":memory:" });
  const eventManager = createEventManager();
  const artifactStore = createArtifactStore(storage);
  const toolRegistry = createToolRegistry({
    workspaceRoot: workspace,
    eventManager,
    artifactStore,
  });
  return {
    eventManager,
    settingsStore,
    storage,
    toolRegistry,
    artifactStore,
    memoryManager: createMemoryManager(storage),
    manager: createTeamManager(
      { homeJieDir, projectJieDir },
      {
        eventManager,
        settingsStore,
        modelRegistry: createModelRegistry(homeJieDir, projectJieDir, authStore),
        toolRegistry,
        artifactStore,
        memoryManager: createMemoryManager(storage),
      },
    ),
  };
}

function writeTeam(rootDir: string, id: string, leader: string, extras: ReadonlyArray<string> = []): void {
  const teamDir = join(rootDir, id);
  mkdirSync(teamDir, { recursive: true });
  writeFileSync(join(teamDir, "TEAM.md"), `---\nleader: ${leader}\n---\n`);
  writeFileSync(join(teamDir, `${leader}.md`), `---\ntools:\n  - bash\n---\nbody`);
  for (const role of extras) {
    writeFileSync(join(teamDir, `${role}.md`), `---\ntools:\n  - bash\n---\n${role}`);
  }
}

function collectEvents(bus: ReturnType<typeof createEventManager>): {
  teamLoaded: EventEnvelope<"system.team.loaded">[];
  systemError: EventEnvelope<"system.error">[];
} {
  const teamLoaded: EventEnvelope<"system.team.loaded">[] = [];
  const systemError: EventEnvelope<"system.error">[] = [];
  bus.subscribe("system.team.loaded", (env) => teamLoaded.push(env));
  bus.subscribe("system.error", (env) => systemError.push(env));
  return { teamLoaded, systemError };
}

describe("createTeamManager — full surface", () => {
  let workspace: string;
  let homeJieDir: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-team-mgr-"));
    homeJieDir = mkdtempSync(join(tmpdir(), "jie-team-mgr-home-"));
    settingsStore.load.mockReturnValue(DEFAULT_SETTINGS);
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(homeJieDir, { recursive: true, force: true });
  });

  describe("loadAll", () => {
    test("loads only the built-in minimal team when no user teams exist", async () => {
      const { manager } = makeManager(workspace, homeJieDir, null);
      const loaded = await manager.loadAll();
      expect(loaded.has("minimal")).toBe(true);
      expect(loaded.size).toBe(1);
    });

    test("publishes system.team.loaded for each team it loads", async () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "alpha", "general");
      const { manager, eventManager } = makeManager(workspace, homeJieDir, null);
      const events = collectEvents(eventManager);
      await manager.loadAll();
      const loadedIds = events.teamLoaded.map((e) => e.payload.teamId);
      expect(loadedIds).toContain("minimal");
      expect(loadedIds).toContain("alpha");
    });

    test("missing-model team: emits system.error and is omitted from the returned map", async () => {
      settingsStore.load.mockReturnValue({});
      const { manager, eventManager } = makeManager(workspace, homeJieDir, null);
      const events = collectEvents(eventManager);
      const loaded = await manager.loadAll();
      expect(loaded.has("minimal")).toBe(false);
      expect(events.systemError).toHaveLength(1);
      expect(events.systemError[0]!.payload.error).toMatch(/team 'minimal' failed to load/);
    });

    test("UNKNOWN_SESSION propagates out of loadAll instead of being swallowed", async () => {
      const resumeManager = createTeamManager(
        { homeJieDir, projectJieDir: null, resumeSessionId: "not-a-real-id" },
        {
          eventManager: createEventManager(),
          settingsStore,
          modelRegistry: createModelRegistry(homeJieDir, null, authStore),
          toolRegistry: createToolRegistry({ workspaceRoot: workspace, eventManager: createEventManager(), artifactStore: createArtifactStore(createStorage({ type: "sqlite", filePath: ":memory:" })) }),
          artifactStore: createArtifactStore(createStorage({ type: "sqlite", filePath: ":memory:" })),
          memoryManager: createMemoryManager(createStorage({ type: "sqlite", filePath: ":memory:" })),
        },
      );
      expect(resumeManager.loadAll()).rejects.toThrow(/unknown session_id/);
    });
  });

  describe("resolve", () => {
    test("returns the loaded minimal team's identity when no teamId is given", async () => {
      const { manager } = makeManager(workspace, homeJieDir, null);
      await manager.loadAll();
      const team = await manager.resolve();
      expect(team.id).toBe("minimal");
      expect(team.leaderKey).toBe("general-1");
      expect(team.agents).toHaveLength(1);
      expect(team.agents[0]?.isLeader).toBe(true);
    });

    test("uses defaultTeam from settings when no teamId is given", async () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "dev", "leader");
      settingsStore.load.mockReturnValue({ ...DEFAULT_SETTINGS, defaultTeam: "dev" });
      const { manager } = makeManager(workspace, homeJieDir, null);
      await manager.loadAll();
      const team = await manager.resolve();
      expect(team.id).toBe("dev");
    });

    test("explicit teamId wins over defaultTeam and the built-in fallback", async () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "alpha", "general");
      writeTeam(userTeams, "beta", "general");
      settingsStore.load.mockReturnValue({ ...DEFAULT_SETTINGS, defaultTeam: "alpha" });
      const { manager } = makeManager(workspace, homeJieDir, null);
      await manager.loadAll();
      const team = await manager.resolve("beta");
      expect(team.id).toBe("beta");
    });

    test("throws EMPTY_TEAM when the requested team is not loaded", async () => {
      const { manager } = makeManager(workspace, homeJieDir, null);
      await manager.loadAll();
      expect(manager.resolve("ghost")).rejects.toThrow(/ghost.*not loaded/);
    });

    test("throws EMPTY_TEAM when no team is loaded at all", async () => {
      settingsStore.load.mockReturnValue({});
      const { manager } = makeManager(workspace, homeJieDir, null);
      await manager.loadAll();
      expect(manager.resolve()).rejects.toThrow();
    });
  });

  describe("listInstalled / locate (registry pass-through)", () => {
    test("listInstalled always includes 'minimal'", () => {
      const { manager } = makeManager(workspace, homeJieDir, null);
      expect(manager.listInstalled()).toContain("minimal");
    });

    test("listInstalled includes user teams in addition to 'minimal'", () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "alpha", "general");
      const { manager } = makeManager(workspace, homeJieDir, null);
      const installed = manager.listInstalled();
      expect(installed).toContain("minimal");
      expect(installed).toContain("alpha");
    });

    test("locate returns 'builtin' for the minimal team", () => {
      const { manager } = makeManager(workspace, homeJieDir, null);
      expect(manager.locate("minimal")).toBe("builtin");
    });

    test("locate returns 'user' for a team in ~/.jie/teams/", () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "alpha", "general");
      const { manager } = makeManager(workspace, homeJieDir, null);
      expect(manager.locate("alpha")).toBe("user");
    });

    test("locate returns 'project' for a team in <cwd>/.jie/teams/", () => {
      const projectJie = join(workspace, ".jie");
      const projectTeams = join(projectJie, "teams");
      writeTeam(projectTeams, "dev", "leader");
      const { manager } = makeManager(workspace, homeJieDir, projectJie);
      expect(manager.locate("dev")).toBe("project");
    });

    test("locate returns null for an unknown team", () => {
      const { manager } = makeManager(workspace, homeJieDir, null);
      expect(manager.locate("ghost")).toBeNull();
    });
  });

  describe("listLoaded", () => {
    test("is empty before loadAll runs", () => {
      const { manager } = makeManager(workspace, homeJieDir, null);
      expect(manager.listLoaded().size).toBe(0);
    });

    test("reflects every team loadAll loaded", async () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "alpha", "general");
      const { manager } = makeManager(workspace, homeJieDir, null);
      await manager.loadAll();
      const loaded = manager.listLoaded();
      expect(loaded.has("minimal")).toBe(true);
      expect(loaded.has("alpha")).toBe(true);
      expect(loaded.get("minimal")?.leaderKey).toBe("general-1");
    });
  });

  describe("agents", () => {
    test("returns the loaded team's identities", async () => {
      const { manager } = makeManager(workspace, homeJieDir, null);
      await manager.loadAll();
      const identities = manager.agents("minimal");
      expect(identities).toHaveLength(1);
      expect(identities[0]?.agentKey).toBe("general-1");
    });

    test("returns an empty array for a team that wasn't loaded", async () => {
      const { manager } = makeManager(workspace, homeJieDir, null);
      await manager.loadAll();
      expect(manager.agents("ghost")).toEqual([]);
    });
  });

  describe("stop", () => {
    test("no-op when no team was loaded", () => {
      const { manager } = makeManager(workspace, homeJieDir, null);
      expect(() => manager.stop()).not.toThrow();
    });

    test("can be called after loadAll without throwing", async () => {
      const { manager } = makeManager(workspace, homeJieDir, null);
      await manager.loadAll();
      expect(() => manager.stop()).not.toThrow();
    });
  });
});