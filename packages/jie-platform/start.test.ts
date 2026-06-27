import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { join } from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createEventManager, type EventEnvelope } from "./event";
import { createJiePlatform } from "./start.ts";
import { createModelRegistry, type SettingsStore } from "./config";
import type { AuthStore } from "./config";
import { createTeamRegistry } from "./team/index.ts";
import { createToolRegistry } from "./tools";
import { createArtifactStore, createMemoryManager, createStorage } from "./storage";
import type { MergedSettings } from "./config";

const settingsStore = vi.mocked<SettingsStore>({
  load: vi.fn(),
  write: vi.fn(),
  unsetDefaultTeam: vi.fn(),
});

const authStore = vi.mocked<AuthStore>({
  load: vi.fn(),
  write: vi.fn(),
  setProvider: vi.fn(),
  removeProvider: vi.fn(),
  clear: vi.fn(),
});

const DEFAULT_SETTINGS: MergedSettings = {
  defaultProvider: "anthropic",
  defaultModel: "claude-sonnet-4-5",
};

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
  return {
    events,
    settingsStore,
    storage,
    teamRegistry: createTeamRegistry({ homeJieDir, projectJieDir }),
    modelRegistry: createModelRegistry(homeJieDir, projectJieDir, authStore),
    toolRegistry,
    artifactStore,
    memoryManager: createMemoryManager(storage),
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
    test("starts the minimal team; events is the manager wrapping the bus from deps", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform(
        {
          workspace,
          homeJieDir,
          teamId: "minimal",
        },
        deps,
      );
      const events: EventEnvelope<string>[] = [];
      handle.events.subscribe("team.minimal.agent.general-1.prompt", (env) => {
        events.push(env);
      });
      expect(events).toHaveLength(0);
    });

    test("team.loaded is published once at start; the event carries is_leader per agent", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const events: EventEnvelope<string>[] = [];
      deps.events.subscribe("team.minimal.loaded", (env) => {
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
      const payload = env.payload as { agents: Array<{ role: string; is_leader: boolean }> };
      expect(payload.agents).toHaveLength(1);
      expect(payload.agents[0]!.is_leader).toBe(true);
    });

    test("model pre-check: no model in soul or settings throws", async () => {
      settingsStore.load.mockReturnValueOnce({});
      const filePath = join(workspace, "no-model.db");
      const storage = createStorage({ type: "sqlite", filePath });
      const projectJieDir = join(workspace, ".jie");
      const events = createEventManager();
      const artifactStore = createArtifactStore(storage);
      const deps = {
        events,
        settingsStore,
        storage,
        teamRegistry: createTeamRegistry({ homeJieDir, projectJieDir }),
        modelRegistry: createModelRegistry(homeJieDir, projectJieDir, authStore),
        toolRegistry: createToolRegistry({ workspaceRoot: workspace, eventManager: events, artifactStore }),
        artifactStore,
        memoryManager: createMemoryManager(storage),
      };
      await expect(
        createJiePlatform({ workspace, homeJieDir, teamId: "minimal" }, deps),
      ).rejects.toThrow(/No model has been selected/);
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
      expect(deps.events.subscriberCount("team.minimal.agent.general-1.prompt")).toBeGreaterThan(0);
      await handle.stop();
      expect(deps.events.subscriberCount("team.minimal.agent.general-1.prompt")).toBe(0);
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
        events: events1,
        settingsStore,
        storage: storage1,
        teamRegistry: createTeamRegistry({ homeJieDir, projectJieDir }),
        modelRegistry: createModelRegistry(homeJieDir, projectJieDir, authStore),
        toolRegistry: createToolRegistry({ workspaceRoot: workspace, eventManager: events1, artifactStore: artifactStore1 }),
        artifactStore: artifactStore1,
        memoryManager: createMemoryManager(storage1),
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
        events: events2,
        settingsStore,
        storage: storage2,
        teamRegistry: createTeamRegistry({ homeJieDir, projectJieDir }),
        modelRegistry: createModelRegistry(homeJieDir, projectJieDir, authStore),
        toolRegistry: createToolRegistry({ workspaceRoot: workspace, eventManager: events2, artifactStore: artifactStore2 }),
        artifactStore: artifactStore2,
        memoryManager: createMemoryManager(storage2),
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
        events: events3,
        settingsStore,
        storage: storage3,
        teamRegistry: createTeamRegistry({ homeJieDir, projectJieDir }),
        modelRegistry: createModelRegistry(homeJieDir, projectJieDir, authStore),
        toolRegistry: createToolRegistry({ workspaceRoot: workspace, eventManager: events3, artifactStore: artifactStore3 }),
        artifactStore: artifactStore3,
        memoryManager: createMemoryManager(storage3),
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
      const events: EventEnvelope<string>[] = [];
      deps.events.subscribe("team.ghost.loaded", (env) => {
        events.push(env);
      });
      const handle = await createJiePlatform(
        { workspace, homeJieDir, teamId: "ghost" },
        deps,
      );
      expect(events).toHaveLength(1);
      const payload = events[0]!.payload as { agents: unknown[] };
      expect(payload.agents).toEqual([]);
      await handle.stop();
    });
  });
});
