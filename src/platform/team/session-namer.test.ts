import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Api, Model } from "@earendil-works/pi-ai";
import { Events, type EventManager } from "../event";
import type { LlmService } from "../llm";
import type { ModelRegistry } from "../config";
import type { TranscriptStore } from "../storage";
import type { AgentHistory, AgentInfo, TeamInfo } from "../types";
import type { TeamManager } from "./team-manager";
import { SessionNamerImpl } from "./session-namer";

const DEMO_TEAM_ID = "demo";
const DEMO_SESSION_ID = "sess-01";
const DEMO_AGENT_KEY = "general-1";

function userMessage(text: string): AgentMessage {
  return { role: "user", content: [{ type: "text", text }], timestamp: 0 };
}

function assistantMessage(text: string): AgentMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    stopReason: "stop",
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    api: "openai-completions",
    provider: "openai",
    model: "gpt-4o",
    timestamp: 0,
  };
}

function model(provider: string, modelId: string): Model<Api> {
  return {
    id: modelId,
    name: modelId,
    api: "openai-completions",
    provider,
    baseUrl: "https://example.com",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 16384,
  };
}

function agentInfo(overrides: Partial<AgentInfo> & { agentKey: string }): AgentInfo {
  return {
    teamId: DEMO_TEAM_ID,
    role: "general",
    isLeader: overrides.isLeader ?? false,
    tools: [],
    subscribe: [],
    skills: [],
    model: overrides.model ?? null,
    sessionUsage: overrides.sessionUsage ?? null,
    ...overrides,
  };
}

function teamInfo(overrides: { history?: AgentHistory[]; agents?: AgentInfo[]; leaderKey?: string } = {}): TeamInfo {
  const leaderKey = overrides.leaderKey ?? DEMO_AGENT_KEY;
  return {
    id: DEMO_TEAM_ID,
    leaderKey,
    sessionName: null,
    currentSessionId: DEMO_SESSION_ID,
    agents: overrides.agents ?? [
      agentInfo({
        agentKey: DEMO_AGENT_KEY,
        isLeader: true,
        model: { provider: "openai", id: "gpt-4o", effort: "off", contextWindow: null },
      }),
    ],
    history: overrides.history ?? [{ agentKey: DEMO_AGENT_KEY, messages: [userMessage("hello"), assistantMessage("hi there")] }],
    kanbanCards: [],
  };
}

function makeTeamManager() {
  return vi.mocked<TeamManager>({
    load: vi.fn(),
    reload: vi.fn(),
    resumeSession: vi.fn(),
    listInstalled: vi.fn(),
    agentCount: vi.fn(),
    getTeamDescription: vi.fn(),
    listLoaded: vi.fn(() => new Map()),
    locate: vi.fn(),
    agents: vi.fn(),
    bodies: vi.fn(),
    listSessions: vi.fn(),
    renameSession: vi.fn(),
    currentSessionId: vi.fn(() => DEMO_SESSION_ID),
    compact: vi.fn(),
    stop: vi.fn(),
    spawnAdHoc: vi.fn(),
    resetAgent: vi.fn(),
  });
}

function makeSessionNamer() {
  const eventManager = vi.mocked<EventManager>({
    publish: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  });
  const llmService = vi.mocked<LlmService>({
    complete: vi.fn(),
  });
  const teamManager = makeTeamManager();
  const transcriptStore = vi.mocked<TranscriptStore>({
    persist: vi.fn(),
    compact: vi.fn(),
    restore: vi.fn(),
    restoreDisplay: vi.fn(async () => []),
    hasSession: vi.fn(),
    listSessions: vi.fn(),
    listAgentKeys: vi.fn(),
    remove: vi.fn(),
    sessionName: vi.fn(() => null),
    renameSession: vi.fn(),
  });
  const modelRegistry = vi.mocked<ModelRegistry>({
    providers: vi.fn(),
    listProviders: vi.fn(),
    resolve: vi.fn(),
    listModels: vi.fn(),
    getAuth: vi.fn(() => Promise.resolve(undefined)),
    reload: vi.fn(),
  });
  const namer = new SessionNamerImpl(eventManager, llmService, teamManager, transcriptStore, modelRegistry);
  return { namer, eventManager, llmService, teamManager, transcriptStore, modelRegistry };
}

