import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTeamManager } from "./team-manager";
import { createEventManager } from "../event";
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
    modelRegistry: createModelRegistry(homeJieDir, projectJieDir, authStore),
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

function writeTeam(rootDir: string, id: string, leader: string): void {
  const teamDir = join(rootDir, id);
  mkdirSync(teamDir, { recursive: true });
  writeFileSync(join(teamDir, "TEAM.md"), `---\nleader: ${leader}\n---\n`);
  writeFileSync(join(teamDir, `${leader}.md`), `---\ntools:\n  - bash\n---\nbody`);
}

describe("createTeamManager — lifecycle", () => {
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
    test("load('minimal') returns the agent identities for the built-in team", async () => {
      const { manager } = makeManager(workspace, homeJieDir, null);
      const identities = await manager.load("minimal");
      expect(identities).toHaveLength(1);
      expect(identities[0]?.role).toBe("general");
      expect(identities[0]?.isLeader).toBe(true);
    });

    test("load(undefined) defaults to the built-in team", async () => {
      const { manager } = makeManager(workspace, homeJieDir, null);
      const identities = await manager.load();
      expect(identities[0]?.role).toBe("general");
    });

    test("load is idempotent: a second call returns identities for the same team without rebuilding", async () => {
      const { manager } = makeManager(workspace, homeJieDir, null);
      const first = await manager.load("minimal");
      const second = await manager.load("minimal");
      expect(second).toEqual(first);
    });

    test("load throws for an unknown team id", () => {
      const { manager } = makeManager(workspace, homeJieDir, null);
      expect(() => manager.load("ghost")).toThrow(/team 'ghost' not found/);
    });

    test("load throws for an invalid team id without touching the disk", () => {
      const { manager } = makeManager(workspace, homeJieDir, null);
      expect(() => manager.load("bad id with spaces")).toThrow();
    });

    test("load builds bodies for every role in the blueprint", async () => {
      const projJie = join(workspace, ".jie");
      const projectTeams = join(projJie, "teams");
      writeTeam(projectTeams, "dev", "leader");
      mkdirSync(join(projectTeams, "dev"), { recursive: true });
      writeFileSync(join(projectTeams, "dev", "worker.md"), `---\ntools:\n  - bash\n---\nworker`);
      const { manager } = makeManager(workspace, homeJieDir, projJie);
      const identities = await manager.load("dev");
      expect(identities).toHaveLength(2);
      const leader = identities.find((i) => i.role === "leader");
      const worker = identities.find((i) => i.role === "worker");
      expect(leader?.isLeader).toBe(true);
      expect(worker?.isLeader).toBe(false);
    });
  });

  describe("agents", () => {
    test("returns the loaded team's identities", async () => {
      const { manager } = makeManager(workspace, homeJieDir, null);
      const identities = await manager.load("minimal");
      expect(manager.agents("minimal")).toEqual(identities);
    });

    test("returns an empty array for a team that hasn't been loaded", () => {
      const { manager } = makeManager(workspace, homeJieDir, null);
      expect(manager.agents("ghost")).toEqual([]);
    });
  });

  describe("listInstalled / locate (registry pass-through)", () => {
    test("listInstalled includes 'minimal' when nothing else is installed", () => {
      const { manager } = makeManager(workspace, homeJieDir, null);
      expect(manager.listInstalled()).toEqual(["minimal"]);
    });

    test("locate returns 'builtin' for the minimal team", () => {
      const { manager } = makeManager(workspace, homeJieDir, null);
      expect(manager.locate("minimal")).toBe("builtin");
    });
  });

  describe("stop", () => {
    test("stop can be called after load without throwing", async () => {
      const { manager } = makeManager(workspace, homeJieDir, null);
      await manager.load("minimal");
      expect(() => manager.stop()).not.toThrow();
    });

    test("stop is a no-op when no team was loaded", () => {
      const { manager } = makeManager(workspace, homeJieDir, null);
      expect(() => manager.stop()).not.toThrow();
    });
  });
});