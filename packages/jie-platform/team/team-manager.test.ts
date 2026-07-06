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

  describe("load", () => {
    test("loads the built-in minimal team when no teamId is given", async () => {
      const { manager, eventManager } = makeManager(workspace, homeJieDir, null);
      const events = collectEvents(eventManager);
      const team = await manager.load();
      expect(team.id).toBe("minimal");
      expect(team.leaderKey).toBe("general-1");
      expect(team.agents).toHaveLength(1);
      expect(team.agents[0]?.isLeader).toBe(true);
      const loadedIds = events.teamLoaded.map((e) => e.payload.teamId);
      expect(loadedIds).toContain("minimal");
    });

    test("uses defaultTeam from settings when no teamId is given", async () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "dev", "leader");
      settingsStore.load.mockReturnValue({ ...DEFAULT_SETTINGS, defaultTeam: "dev" });
      const { manager } = makeManager(workspace, homeJieDir, null);
      const team = await manager.load();
      expect(team.id).toBe("dev");
    });

    test("stale defaultTeam falls back to a first-available user team", async () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "alpha", "general");
      settingsStore.load.mockReturnValue({ ...DEFAULT_SETTINGS, defaultTeam: "ghost" });
      const { manager } = makeManager(workspace, homeJieDir, null);
      const team = await manager.load();
      expect(team.id).toBe("alpha");
    });

    test("stale defaultTeam with no user teams falls back to minimal", async () => {
      settingsStore.load.mockReturnValue({ ...DEFAULT_SETTINGS, defaultTeam: "ghost" });
      const { manager } = makeManager(workspace, homeJieDir, null);
      const team = await manager.load();
      expect(team.id).toBe("minimal");
    });

    test("derived resolution never persists the auto-selected team", async () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "alpha", "general");
      settingsStore.load.mockReturnValue({ ...DEFAULT_SETTINGS, defaultTeam: "ghost" });
      const { manager } = makeManager(workspace, homeJieDir, null);
      await manager.load();
      expect(settingsStore.setDefaultTeam).not.toHaveBeenCalled();
    });

    test("explicit teamId wins over defaultTeam and the built-in fallback", async () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "alpha", "general");
      writeTeam(userTeams, "beta", "general");
      settingsStore.load.mockReturnValue({ ...DEFAULT_SETTINGS, defaultTeam: "alpha" });
      const { manager } = makeManager(workspace, homeJieDir, null);
      const team = await manager.load("beta");
      expect(team.id).toBe("beta");
    });

    test("throws when an explicitly requested team manifest is missing", async () => {
      const { manager } = makeManager(workspace, homeJieDir, null);
      expect(manager.load("ghost")).rejects.toThrow();
    });

    test("UNKNOWN_SESSION propagates out of load", async () => {
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
      expect(resumeManager.load("minimal")).rejects.toThrow(/unknown session_id/);
    });

    test("second call to load() returns the cached identity without rebuilding", async () => {
      const { manager, eventManager } = makeManager(workspace, homeJieDir, null);
      const events = collectEvents(eventManager);
      await manager.load("minimal");
      await manager.load("minimal");
      const minimalEvents = events.teamLoaded.filter((e) => e.payload.teamId === "minimal");
      expect(minimalEvents).toHaveLength(1);
    });

    test("loads a second team without disturbing the first", async () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "alpha", "general");
      const { manager, eventManager } = makeManager(workspace, homeJieDir, null);
      const events = collectEvents(eventManager);
      await manager.load("minimal");
      await manager.load("alpha");
      const loadedIds = events.teamLoaded.map((e) => e.payload.teamId);
      expect(loadedIds).toContain("minimal");
      expect(loadedIds).toContain("alpha");
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
    test("is empty before any team is loaded", () => {
      const { manager } = makeManager(workspace, homeJieDir, null);
      expect(manager.listLoaded().size).toBe(0);
    });

    test("reflects every team load has loaded", async () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "alpha", "general");
      const { manager } = makeManager(workspace, homeJieDir, null);
      await manager.load("minimal");
      await manager.load("alpha");
      const loaded = manager.listLoaded();
      expect(loaded.has("minimal")).toBe(true);
      expect(loaded.has("alpha")).toBe(true);
      expect(loaded.get("minimal")?.leaderKey).toBe("general-1");
    });
  });

  describe("agents", () => {
    test("returns the loaded team's identities", async () => {
      const { manager } = makeManager(workspace, homeJieDir, null);
      await manager.load("minimal");
      const identities = manager.agents("minimal");
      expect(identities).toHaveLength(1);
      expect(identities[0]?.agentKey).toBe("general-1");
    });

    test("returns an empty array for a team that wasn't loaded", () => {
      const { manager } = makeManager(workspace, homeJieDir, null);
      expect(manager.agents("ghost")).toEqual([]);
    });
  });

  describe("stop", () => {
    test("no-op when no team was loaded", () => {
      const { manager } = makeManager(workspace, homeJieDir, null);
      expect(() => manager.stop()).not.toThrow();
    });

    test("can be called after load without throwing", async () => {
      const { manager } = makeManager(workspace, homeJieDir, null);
      await manager.load("minimal");
      expect(() => manager.stop()).not.toThrow();
    });
  });
});