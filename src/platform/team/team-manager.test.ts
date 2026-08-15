import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ModelRegistry, Settings, SettingsStore } from "../config";
import type { AgentBody, AgentBodyParams } from "../core";
import type { EventEnvelope, EventManager, EventType } from "../event";
import type { SkillManager } from "../skills";
import type { KanbanStore, TranscriptStore } from "../storage";
import { AgentRegistryImpl } from "./agent-registry";
import { TeamManagerImpl } from "./team-manager";
import { TeamRegistryImpl } from "./registry";

const eventManager = vi.mocked<EventManager>({
  publish: vi.fn(),
  subscribe: vi.fn(),
});

const settingsStore = vi.mocked<SettingsStore>({
  load: vi.fn(),
  setDefaultProvider: vi.fn(),
  setDefaultEffort: vi.fn(),
  setDefaultTeam: vi.fn(),
  setModelFilters: vi.fn(),
  setNotificationSoundEnabled: vi.fn(),
  setModelAlias: vi.fn(),
});

const modelRegistry = vi.mocked<ModelRegistry>({
  providers: vi.fn(() => []),
  listProviders: vi.fn(() => []),
  resolve: vi.fn(() => undefined),
  listModels: vi.fn(() => []),
  getApiKey: vi.fn(() => undefined),
  reload: vi.fn(),
});

const skillManager = vi.mocked<SkillManager>({
  resolve: vi.fn(() => []),
  reload: vi.fn(),
});

const transcriptStore = vi.mocked<TranscriptStore>({
  persist: vi.fn(),
  compact: vi.fn(),
  restore: vi.fn(async () => []),
  restoreDisplay: vi.fn(async () => []),
  hasSession: vi.fn(() => false),
  listSessions: vi.fn(() => []),
  listAgentKeys: vi.fn(() => []),
  remove: vi.fn(),
  sessionName: vi.fn(() => null),
  renameSession: vi.fn(),
});