function idleEvent(stopReason: "stop" | "aborted") {
  return Events.agentIdle({ kind: "agent", teamId: DEMO_TEAM_ID, agentKey: DEMO_AGENT_KEY }, stopReason);
}

describe("SessionNamerImpl", () => {
  test("subscribes to agent.idle on start", () => {
    const { eventManager } = makeSessionNamer();
    expect(eventManager.subscribe).toHaveBeenCalledWith("agent.idle", expect.any(Function));
  });

  test("does nothing when the stop reason is not a completion", async () => {
    const { namer, llmService } = makeSessionNamer();
    await namer.onAgentIdle(idleEvent("aborted"));
    expect(llmService.complete).not.toHaveBeenCalled();
  });

  test("does nothing when the session already has a name", async () => {
    const { namer, llmService, transcriptStore } = makeSessionNamer();
    transcriptStore.sessionName.mockReturnValue("existing");
    await namer.onAgentIdle(idleEvent("stop"));
    expect(llmService.complete).not.toHaveBeenCalled();
  });

  test("does nothing when no team is loaded", async () => {
    const { namer, llmService, teamManager } = makeSessionNamer();
    teamManager.listLoaded.mockReturnValue(new Map());
    await namer.onAgentIdle(idleEvent("stop"));
    expect(llmService.complete).not.toHaveBeenCalled();
  });

  test("does nothing when the agent has no user or assistant messages", async () => {
    const { namer, llmService, teamManager } = makeSessionNamer();
    teamManager.listLoaded.mockReturnValue(
      new Map([[DEMO_TEAM_ID, teamInfo({ history: [{ agentKey: DEMO_AGENT_KEY, messages: [] }] })]]),
    );
    await namer.onAgentIdle(idleEvent("stop"));
    expect(llmService.complete).not.toHaveBeenCalled();
  });

  test("does nothing when the model cannot be resolved", async () => {
    const { namer, llmService, teamManager, modelRegistry } = makeSessionNamer();
    teamManager.listLoaded.mockReturnValue(new Map([[DEMO_TEAM_ID, teamInfo()]]));
    modelRegistry.resolve.mockReturnValue(undefined);
    await namer.onAgentIdle(idleEvent("stop"));
    expect(llmService.complete).not.toHaveBeenCalled();
  });

  test("generates a session name from the first user and assistant messages", async () => {
    const { namer, eventManager, llmService, teamManager, transcriptStore, modelRegistry } = makeSessionNamer();
    teamManager.listLoaded.mockReturnValue(new Map([[DEMO_TEAM_ID, teamInfo()]]));
    modelRegistry.resolve.mockReturnValue(model("openai", "gpt-4o"));
    llmService.complete.mockResolvedValue("code review");

    await namer.onAgentIdle(idleEvent("stop"));

    expect(llmService.complete).toHaveBeenCalledTimes(1);
    const prompt = llmService.complete.mock.calls[0]![0].prompt;
    expect(prompt).toContain("User: hello");
    expect(prompt).toContain("Assistant: hi there");
    expect(teamManager.renameSession).toHaveBeenCalledWith(DEMO_TEAM_ID, "code review");
    expect(eventManager.publish).toHaveBeenCalledWith(Events.sessionRenamed({ kind: "system" }, DEMO_TEAM_ID, "code review"));
    expect(transcriptStore.sessionName).toHaveBeenCalledWith(DEMO_SESSION_ID);
  });

  test("cleans and truncates the generated name", async () => {
    const { namer, teamManager, llmService, modelRegistry } = makeSessionNamer();
    teamManager.listLoaded.mockReturnValue(new Map([[DEMO_TEAM_ID, teamInfo()]]));
    modelRegistry.resolve.mockReturnValue(model("openai", "gpt-4o"));
    const longPunctuated = "  \"a very long session title that exceeds the max length\" ";
    llmService.complete.mockResolvedValue(longPunctuated);

    await namer.onAgentIdle(idleEvent("stop"));

    expect(teamManager.renameSession).toHaveBeenCalledWith(DEMO_TEAM_ID, "a very long session title tha…");
  });

  test("does not overwrite a name set during generation", async () => {
    const { namer, teamManager, llmService, modelRegistry, transcriptStore } = makeSessionNamer();
    teamManager.listLoaded.mockReturnValue(new Map([[DEMO_TEAM_ID, teamInfo()]]));
    modelRegistry.resolve.mockReturnValue(model("openai", "gpt-4o"));
    llmService.complete.mockImplementation(async () => {
      transcriptStore.sessionName.mockReturnValue("renamed by user");
      return "new name";
    });

    await namer.onAgentIdle(idleEvent("stop"));

    expect(teamManager.renameSession).not.toHaveBeenCalled();
  });

  test("publishes a system error when the llm call fails", async () => {
    const { namer, eventManager, llmService, teamManager, modelRegistry } = makeSessionNamer();
    teamManager.listLoaded.mockReturnValue(new Map([[DEMO_TEAM_ID, teamInfo()]]));
    modelRegistry.resolve.mockReturnValue(model("openai", "gpt-4o"));
    llmService.complete.mockRejectedValue(new Error("llm down"));

    await namer.onAgentIdle(idleEvent("stop"));

    expect(eventManager.publish).toHaveBeenCalledWith(Events.systemError({ kind: "system" }, "session naming failed: llm down"));
    expect(teamManager.renameSession).not.toHaveBeenCalled();
  });

  test("does not start a second naming for the same session while one is pending", async () => {
    const { namer, llmService, teamManager, modelRegistry } = makeSessionNamer();
    teamManager.listLoaded.mockReturnValue(new Map([[DEMO_TEAM_ID, teamInfo()]]));
    modelRegistry.resolve.mockReturnValue(model("openai", "gpt-4o"));
    const deferred = vi.fn<() => Promise<string>>(() => new Promise(() => {}));
    llmService.complete.mockImplementation(deferred);

    void namer.onAgentIdle(idleEvent("stop"));
    await namer.onAgentIdle(idleEvent("stop"));

    expect(llmService.complete).toHaveBeenCalledTimes(1);
  });

  test("uses the leader's history when the triggering agent is not in the snapshot", async () => {
    const { namer, llmService, teamManager, modelRegistry } = makeSessionNamer();
    teamManager.listLoaded.mockReturnValue(
      new Map([
        [
          DEMO_TEAM_ID,
          teamInfo({
            history: [{ agentKey: DEMO_AGENT_KEY, messages: [userMessage("hello"), assistantMessage("hi there")] }],
          }),
        ],
      ]),
    );
    modelRegistry.resolve.mockReturnValue(model("openai", "gpt-4o"));
    llmService.complete.mockResolvedValue("greeting");

    await namer.onAgentIdle(Events.agentIdle({ kind: "agent", teamId: DEMO_TEAM_ID, agentKey: "other" }, "stop"));

    expect(llmService.complete).toHaveBeenCalledTimes(1);
    expect(teamManager.renameSession).toHaveBeenCalledWith(DEMO_TEAM_ID, "greeting");
  });

  test("uses the triggering agent's model when available", async () => {
    const { namer, llmService, teamManager, modelRegistry } = makeSessionNamer();
    teamManager.listLoaded.mockReturnValue(
      new Map([
        [
          DEMO_TEAM_ID,
          teamInfo({
            agents: [
              agentInfo({ agentKey: DEMO_AGENT_KEY, isLeader: true, model: { provider: "openai", id: "gpt-4o", effort: "off", contextWindow: null } }),
              agentInfo({ agentKey: "other", model: { provider: "anthropic", id: "claude", effort: "off", contextWindow: null } }),
            ],
            history: [
              { agentKey: "other", messages: [userMessage("hello"), assistantMessage("hi there")] },
            ],
          }),
        ],
      ]),
    );
    modelRegistry.resolve.mockImplementation((provider) => model(provider, provider === "anthropic" ? "claude" : "gpt-4o"));
    llmService.complete.mockResolvedValue("other model name");

    await namer.onAgentIdle(Events.agentIdle({ kind: "agent", teamId: DEMO_TEAM_ID, agentKey: "other" }, "stop"));

    expect(modelRegistry.resolve).toHaveBeenCalledWith("anthropic", "claude");
    expect(llmService.complete).toHaveBeenCalledTimes(1);
  });
});
