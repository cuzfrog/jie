import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ModelRegistry, Settings, SettingsStore } from "../config";
import type { AgentBody, AgentBodyParams } from "../core";
import type { EventEnvelope, EventManager, EventType } from "../event";
import type { MemoryManager } from "../storage";
import { TeamManagerImpl } from "./team-manager";

const eventManager = vi.mocked<EventManager>({
  publish: vi.fn(),
  subscribe: vi.fn(),
});

const settingsStore = vi.mocked<SettingsStore>({
  load: vi.fn(),
  setDefaultProvider: vi.fn(),
  setDefaultTeam: vi.fn(),
});

const modelRegistry = vi.mocked<ModelRegistry>({
  providers: vi.fn(() => []),
  resolve: vi.fn(() => undefined),
  listModels: vi.fn(() => []),
  getApiKey: vi.fn(() => undefined),
});

const memoryManager = vi.mocked<MemoryManager>({
  persist: vi.fn(),
  compact: vi.fn(),
  restore: vi.fn(async () => []),
  hasSession: vi.fn(() => false),
  listSessions: vi.fn(() => []),
});

const DEFAULT_SETTINGS: Settings = {
  defaultProvider: "anthropic",
  defaultModel: "claude-sonnet-4-5",
};

function makeModel(provider: string, id: string): Model<Api> {
  return {
    id,
    name: id,
    api: "anthropic-messages" as Api,
    provider,
    baseUrl: "",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 200000,
    maxTokens: 8192,
  };
}

function makeFakeBody(params: AgentBodyParams, restored: ReadonlyArray<AgentMessage>): AgentBody {
  return {
    identity: {
      teamId: params.teamId,
      role: params.soul.role,
      agentKey: params.agentKey,
      isLeader: params.isLeader,
      model: null,
    },
    restore: async () => restored,
    start: async () => {},
    stop: () => {},
  };
}

function makeManager(homeJieDir: string, projectJieDir: string | null, resumeSessionId?: string, restored: ReadonlyArray<AgentMessage> = []) {
  const agentBodyFactory = vi.fn((params: AgentBodyParams): AgentBody => makeFakeBody(params, restored));
  const manager = new TeamManagerImpl(homeJieDir, projectJieDir, eventManager, settingsStore, modelRegistry, memoryManager, agentBodyFactory, resumeSessionId);
  return { manager, agentBodyFactory };
}

function publishedEvents(): ReadonlyArray<EventEnvelope<EventType>> {
  return eventManager.publish.mock.calls.map((call) => call[0]);
}

function teamLoadedEvents(): ReadonlyArray<EventEnvelope<"system.team.loaded">> {
  return publishedEvents().filter((e): e is EventEnvelope<"system.team.loaded"> => e.topic === "system.team.loaded");
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

function assistantMessage(text: string, timestamp: number): AgentMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "openai", provider: "openai", model: "m",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "stop", timestamp,
  };
}