const kanbanStore = vi.mocked<KanbanStore>({
  load: vi.fn(() => []),
  replace: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  setStatus: vi.fn(),
  editContent: vi.fn(),
  editDescription: vi.fn(),
  handoff: vi.fn(),
  update: vi.fn(),
  claim: vi.fn(),
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

function makeFakeBody(params: AgentBodyParams, restored: ReadonlyArray<AgentMessage>, displayed?: ReadonlyArray<AgentMessage>): AgentBody {
  const display = displayed ?? restored;
  return {
    identity: {
      teamId: params.teamId,
      role: params.soul.role,
      agentKey: params.agentKey,
      isLeader: params.isLeader,
      tools: params.soul.tools,
      subscribe: params.soul.subscribe,
      skills: params.soul.skills.map((name) => ({ name, description: "", argumentHint: null })),
      model: null,
      ephemeral: params.isEphemeral ?? false,
    },
    restore: async () => restored,
    messages: () => [...restored],
    displayMessages: () => [...display],
    start: async () => {},
    compact: async () => {},
    stop: () => {},
  };
}

function makeManager(homeJieDir: string, projectJieDir: string | null, resumeSessionId?: string, restored: ReadonlyArray<AgentMessage> = [], displayed?: ReadonlyArray<AgentMessage>) {
  const agentBodyFactory = vi.fn((params: AgentBodyParams): AgentBody => makeFakeBody(params, restored, displayed));
  const agentRegistry = new AgentRegistryImpl(homeJieDir, projectJieDir);
  const teamRegistry = new TeamRegistryImpl(homeJieDir, projectJieDir, agentRegistry);
  const manager = new TeamManagerImpl(teamRegistry, agentRegistry, eventManager, settingsStore, modelRegistry, transcriptStore, kanbanStore, skillManager, agentBodyFactory, resumeSessionId);
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

function writeAgent(jieDir: string, id: string, content: string): void {
  const agentsDir = join(jieDir, "agents");
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(join(agentsDir, `${id}.md`), content, "utf-8");
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
    test("loads the built-in setup-assistant team when no teamId is given", async () => {
      const { manager, agentBodyFactory } = makeManager(homeJieDir, null);
      const team = await manager.load();
      expect(team.id).toBe("setup-assistant");
      expect(team.leaderKey).toBe("general-1");
      expect(team.agents).toHaveLength(1);
      expect(team.agents[0]?.isLeader).toBe(true);
      expect(agentBodyFactory).toHaveBeenCalledTimes(1);
      expect(teamLoadedEvents().map((e) => e.payload.id)).toContain("setup-assistant");
    });

    test("forwards the parsed soul (with tool specs) to the body factory", async () => {
      const teamDir = join(homeJieDir, "teams", "dev");
      mkdirSync(teamDir, { recursive: true });
      writeFileSync(join(teamDir, "TEAM.md"), `---\nleader: manager\n---\n`);
      writeFileSync(join(teamDir, "manager.md"), `---\ntools:\n  - notify(task.recorded)\n  - bash\n---\nmanager`);
      const { manager, agentBodyFactory } = makeManager(homeJieDir, null);
      await manager.load("dev");
      const params = agentBodyFactory.mock.calls[0]![0]!;
      expect(params.soul.role).toBe("manager");
      expect(params.soul.tools).toEqual(["notify(task.recorded)", "bash"]);
      expect(params.isLeader).toBe(true);
    });

    test("exposes the description", async () => {
      const teamDir = join(homeJieDir, "teams", "dev");
      mkdirSync(teamDir, { recursive: true });
      writeFileSync(
        join(teamDir, "TEAM.md"),
        `---\nleader: manager\ndescription: a test team\n---\nShared team context.\n`,
      );
      writeFileSync(join(teamDir, "manager.md"), `---\ntools:\n  - bash\n---\nmanager`);
      const { manager } = makeManager(homeJieDir, null);
      const info = await manager.load("dev");
      expect(info.description).toBe("a test team");
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

    test("no defaultTeam and a user team installed selects the user team", async () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "alpha", "general");
      settingsStore.load.mockReturnValue(DEFAULT_SETTINGS);
      const { manager } = makeManager(homeJieDir, null);
      const team = await manager.load();
      expect(team.id).toBe("alpha");
    });

    test("stale defaultTeam with no user teams falls back to setup-assistant", async () => {
      settingsStore.load.mockReturnValue({ ...DEFAULT_SETTINGS, defaultTeam: "ghost" });
      const { manager } = makeManager(homeJieDir, null);
      const team = await manager.load();
      expect(team.id).toBe("setup-assistant");
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

    test("rejects and leaves the team unloaded when a body fails to start", async () => {
      const factory = vi.fn((params: AgentBodyParams): AgentBody => ({
        identity: { teamId: params.teamId, role: params.soul.role, agentKey: params.agentKey, isLeader: params.isLeader, tools: [], subscribe: [], skills: [], model: null, ephemeral: false },
        restore: async () => [],
        messages: () => [],
        displayMessages: () => [],
        start: async () => { throw new Error("start failure"); },
        compact: async () => {},
        stop: vi.fn(),
      }));
      const manager = new TeamManagerImpl(new TeamRegistryImpl(homeJieDir, null, new AgentRegistryImpl(homeJieDir, null)), new AgentRegistryImpl(homeJieDir, null), eventManager, settingsStore, modelRegistry, transcriptStore, kanbanStore, skillManager, factory);
      await expect(manager.load("setup-assistant")).rejects.toThrow("start failure");
      expect(teamLoadedEvents()).toHaveLength(0);
      expect(manager.listLoaded().size).toBe(0);
    });

    test("rejects MODEL_UNRESOLVED before starting any body when the leader role's model does not resolve", async () => {
      const teamDir = join(homeJieDir, "teams", "dev");
      mkdirSync(teamDir, { recursive: true });
      writeFileSync(join(teamDir, "TEAM.md"), "---\nleader: lead\n---\n");
      writeFileSync(join(teamDir, "lead.md"), "---\nmodel: acme/gone\ntools:\n  - bash\n---\nlead");
      writeFileSync(join(teamDir, "worker.md"), "---\ntools:\n  - bash\n---\nworker");
      modelRegistry.resolve.mockImplementation((provider, modelId) => (modelId === "gone" ? undefined : makeModel(provider, modelId)));
      const started: string[] = [];
      const factory = vi.fn((params: AgentBodyParams): AgentBody => ({
        identity: { teamId: params.teamId, role: params.soul.role, agentKey: params.agentKey, isLeader: params.isLeader, tools: [], subscribe: [], skills: [], model: null, ephemeral: false },
        restore: async () => [],
        messages: () => [],
        displayMessages: () => [],
        start: async () => { started.push(params.agentKey); },
        compact: async () => {},
        stop: () => {},
      }));
      const manager = new TeamManagerImpl(new TeamRegistryImpl(homeJieDir, null, new AgentRegistryImpl(homeJieDir, null)), new AgentRegistryImpl(homeJieDir, null), eventManager, settingsStore, modelRegistry, transcriptStore, kanbanStore, skillManager, factory);
      await expect(manager.load("dev")).rejects.toMatchObject({ code: "MODEL_UNRESOLVED" });
      expect(started).toEqual([]);
      expect(manager.listLoaded().size).toBe(0);
    });

    test("rejects MODEL_UNRESOLVED when the built-in leader's inherited model does not resolve", async () => {
      modelRegistry.resolve.mockReturnValue(undefined);
      const { manager, agentBodyFactory } = makeManager(homeJieDir, null);
      await expect(manager.load("setup-assistant")).rejects.toMatchObject({ code: "MODEL_UNRESOLVED" });
      expect(agentBodyFactory).not.toHaveBeenCalled();
      expect(manager.listLoaded().size).toBe(0);
    });

    test("names the unresolvable model and role in the MODEL_UNRESOLVED detail", async () => {
      modelRegistry.resolve.mockReturnValue(undefined);
      const { manager } = makeManager(homeJieDir, null);
      await expect(manager.load("setup-assistant")).rejects.toThrow(/anthropic\/claude-sonnet-4-5/);
      await expect(manager.load("setup-assistant")).rejects.toThrow(/general/);
    });

    test("rejects NO_MODEL_ERROR when the soul has no model and settings define none", async () => {
      settingsStore.load.mockReturnValue({});
      const { manager, agentBodyFactory } = makeManager(homeJieDir, null);
      await expect(manager.load("setup-assistant")).rejects.toMatchObject({ code: "NO_MODEL_ERROR" });
      expect(agentBodyFactory).not.toHaveBeenCalled();
      expect(manager.listLoaded().size).toBe(0);
    });

    test("resolves a configured model alias", async () => {
      settingsStore.load.mockReturnValue({ modelAliases: { large: "openai/gpt-4o" } });
      const teamDir = join(homeJieDir, "teams", "dev");
      mkdirSync(teamDir, { recursive: true });
      writeFileSync(join(teamDir, "TEAM.md"), "---\nleader: lead\n---\n");
      writeFileSync(join(teamDir, "lead.md"), "---\nmodel: large\ntools:\n  - bash\n---\nlead");
      const { manager } = makeManager(homeJieDir, null);
      await manager.load("dev");
      expect(modelRegistry.resolve).toHaveBeenCalledWith("openai", "gpt-4o");
    });

    test("falls back to the default model when an alias is not configured", async () => {
      const teamDir = join(homeJieDir, "teams", "dev");
      mkdirSync(teamDir, { recursive: true });
      writeFileSync(join(teamDir, "TEAM.md"), "---\nleader: lead\n---\n");
      writeFileSync(join(teamDir, "lead.md"), "---\nmodel: large\ntools:\n  - bash\n---\nlead");
      const { manager } = makeManager(homeJieDir, null);
      await manager.load("dev");
      expect(modelRegistry.resolve).toHaveBeenCalledWith("anthropic", "claude-sonnet-4-5");
    });

    test("uses the soul's pinned effort and ignores defaultEffort", async () => {
      settingsStore.load.mockReturnValue({ ...DEFAULT_SETTINGS, defaultEffort: "high" });
      const teamDir = join(homeJieDir, "teams", "dev");
      mkdirSync(teamDir, { recursive: true });
      writeFileSync(join(teamDir, "TEAM.md"), "---\nleader: lead\n---\n");
      writeFileSync(join(teamDir, "lead.md"), "---\nmodel: large(low)\ntools:\n  - bash\n---\nlead");
      const { manager, agentBodyFactory } = makeManager(homeJieDir, null);
      await manager.load("dev");
      expect(agentBodyFactory.mock.calls[0]![0]!.effort).toBe("low");
    });

    test("falls back to defaultEffort when the soul has no effort", async () => {
      settingsStore.load.mockReturnValue({ ...DEFAULT_SETTINGS, defaultEffort: "medium" });
      const teamDir = join(homeJieDir, "teams", "dev");
      mkdirSync(teamDir, { recursive: true });
      writeFileSync(join(teamDir, "TEAM.md"), "---\nleader: lead\n---\n");
      writeFileSync(join(teamDir, "lead.md"), "---\nmodel: large\ntools:\n  - bash\n---\nlead");
      const { manager, agentBodyFactory } = makeManager(homeJieDir, null);
      await manager.load("dev");
      expect(agentBodyFactory.mock.calls[0]![0]!.effort).toBe("medium");
    });

    test("resolves a model alias with effort and keeps the effort", async () => {
      settingsStore.load.mockReturnValue({ ...DEFAULT_SETTINGS, modelAliases: { large: "openai/gpt-4o" } });
      const teamDir = join(homeJieDir, "teams", "dev");
      mkdirSync(teamDir, { recursive: true });
      writeFileSync(join(teamDir, "TEAM.md"), "---\nleader: lead\n---\n");
      writeFileSync(join(teamDir, "lead.md"), "---\nmodel: large(low)\ntools:\n  - bash\n---\nlead");
      const { manager, agentBodyFactory } = makeManager(homeJieDir, null);
      await manager.load("dev");
      expect(modelRegistry.resolve).toHaveBeenCalledWith("openai", "gpt-4o");
      expect(agentBodyFactory.mock.calls[0]![0]!.effort).toBe("low");
    });

    test("uses the effort suffix in a model alias when the soul has no effort", async () => {
      settingsStore.load.mockReturnValue({ ...DEFAULT_SETTINGS, modelAliases: { large: "openai/gpt-4o(low)" } });
      const teamDir = join(homeJieDir, "teams", "dev");
      mkdirSync(teamDir, { recursive: true });
      writeFileSync(join(teamDir, "TEAM.md"), "---\nleader: lead\n---\n");
      writeFileSync(join(teamDir, "lead.md"), "---\nmodel: large\ntools:\n  - bash\n---\nlead");
      const { manager, agentBodyFactory } = makeManager(homeJieDir, null);
      await manager.load("dev");
      expect(modelRegistry.resolve).toHaveBeenCalledWith("openai", "gpt-4o");
      expect(agentBodyFactory.mock.calls[0]![0]!.effort).toBe("low");
      expect(agentBodyFactory.mock.calls[0]![0]!.soul.effort).toBeUndefined();
    });

    test("the soul's pinned effort overrides an alias effort suffix", async () => {
      settingsStore.load.mockReturnValue({ ...DEFAULT_SETTINGS, modelAliases: { large: "openai/gpt-4o(high)" } });
      const teamDir = join(homeJieDir, "teams", "dev");
      mkdirSync(teamDir, { recursive: true });
      writeFileSync(join(teamDir, "TEAM.md"), "---\nleader: lead\n---\n");
      writeFileSync(join(teamDir, "lead.md"), "---\nmodel: large(low)\ntools:\n  - bash\n---\nlead");
      const { manager, agentBodyFactory } = makeManager(homeJieDir, null);
      await manager.load("dev");
      expect(agentBodyFactory.mock.calls[0]![0]!.effort).toBe("low");
      expect(agentBodyFactory.mock.calls[0]![0]!.soul.effort).toBe("low");
    });

    test("uses defaultEffort when neither the soul nor the alias pin effort", async () => {
      settingsStore.load.mockReturnValue({ ...DEFAULT_SETTINGS, defaultEffort: "medium", modelAliases: { large: "openai/gpt-4o" } });
      const teamDir = join(homeJieDir, "teams", "dev");
      mkdirSync(teamDir, { recursive: true });
      writeFileSync(join(teamDir, "TEAM.md"), "---\nleader: lead\n---\n");
      writeFileSync(join(teamDir, "lead.md"), "---\nmodel: large\ntools:\n  - bash\n---\nlead");
      const { manager, agentBodyFactory } = makeManager(homeJieDir, null);
      await manager.load("dev");
      expect(agentBodyFactory.mock.calls[0]![0]!.effort).toBe("medium");
    });

    test("per-role effort is independent across souls", async () => {
      settingsStore.load.mockReturnValue({ ...DEFAULT_SETTINGS, defaultEffort: "high" });
      const teamDir = join(homeJieDir, "teams", "dev");
      mkdirSync(teamDir, { recursive: true });
      writeFileSync(join(teamDir, "TEAM.md"), "---\nleader: lead\n---\n");
      writeFileSync(join(teamDir, "lead.md"), "---\nmodel: large(low)\ntools:\n  - bash\n---\nlead");
      writeFileSync(join(teamDir, "worker.md"), "---\ntools:\n  - bash\n---\nworker");
      const { manager, agentBodyFactory } = makeManager(homeJieDir, null);
      await manager.load("dev");
      const [lead, worker] = agentBodyFactory.mock.calls.map((call) => call[0]!);
      expect(lead!.soul.effort).toBe("low");
      expect(lead!.effort).toBe("low");
      expect(worker!.soul.effort).toBeUndefined();
      expect(worker!.effort).toBe("high");
    });

    test("skips a non-leader role whose pinned model does not resolve and loads the leader", async () => {
      const teamDir = join(homeJieDir, "teams", "dev");
      mkdirSync(teamDir, { recursive: true });
      writeFileSync(join(teamDir, "TEAM.md"), "---\nleader: lead\n---\n");
      writeFileSync(join(teamDir, "lead.md"), "---\ntools:\n  - bash\n---\nlead");
      writeFileSync(join(teamDir, "worker.md"), "---\nmodel: acme/gone\ntools:\n  - bash\n---\nworker");
      modelRegistry.resolve.mockImplementation((provider, modelId) => (modelId === "gone" ? undefined : makeModel(provider, modelId)));
      const { manager } = makeManager(homeJieDir, null);
      const team = await manager.load("dev");
      expect(team.leaderKey).toBe("lead-1");
      expect(team.agents.map((agent) => agent.agentKey)).toEqual(["lead-1"]);
    });

    test("UNKNOWN_SESSION propagates out of load", async () => {
      const { manager } = makeManager(homeJieDir, null, "not-a-real-id");
      expect(manager.load("setup-assistant")).rejects.toThrow(/unknown session_id/);
    });

    test("resumeSession(teamId, sessionId) loads with the named session and rejects unknown ones", async () => {
      transcriptStore.hasSession.mockImplementation((_teamId, sessionId) => sessionId === "01-real-session");
      const { manager } = makeManager(homeJieDir, null);
      await manager.load("setup-assistant");
      const reloaded = await manager.resumeSession("setup-assistant", "01-real-session");
      expect(reloaded.id).toBe("setup-assistant");

      const freshManager = makeManager(homeJieDir, null).manager;
      expect(freshManager.resumeSession("setup-assistant", "01-not-real")).rejects.toThrow(/unknown session_id/);
    });

    test("system.team.loaded and the returned identity both carry restored history", async () => {
      transcriptStore.hasSession.mockReturnValue(true);
      const seeded: ReadonlyArray<AgentMessage> = [{ role: "user", content: "hello", timestamp: 1 }, assistantMessage("hi there", 2)];
      const { manager } = makeManager(homeJieDir, null, undefined, seeded);
      const identity = await manager.resumeSession("setup-assistant", "01-seeded");
      const payload = teamLoadedEvents().find((e) => e.payload.id === "setup-assistant")?.payload;
      expect(payload?.history).toHaveLength(1);
      expect(payload?.history[0]?.agentKey).toBe("general-1");
      expect(payload?.history[0]?.messages).toHaveLength(2);
      expect(identity.history[0]?.messages).toHaveLength(2);
      expect(identity.history[0]?.messages).toEqual(payload?.history[0]?.messages ?? []);
    });

    test("toTeamInfo exposes displayMessages as the agent history", async () => {
      transcriptStore.hasSession.mockReturnValue(true);
      const llm: ReadonlyArray<AgentMessage> = [{ role: "user", content: "hello", timestamp: 1 }, assistantMessage("hi there", 2)];
      const display: ReadonlyArray<AgentMessage> = [{ role: "user", content: "compacted", timestamp: 0 }, ...llm];
      const { manager } = makeManager(homeJieDir, null, undefined, llm, display);
      const identity = await manager.resumeSession("setup-assistant", "01-seeded");
      const payload = teamLoadedEvents().find((e) => e.payload.id === "setup-assistant")?.payload;
      expect(identity.history[0]?.messages).toEqual(display);
      expect(payload?.history[0]?.messages).toEqual(display);
      expect(identity.history[0]?.messages).not.toEqual(llm);
    });

    test("resumeSession reloads an already-loaded team and re-publishes history (picker flow, not a cache hit)", async () => {
      transcriptStore.hasSession.mockReturnValue(true);
      const seeded: ReadonlyArray<AgentMessage> = [{ role: "user", content: "hello", timestamp: 1 }, assistantMessage("hi there", 2)];
      const { manager } = makeManager(homeJieDir, null, undefined, seeded);
      await manager.load("setup-assistant");
      eventManager.publish.mockClear();
      await manager.resumeSession("setup-assistant", "01-seeded");
      expect(teamLoadedEvents()).toHaveLength(1);
      expect(teamLoadedEvents()[0]?.payload.history[0]?.messages).toHaveLength(2);
    });

    test("second call to load() returns the cached identity without rebuilding", async () => {
      const { manager } = makeManager(homeJieDir, null);
      await manager.load("setup-assistant");
      await manager.load("setup-assistant");
      expect(teamLoadedEvents().filter((e) => e.payload.id === "setup-assistant")).toHaveLength(1);
    });

    test("cache hit carries the agents' live history and stays silent", async () => {
      const live: AgentMessage[] = [];
      const factory = (params: AgentBodyParams): AgentBody => ({
        identity: { teamId: params.teamId, role: params.soul.role, agentKey: params.agentKey, isLeader: params.isLeader, tools: [], subscribe: [], skills: [], model: null, ephemeral: false },
        restore: async () => [...live],
        messages: () => [...live],
        displayMessages: () => [...live],
        start: async () => {},
        compact: async () => {},
        stop: () => {},
      });
      const manager = new TeamManagerImpl(new TeamRegistryImpl(homeJieDir, null, new AgentRegistryImpl(homeJieDir, null)), new AgentRegistryImpl(homeJieDir, null), eventManager, settingsStore, modelRegistry, transcriptStore, kanbanStore, skillManager, factory);
      const first = await manager.load("setup-assistant");
      expect(first.history[0]?.messages).toEqual([]);
      live.push({ role: "user", content: "hello", timestamp: 1 }, assistantMessage("hi there", 2));
      const cached = await manager.load("setup-assistant");
      expect(teamLoadedEvents().filter((e) => e.payload.id === "setup-assistant")).toHaveLength(1);
      expect(cached.history[0]?.messages).toHaveLength(2);
      expect(cached.history[0]?.messages[0]).toMatchObject({ role: "user" });
      expect(cached.history[0]?.messages[1]).toMatchObject({ role: "assistant" });
    });

    test("passes the configured defaultEffort to the agent body factory", async () => {
      settingsStore.load.mockReturnValue({ ...DEFAULT_SETTINGS, defaultEffort: "high" });
      const { manager, agentBodyFactory } = makeManager(homeJieDir, null);
      await manager.load("setup-assistant");
      expect(agentBodyFactory.mock.calls[0]![0]!.effort).toBe("high");
    });

    test("passes effort 'off' to the agent body factory when no defaultEffort is configured", async () => {
      const { manager, agentBodyFactory } = makeManager(homeJieDir, null);
      await manager.load("setup-assistant");
      expect(agentBodyFactory.mock.calls[0]![0]!.effort).toBe("off");
    });

    test("loads a second team without disturbing the first", async () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "alpha", "general");
      const { manager } = makeManager(homeJieDir, null);
      await manager.load("setup-assistant");
      await manager.load("alpha");
      const loadedIds = teamLoadedEvents().map((e) => e.payload.id);
      expect(loadedIds).toContain("setup-assistant");
      expect(loadedIds).toContain("alpha");
    });
  });

  describe("reload", () => {
    test("refreshes the model registry and skills before rebuilding teams", async () => {
      const { manager, agentBodyFactory } = makeManager(homeJieDir, null);
      await manager.load("setup-assistant");
      await manager.reload();
      expect(modelRegistry.reload).toHaveBeenCalledTimes(1);
      expect(skillManager.reload).toHaveBeenCalledTimes(1);
      const rebuildCall = agentBodyFactory.mock.invocationCallOrder[1]!;
      expect(modelRegistry.reload.mock.invocationCallOrder[0]!).toBeLessThan(rebuildCall);
      expect(skillManager.reload.mock.invocationCallOrder[0]!).toBeLessThan(rebuildCall);
    });

    test("rebuilds the loaded team in place on the same session id without session validation", async () => {
      const { manager, agentBodyFactory } = makeManager(homeJieDir, null);
      await manager.load("setup-assistant");
      const sessionId = agentBodyFactory.mock.calls[0]![0]!.sessionId;
      transcriptStore.hasSession.mockClear();
      await manager.reload();
      expect(agentBodyFactory).toHaveBeenCalledTimes(2);
      expect(agentBodyFactory.mock.calls[1]![0]!.sessionId).toBe(sessionId);
      expect(transcriptStore.hasSession).not.toHaveBeenCalled();
    });

    test("re-publishes system.team.loaded for every loaded team", async () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "alpha", "general");
      const { manager } = makeManager(homeJieDir, null);
      await manager.load("setup-assistant");
      await manager.load("alpha");
      eventManager.publish.mockClear();
      const infos = await manager.reload();
      expect(teamLoadedEvents().map((e) => e.payload.id).sort()).toEqual(["alpha", "setup-assistant"]);
      expect(infos.map((info) => info.id).sort()).toEqual(["alpha", "setup-assistant"]);
    });

    test("picks up a manifest edited after load", async () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "alpha", "general");
      const { manager } = makeManager(homeJieDir, null);
      await manager.load("alpha");
      expect(manager.agents("alpha")).toHaveLength(1);
      writeTeam(userTeams, "alpha", "general", ["qa"]);
      const infos = await manager.reload();
      expect(infos[0]?.agents.map((agent) => agent.agentKey).sort()).toEqual(["general-1", "qa-1"]);
      expect(manager.agents("alpha")).toHaveLength(2);
    });

    test("stops the old bodies before starting the rebuilt ones", async () => {
      const stops: string[] = [];
      let generation = 0;
      const factory = vi.fn((params: AgentBodyParams): AgentBody => {
        const created = generation;
        return {
          identity: { teamId: params.teamId, role: params.soul.role, agentKey: params.agentKey, isLeader: params.isLeader, tools: [], subscribe: [], skills: [], model: null, ephemeral: false },
          restore: async () => [],
          messages: () => [],
        displayMessages: () => [],
          start: async () => {},
          compact: async () => {},
          stop: () => { stops.push(`gen${created}:${params.agentKey}`); },
        };
      });
      const manager = new TeamManagerImpl(new TeamRegistryImpl(homeJieDir, null, new AgentRegistryImpl(homeJieDir, null)), new AgentRegistryImpl(homeJieDir, null), eventManager, settingsStore, modelRegistry, transcriptStore, kanbanStore, skillManager, factory);
      await manager.load("setup-assistant");
      generation = 1;
      await manager.reload();
      expect(stops).toEqual(["gen0:general-1"]);
      manager.stop();
      expect(stops).toEqual(["gen0:general-1", "gen1:general-1"]);
    });

    test("is a registry-and-skills refresh only when no team is loaded", async () => {
      const { manager, agentBodyFactory } = makeManager(homeJieDir, null);
      const infos = await manager.reload();
      expect(infos).toEqual([]);
      expect(modelRegistry.reload).toHaveBeenCalledTimes(1);
      expect(skillManager.reload).toHaveBeenCalledTimes(1);
      expect(agentBodyFactory).not.toHaveBeenCalled();
      expect(teamLoadedEvents()).toHaveLength(0);
    });

    test("keeps the running team intact and fails the command when the manifest fails to parse", async () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "alpha", "general");
      const stops: string[] = [];
      const factory = vi.fn((params: AgentBodyParams): AgentBody => ({
        identity: { teamId: params.teamId, role: params.soul.role, agentKey: params.agentKey, isLeader: params.isLeader, tools: [], subscribe: [], skills: [], model: null, ephemeral: false },
        restore: async () => [],
        messages: () => [],
        displayMessages: () => [],
        start: async () => {},
        compact: async () => {},
        stop: () => { stops.push(params.agentKey); },
      }));
      const manager = new TeamManagerImpl(new TeamRegistryImpl(homeJieDir, null, new AgentRegistryImpl(homeJieDir, null)), new AgentRegistryImpl(homeJieDir, null), eventManager, settingsStore, modelRegistry, transcriptStore, kanbanStore, skillManager, factory);
      await manager.load("alpha");
      writeFileSync(join(userTeams, "alpha", "TEAM.md"), "leader: [unclosed");
      await expect(manager.reload()).rejects.toMatchObject({ code: "RELOAD_FAILED" });
      expect(stops).toEqual([]);
      expect(manager.agents("alpha")).toHaveLength(1);
    });

    test("keeps the previous entry and reports RELOAD_FAILED when a replacement body fails to start", async () => {
      const stops: string[] = [];
      let generation = 0;
      const factory = vi.fn((params: AgentBodyParams): AgentBody => {
        const created = generation;
        return {
          identity: { teamId: params.teamId, role: params.soul.role, agentKey: params.agentKey, isLeader: params.isLeader, tools: [], subscribe: [], skills: [], model: null, ephemeral: false },
          restore: async () => [],
          messages: () => [],
        displayMessages: () => [],
          start: async () => { if (created > 0) throw new Error("start failure"); },
          compact: async () => {},
          stop: () => { stops.push(`gen${created}:${params.agentKey}`); },
        };
      });
      const manager = new TeamManagerImpl(new TeamRegistryImpl(homeJieDir, null, new AgentRegistryImpl(homeJieDir, null)), new AgentRegistryImpl(homeJieDir, null), eventManager, settingsStore, modelRegistry, transcriptStore, kanbanStore, skillManager, factory);
      await manager.load("setup-assistant");
      generation = 1;
      eventManager.publish.mockClear();
      await expect(manager.reload()).rejects.toMatchObject({ code: "RELOAD_FAILED" });
      expect(stops).toEqual(["gen0:general-1", "gen1:general-1"]);
      expect(teamLoadedEvents()).toHaveLength(0);
      expect(manager.agents("setup-assistant")).toHaveLength(1);
    });

    test("keeps the running team intact when the leader model no longer resolves", async () => {
      const stops: string[] = [];
      const factory = vi.fn((params: AgentBodyParams): AgentBody => ({
        identity: { teamId: params.teamId, role: params.soul.role, agentKey: params.agentKey, isLeader: params.isLeader, tools: [], subscribe: [], skills: [], model: null, ephemeral: false },
        restore: async () => [],
        messages: () => [],
        displayMessages: () => [],
        start: async () => {},
        compact: async () => {},
        stop: () => { stops.push(params.agentKey); },
      }));
      const manager = new TeamManagerImpl(new TeamRegistryImpl(homeJieDir, null, new AgentRegistryImpl(homeJieDir, null)), new AgentRegistryImpl(homeJieDir, null), eventManager, settingsStore, modelRegistry, transcriptStore, kanbanStore, skillManager, factory);
      await manager.load("setup-assistant");
      modelRegistry.resolve.mockReturnValue(undefined);
      await expect(manager.reload()).rejects.toMatchObject({ code: "RELOAD_FAILED" });
      expect(stops).toEqual([]);
      expect(manager.agents("setup-assistant")).toHaveLength(1);
    });

    test("rebuilds the remaining teams when one team fails to parse", async () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "alpha", "general");
      writeTeam(userTeams, "beta", "general");
      const created: string[] = [];
      const factory = vi.fn((params: AgentBodyParams): AgentBody => {
        created.push(`${params.teamId}:${params.agentKey}`);
        return {
          identity: { teamId: params.teamId, role: params.soul.role, agentKey: params.agentKey, isLeader: params.isLeader, tools: [], subscribe: [], skills: [], model: null, ephemeral: false },
          restore: async () => [],
          messages: () => [],
        displayMessages: () => [],
          start: async () => {},
          compact: async () => {},
          stop: () => {},
        };
      });
      const manager = new TeamManagerImpl(new TeamRegistryImpl(homeJieDir, null, new AgentRegistryImpl(homeJieDir, null)), new AgentRegistryImpl(homeJieDir, null), eventManager, settingsStore, modelRegistry, transcriptStore, kanbanStore, skillManager, factory);
      await manager.load("alpha");
      await manager.load("beta");
      created.length = 0;
      writeFileSync(join(userTeams, "beta", "TEAM.md"), "leader: [unclosed");
      await expect(manager.reload()).rejects.toMatchObject({ code: "RELOAD_FAILED" });
      expect(created).toEqual(["alpha:general-1"]);
      expect(manager.agents("alpha")).toHaveLength(1);
      expect(manager.agents("beta")).toHaveLength(1);
    });
  });

  describe("listInstalled / locate (registry pass-through)", () => {
    test("listInstalled always includes 'setup-assistant'", () => {
      const { manager } = makeManager(homeJieDir, null);
      expect(manager.listInstalled()).toContain("setup-assistant");
    });

    test("listInstalled includes user teams in addition to 'setup-assistant'", () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "alpha", "general");
      const { manager } = makeManager(homeJieDir, null);
      const installed = manager.listInstalled();
      expect(installed).toContain("setup-assistant");
      expect(installed).toContain("alpha");
    });

    test("locate returns 'builtin' for the setup-assistant team", () => {
      const { manager } = makeManager(homeJieDir, null);
      expect(manager.locate("setup-assistant")).toBe("builtin");
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

    test("getTeamDescription returns the TEAM.md description for an installed team", () => {
      const userTeams = join(homeJieDir, "teams");
      const teamDir = join(userTeams, "alpha");
      mkdirSync(teamDir, { recursive: true });
      writeFileSync(join(teamDir, "TEAM.md"), "---\nleader: general\ndescription: the alpha team\n---\n");
      writeFileSync(join(teamDir, "general.md"), "---\ntools:\n  - bash\n---\n");
      const { manager } = makeManager(homeJieDir, null);
      expect(manager.getTeamDescription("alpha")).toBe("the alpha team");
    });

    test("getTeamDescription returns undefined for a team without a description", () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "alpha", "general");
      const { manager } = makeManager(homeJieDir, null);
      expect(manager.getTeamDescription("alpha")).toBeUndefined();
    });

    test("agentCount counts the roles declared by an installed team", () => {
      const userTeams = join(homeJieDir, "teams");
      writeTeam(userTeams, "alpha", "general", ["qa"]);
      const { manager } = makeManager(homeJieDir, null);
      expect(manager.agentCount("alpha")).toBe(2);
    });

    test("agentCount is one for the builtin setup-assistant team", () => {
      const { manager } = makeManager(homeJieDir, null);
      expect(manager.agentCount("setup-assistant")).toBe(1);
    });

    test("agentCount includes shared agents from additional-agents", () => {
      const userTeams = join(homeJieDir, "teams");
      const teamDir = join(userTeams, "alpha");
      mkdirSync(teamDir, { recursive: true });
      writeFileSync(join(teamDir, "TEAM.md"), "---\nleader: general\nadditional-agents:\n  - explorer\n---\n");
      writeFileSync(join(teamDir, "general.md"), "---\ntools:\n  - bash\n---\n");
      writeAgent(homeJieDir, "explorer", "---\ntools:\n  - bash\n---\n");
      const { manager } = makeManager(homeJieDir, null);
      expect(manager.agentCount("alpha")).toBe(2);
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
      await manager.load("setup-assistant");
      await manager.load("alpha");
      const loaded = manager.listLoaded();
      expect(loaded.has("setup-assistant")).toBe(true);
      expect(loaded.has("alpha")).toBe(true);
      expect(loaded.get("setup-assistant")?.leaderKey).toBe("general-1");
    });
  });

  describe("agents", () => {
    test("returns the loaded team's identities", async () => {
      const { manager } = makeManager(homeJieDir, null);
      await manager.load("setup-assistant");
      const identities = manager.agents("setup-assistant");
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
      await manager.load("setup-assistant");
      expect(() => manager.stop()).not.toThrow();
    });
  });

  describe("renameSession", () => {
    test("renames the loaded team's active session via the transcript store", async () => {
      const { manager, agentBodyFactory } = makeManager(homeJieDir, null);
      await manager.load("setup-assistant");
      const sessionId = agentBodyFactory.mock.calls[0]![0]!.sessionId;
      manager.renameSession("setup-assistant", "my session");
      expect(transcriptStore.renameSession).toHaveBeenCalledWith(sessionId, "my session");
    });

    test("trims the name before persisting", async () => {
      const { manager } = makeManager(homeJieDir, null);
      await manager.load("setup-assistant");
      manager.renameSession("setup-assistant", "  padded  ");
      expect(transcriptStore.renameSession).toHaveBeenCalledWith(expect.anything(), "padded");
    });

    test("rejects an empty name without touching the transcript store", async () => {
      const { manager } = makeManager(homeJieDir, null);
      await manager.load("setup-assistant");
      expect(() => manager.renameSession("setup-assistant", "   ")).toThrow(/name must not be empty/);
      expect(transcriptStore.renameSession).not.toHaveBeenCalled();
    });

    test("throws when the team has no loaded session", () => {
      const { manager } = makeManager(homeJieDir, null);
      expect(() => manager.renameSession("ghost", "x")).toThrow(/no session loaded for team 'ghost'/);
      expect(transcriptStore.renameSession).not.toHaveBeenCalled();
    });
  });

  describe("sessionName exposure", () => {
    test("load reports a null session name before any rename", async () => {
      const { manager } = makeManager(homeJieDir, null);
      const info = await manager.load("setup-assistant");
      expect(transcriptStore.sessionName).toHaveBeenCalled();
      expect(info.sessionName).toBeNull();
    });

    test("listLoaded reports the renamed session's name", async () => {
      const { manager } = makeManager(homeJieDir, null);
      await manager.load("setup-assistant");
      transcriptStore.sessionName.mockReturnValue("my session");
      expect(manager.listLoaded().get("setup-assistant")?.sessionName).toBe("my session");
    });
  });

  describe("listSessions", () => {
    test("returns empty array for a team with no sessions", () => {
      const { manager } = makeManager(homeJieDir, null);
      expect(manager.listSessions("ghost-team")).toEqual([]);
      expect(transcriptStore.listSessions).toHaveBeenCalledWith("ghost-team");
    });

    test("delegates to transcriptStore scoped to the requested teamId", async () => {
      const sessions = [
        { sessionId: "session-A", messageCount: 3, lastActivity: "2026-07-13T10:00:00.000Z" },
        { sessionId: "session-B", messageCount: 7, lastActivity: "2026-07-13T11:00:00.000Z" },
      ];
      transcriptStore.listSessions.mockReturnValue(sessions);
      const { manager } = makeManager(homeJieDir, null);
      expect(manager.listSessions("setup-assistant")).toBe(sessions);
      expect(transcriptStore.listSessions).toHaveBeenCalledWith("setup-assistant");
    });
  });

  describe("compact", () => {
    test("delegates to the matching body and waits for it", async () => {
      const compact = vi.fn(async () => {});
      const { manager, agentBodyFactory } = makeManager(homeJieDir, null);
      agentBodyFactory.mockImplementation((params) => ({ ...makeFakeBody(params, []), compact }));
      await manager.load("setup-assistant");
      await manager.compact("setup-assistant", "general-1");
      expect(compact).toHaveBeenCalledTimes(1);
    });

    test("throws AGENT_NOT_FOUND when the agent is not in the loaded team", async () => {
      const { manager } = makeManager(homeJieDir, null);
      await manager.load("setup-assistant");
      await expect(manager.compact("setup-assistant", "ghost-1")).rejects.toMatchObject({ code: "AGENT_NOT_FOUND" });
    });

    test("throws NO_TEAM when no session is loaded for the team", async () => {
      const { manager } = makeManager(homeJieDir, null);
      await expect(manager.compact("setup-assistant", "general-1")).rejects.toMatchObject({ code: "NO_TEAM" });
    });
  });

  describe("replicas", () => {
    test("expands a role with replica: 2 into two bodies", async () => {
      const teamDir = join(homeJieDir, "teams", "dev");
      mkdirSync(teamDir, { recursive: true });
      writeFileSync(join(teamDir, "TEAM.md"), `---\nleader: leader\n---\n`);
      writeFileSync(join(teamDir, "leader.md"), `---\ntools:\n  - bash\n---\nleader`);
      writeFileSync(join(teamDir, "worker.md"), `---\ntools:\n  - bash\nreplica: 2\n---\nworker`);
      const { manager, agentBodyFactory } = makeManager(homeJieDir, null);
      const team = await manager.load("dev");
      expect(team.agents).toHaveLength(3);
      expect(agentBodyFactory).toHaveBeenCalledTimes(3);
      const keys = agentBodyFactory.mock.calls.map((call) => call[0]!.agentKey).sort();
      expect(keys).toEqual(["leader-1", "worker-1", "worker-2"]);
    });

    test("agentCount sums replicas", () => {
      const teamDir = join(homeJieDir, "teams", "dev");
      mkdirSync(teamDir, { recursive: true });
      writeFileSync(join(teamDir, "TEAM.md"), `---\nleader: leader\n---\n`);
      writeFileSync(join(teamDir, "leader.md"), `---\ntools:\n  - bash\n---\nleader`);
      writeFileSync(join(teamDir, "worker.md"), `---\ntools:\n  - bash\nreplica: 3\n---\nworker`);
      const { manager } = makeManager(homeJieDir, null);
      expect(manager.agentCount("dev")).toBe(4);
    });

    test("replicated role shares one soul", async () => {
      const teamDir = join(homeJieDir, "teams", "dev");
      mkdirSync(teamDir, { recursive: true });
      writeFileSync(join(teamDir, "TEAM.md"), `---\nleader: leader\n---\n`);
      writeFileSync(join(teamDir, "leader.md"), `---\ntools:\n  - bash\n---\nleader`);
      writeFileSync(join(teamDir, "worker.md"), `---\ntools:\n  - bash\nreplica: 2\n---\nworker`);
      const { manager, agentBodyFactory } = makeManager(homeJieDir, null);
      await manager.load("dev");
      const workerCalls = agentBodyFactory.mock.calls.filter((call) => call[0]!.soul.role === "worker");
      expect(workerCalls).toHaveLength(2);
      expect(workerCalls[0]![0]!.soul.replicas).toBe(2);
      expect(workerCalls[1]![0]!.soul.replicas).toBe(2);
    });
  });
});
