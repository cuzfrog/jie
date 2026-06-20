import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { dirname, join } from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createEventBus } from "./core";
import { createJiePlatform } from "./start.ts";
import { ModelRegistry } from "./config";
import { createTeamRegistry } from "./team/index.ts";
import { createToolRegistry } from "./tools";
import { createMemoryManager, createStorage } from "./storage";
import type { MergedSettings } from "./config";

function makeSettings(overrides: Partial<MergedSettings> = {}): MergedSettings {

  return { defaultProvider: "anthropic", defaultModel: "claude-sonnet-4-5", ...overrides };
}

function makeSettingsStoreStub(settings: MergedSettings): {
  load: () => MergedSettings;
  write: () => void;
  unsetDefaultTeam: () => void;
} {
  return {
    load: () => settings,
    write: () => undefined,
    unsetDefaultTeam: () => undefined,
  };
}

function makeDeps(workspace: string, homeJieDir: string, filePath: string = ":memory:") {
  const storage = createStorage({ type: "sqlite", filePath });
  return {
    bus: createEventBus(),
    settingsStore: makeSettingsStoreStub(makeSettings()),
    storage,
    teamRegistry: createTeamRegistry({ workspace, homeJieDir }),
    modelRegistry: ModelRegistry.load(workspace, { homeDir: dirname(homeJieDir) }),
    toolRegistry: createToolRegistry(),
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
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(homeJieDir, { recursive: true, force: true });
  });

  describe("happy path (minimal team)", () => {
    test("starts the minimal team; bus is the one passed in via deps", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const handle = await createJiePlatform(
        {
          workspace,
          homeJieDir,
          teamId: "minimal",
        },
        deps,
      );
      expect(handle.bus).toBe(deps.bus);
      const events: unknown[] = [];
      handle.bus.subscribe("minimal.team.loaded", (_s, p) => {
        events.push(p);
      });
      expect(events).toHaveLength(0);
    });

    test("team.loaded is published once at start; the event carries is_leader per agent", async () => {
      const deps = makeDeps(workspace, homeJieDir);
      const events: unknown[] = [];
      deps.bus.subscribe("minimal.team.loaded", (_s, p) => {
        events.push(p);
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
      const env = events[0] as { payload: { agents: Array<{ role: string; is_leader: boolean }> } };
      expect(env.payload.agents).toHaveLength(1);
      expect(env.payload.agents[0]!.is_leader).toBe(true);
    });

    test("model pre-check: no model in soul or settings throws", async () => {
      const filePath = join(workspace, "no-model.db");
      const storage = createStorage({ type: "sqlite", filePath });
      const deps = {
        bus: createEventBus(),
        settingsStore: makeSettingsStoreStub({}),
        storage,
        teamRegistry: createTeamRegistry({ workspace, homeJieDir }),
        modelRegistry: ModelRegistry.load(workspace, { homeDir: dirname(homeJieDir) }),
        toolRegistry: createToolRegistry(),
        memoryManager: createMemoryManager(storage),
      };
      await expect(
        createJiePlatform({ workspace, homeJieDir, teamId: "minimal" }, deps),
      ).rejects.toThrow(/No model has been selected/);
    });

    test("handle.stop() detaches all bus subscriptions", async () => {
      const handle = await createJiePlatform(
        {
          workspace,
          homeJieDir,
          teamId: "minimal",
        },
        makeDeps(workspace, homeJieDir),
      );
      expect(handle.bus.subscriberCount("minimal.general-1")).toBeGreaterThan(0);
      await handle.stop();
      expect(handle.bus.subscriberCount("minimal.general-1")).toBe(0);
    });
  });

  describe("session id resolution", () => {
    test("resumeSessionId: valid id is used; invalid id rejects with 'unknown session_id:'", async () => {
      const filePath = join(workspace, "resume.db");
      const storage1 = createStorage({ type: "sqlite", filePath });
      const deps1 = {
        bus: createEventBus(),
        settingsStore: makeSettingsStoreStub(makeSettings()),
        storage: storage1,
        teamRegistry: createTeamRegistry({ workspace, homeJieDir }),
        modelRegistry: ModelRegistry.load(workspace, { homeDir: dirname(homeJieDir) }),
        toolRegistry: createToolRegistry(),
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
      const deps2 = {
        bus: createEventBus(),
        settingsStore: makeSettingsStoreStub(makeSettings()),
        storage: storage2,
        teamRegistry: createTeamRegistry({ workspace, homeJieDir }),
        modelRegistry: ModelRegistry.load(workspace, { homeDir: dirname(homeJieDir) }),
        toolRegistry: createToolRegistry(),
        memoryManager: createMemoryManager(storage2),
      };
      const h2 = await createJiePlatform(
        { workspace, homeJieDir, teamId: "minimal", resumeSessionId: sessionId },
        deps2,
      );
      await h2.stop();

      const storage3 = createStorage({ type: "sqlite", filePath });
      const deps3 = {
        bus: createEventBus(),
        settingsStore: makeSettingsStoreStub(makeSettings()),
        storage: storage3,
        teamRegistry: createTeamRegistry({ workspace, homeJieDir }),
        modelRegistry: ModelRegistry.load(workspace, { homeDir: dirname(homeJieDir) }),
        toolRegistry: createToolRegistry(),
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
      const events: unknown[] = [];
      deps.bus.subscribe("ghost.team.loaded", (_s, p) => {
        events.push(p);
      });
      const handle = await createJiePlatform(
        { workspace, homeJieDir, teamId: "ghost" },
        deps,
      );
      expect(events).toHaveLength(1);
      const env = events[0] as { payload: { agents: unknown[] } };
      expect(env.payload.agents).toEqual([]);
      await handle.stop();
    });
  });
});