describe("TeamManagerImpl — full surface", () => {
  let workspace: string;
  let homeJieDir: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-team-mgr-"));
    homeJieDir = mkdtempSync(join(tmpdir(), "jie-team-mgr-home-"));
    settingsStore.load.mockReturnValue(DEFAULT_SETTINGS);
    modelRegistry.resolve.mockReturnValue(makeModel("anthropic", "claude-sonnet-4-5"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(homeJieDir, { recursive: true, force: true });
  });

  describe("load", () => {
    test("loads the built-in minimal team when no teamId is given", async () => {
      const { manager, agentBodyFactory } = makeManager(homeJieDir, null);
      const team = await manager.load();
      expect(team.id).toBe("minimal");
      expect(team.leaderKey).toBe("general-1");
      expect(team.agents).toHaveLength(1);
      expect(team.agents[0]?.isLeader).toBe(true);
      expect(agentBodyFactory).toHaveBeenCalledTimes(1);
      expect(teamLoadedEvents().map((e) => e.payload.id)).toContain("minimal");
    });

    test("uses defaultTeam from settings when no teamId is given", async () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "dev", "leader");
      settingsStore.load.mockReturnValue({ ...DEFAULT_SETTINGS, defaultTeam: "dev" });
      const { manager } = makeManager(homeJieDir, null);
      const team = await manager.load();
      expect(team.id).toBe("dev");
    });

    test("stale defaultTeam falls back to a first-available user team", async () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "alpha", "general");
      settingsStore.load.mockReturnValue({ ...DEFAULT_SETTINGS, defaultTeam: "ghost" });
      const { manager } = makeManager(homeJieDir, null);
      const team = await manager.load();
      expect(team.id).toBe("alpha");
    });

    test("stale defaultTeam with no user teams falls back to minimal", async () => {
      settingsStore.load.mockReturnValue({ ...DEFAULT_SETTINGS, defaultTeam: "ghost" });
      const { manager } = makeManager(homeJieDir, null);
      const team = await manager.load();
      expect(team.id).toBe("minimal");
    });

    test("derived resolution never persists the auto-selected team", async () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "alpha", "general");
      settingsStore.load.mockReturnValue({ ...DEFAULT_SETTINGS, defaultTeam: "ghost" });
      const { manager } = makeManager(homeJieDir, null);
      await manager.load();
      expect(settingsStore.setDefaultTeam).not.toHaveBeenCalled();
    });

    test("explicit teamId wins over defaultTeam and the built-in fallback", async () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "alpha", "general");
      writeTeam(userTeams, "beta", "general");
      settingsStore.load.mockReturnValue({ ...DEFAULT_SETTINGS, defaultTeam: "alpha" });
      const { manager } = makeManager(homeJieDir, null);
      const team = await manager.load("beta");
      expect(team.id).toBe("beta");
    });

    test("throws when an explicitly requested team manifest is missing", async () => {
      const { manager } = makeManager(homeJieDir, null);
      expect(manager.load("ghost")).rejects.toThrow();
    });

    test("UNKNOWN_SESSION propagates out of load", async () => {
      const { manager } = makeManager(homeJieDir, null, "not-a-real-id");
      expect(manager.load("minimal")).rejects.toThrow(/unknown session_id/);
    });

    test("resumeSession(teamId, sessionId) loads with the named session and rejects unknown ones", async () => {
      memoryManager.hasSession.mockImplementation((_teamId, sessionId) => sessionId === "01-real-session");
      const { manager } = makeManager(homeJieDir, null);
      await manager.load("minimal");
      const reloaded = await manager.resumeSession("minimal", "01-real-session");
      expect(reloaded.id).toBe("minimal");

      const freshManager = makeManager(homeJieDir, null).manager;
      expect(freshManager.resumeSession("minimal", "01-not-real")).rejects.toThrow(/unknown session_id/);
    });

    test("system.team.loaded carries restored history; the returned identity carries empty history", async () => {
      memoryManager.hasSession.mockReturnValue(true);
      const seeded: ReadonlyArray<AgentMessage> = [{ role: "user", content: "[user]: hello", timestamp: 1 }, assistantMessage("hi there", 2)];
      const { manager } = makeManager(homeJieDir, null, undefined, seeded);
      const identity = await manager.resumeSession("minimal", "01-seeded");
      const payload = teamLoadedEvents().find((e) => e.payload.id === "minimal")?.payload;
      expect(payload?.history).toHaveLength(1);
      expect(payload?.history[0]?.agentKey).toBe("general-1");
      expect(payload?.history[0]?.messages).toHaveLength(2);
      expect(identity.history[0]?.messages).toEqual([]);
    });

    test("resumeSession reloads an already-loaded team and re-publishes history (picker flow, not a cache hit)", async () => {
      memoryManager.hasSession.mockReturnValue(true);
      const seeded: ReadonlyArray<AgentMessage> = [{ role: "user", content: "[user]: hello", timestamp: 1 }, assistantMessage("hi there", 2)];
      const { manager } = makeManager(homeJieDir, null, undefined, seeded);
      await manager.load("minimal");
      eventManager.publish.mockClear();
      await manager.resumeSession("minimal", "01-seeded");
      expect(teamLoadedEvents()).toHaveLength(1);
      expect(teamLoadedEvents()[0]?.payload.history[0]?.messages).toHaveLength(2);
    });

    test("second call to load() returns the cached identity without rebuilding", async () => {
      const { manager } = makeManager(homeJieDir, null);
      await manager.load("minimal");
      await manager.load("minimal");
      expect(teamLoadedEvents().filter((e) => e.payload.id === "minimal")).toHaveLength(1);
    });

    test("loads a second team without disturbing the first", async () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "alpha", "general");
      const { manager } = makeManager(homeJieDir, null);
      await manager.load("minimal");
      await manager.load("alpha");
      const loadedIds = teamLoadedEvents().map((e) => e.payload.id);
      expect(loadedIds).toContain("minimal");
      expect(loadedIds).toContain("alpha");
    });
  });

  describe("listInstalled / locate (registry pass-through)", () => {
    test("listInstalled always includes 'minimal'", () => {
      const { manager } = makeManager(homeJieDir, null);
      expect(manager.listInstalled()).toContain("minimal");
    });

    test("listInstalled includes user teams in addition to 'minimal'", () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "alpha", "general");
      const { manager } = makeManager(homeJieDir, null);
      const installed = manager.listInstalled();
      expect(installed).toContain("minimal");
      expect(installed).toContain("alpha");
    });

    test("locate returns 'builtin' for the minimal team", () => {
      const { manager } = makeManager(homeJieDir, null);
      expect(manager.locate("minimal")).toBe("builtin");
    });

    test("locate returns 'user' for a team in ~/.jie/teams/", () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "alpha", "general");
      const { manager } = makeManager(homeJieDir, null);
      expect(manager.locate("alpha")).toBe("user");
    });

    test("locate returns 'project' for a team in <cwd>/.jie/teams/", () => {
      const projectJie = join(workspace, ".jie");
      const projectTeams = join(projectJie, "teams");
      writeTeam(projectTeams, "dev", "leader");
      const { manager } = makeManager(homeJieDir, projectJie);
      expect(manager.locate("dev")).toBe("project");
    });

    test("locate returns null for an unknown team", () => {
      const { manager } = makeManager(homeJieDir, null);
      expect(manager.locate("ghost")).toBeNull();
    });
  });

  describe("listLoaded", () => {
    test("is empty before any team is loaded", () => {
      const { manager } = makeManager(homeJieDir, null);
      expect(manager.listLoaded().size).toBe(0);
    });

    test("reflects every team load has loaded", async () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "alpha", "general");
      const { manager } = makeManager(homeJieDir, null);
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
      const { manager } = makeManager(homeJieDir, null);
      await manager.load("minimal");
      const identities = manager.agents("minimal");
      expect(identities).toHaveLength(1);
      expect(identities[0]?.agentKey).toBe("general-1");
    });

    test("returns an empty array for a team that wasn't loaded", () => {
      const { manager } = makeManager(homeJieDir, null);
      expect(manager.agents("ghost")).toEqual([]);
    });
  });

  describe("stop", () => {
    test("no-op when no team was loaded", () => {
      const { manager } = makeManager(homeJieDir, null);
      expect(() => manager.stop()).not.toThrow();
    });

    test("can be called after load without throwing", async () => {
      const { manager } = makeManager(homeJieDir, null);
      await manager.load("minimal");
      expect(() => manager.stop()).not.toThrow();
    });
  });

  describe("listSessions", () => {
    test("returns empty array for a team with no sessions", () => {
      const { manager } = makeManager(homeJieDir, null);
      expect(manager.listSessions("ghost-team")).toEqual([]);
      expect(memoryManager.listSessions).toHaveBeenCalledWith("ghost-team");
    });

    test("delegates to memoryManager scoped to the requested teamId", async () => {
      const sessions = [
        { sessionId: "session-A", messageCount: 3, lastActivity: "2026-07-13T10:00:00.000Z" },
        { sessionId: "session-B", messageCount: 7, lastActivity: "2026-07-13T11:00:00.000Z" },
      ];
      memoryManager.listSessions.mockReturnValue(sessions);
      const { manager } = makeManager(homeJieDir, null);
      expect(manager.listSessions("minimal")).toBe(sessions);
      expect(memoryManager.listSessions).toHaveBeenCalledWith("minimal");
    });
  });
});
