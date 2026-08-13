import type { AgentBody } from "../core";
import type { EventEnvelope, EventManager, EventType } from "../event";
import { Events } from "../event";
import type { AgentRegistry } from "./agent-registry";
import { AgentDispatcherImpl } from "./agent-dispatcher";
import type { TeamManager } from "./team-manager";
import type { TeamRegistry } from "./registry";
import type { AgentInfo, CallAgentRequest } from "../types";
import type { TeamBlueprint } from "./types";

function makeBlueprint(overrides: Partial<TeamBlueprint> = {}): TeamBlueprint {
  return {
    id: "t1",
    roles: [],
    leaderRole: null,
    additionalAgentRefs: [],
    teamPrompt: "",
    ...overrides,
  };
}

function makeFakeBody(identity: AgentInfo): AgentBody {
  return {
    identity,
    restore: async () => [],
    messages: () => [],
    start: async () => {},
    compact: async () => {},
    stop: () => {},
  };
}

interface Harness {
  eventManager: ReturnType<typeof vi.mocked<EventManager>>;
  teamManager: ReturnType<typeof vi.mocked<TeamManager>>;
  teamRegistry: ReturnType<typeof vi.mocked<TeamRegistry>>;
  agentRegistry: ReturnType<typeof vi.mocked<AgentRegistry>>;
  dispatcher: AgentDispatcherImpl;
}

function makeTeamManager(): ReturnType<typeof vi.mocked<TeamManager>> {
  return vi.mocked<TeamManager>({
    load: vi.fn(),
    reload: vi.fn(),
    resumeSession: vi.fn(),
    listInstalled: vi.fn(() => []),
    agentCount: vi.fn(() => 0),
    getTeamDescription: vi.fn(() => undefined),
    listLoaded: vi.fn(() => new Map()),
    locate: vi.fn(() => null),
    agents: vi.fn(() => []),
    bodies: vi.fn(() => []),
    listSessions: vi.fn(() => []),
    renameSession: vi.fn(),
    currentSessionId: vi.fn(() => null),
    compact: vi.fn(),
    stop: vi.fn(),
    spawnAdHoc: vi.fn(),
    resetAgent: vi.fn(),
  });
}

function makeHarness(): Harness {
  const subscribers = new Map<string, Array<(env: EventEnvelope<EventType>) => void>>();
  const publish = vi.fn((env: EventEnvelope<EventType>) => {
    for (const callback of subscribers.get(env.topic) ?? []) callback(env);
  });
  const subscribe = vi.fn((topic: string, callback: (env: EventEnvelope<EventType>) => void) => {
    const list = subscribers.get(topic) ?? [];
    list.push(callback);
    subscribers.set(topic, list);
    return () => {
      subscribers.set(topic, list.filter((cb) => cb !== callback));
    };
  });
  const eventManager = vi.mocked<EventManager>({ publish, subscribe });

  const teamManager = makeTeamManager();

  const teamRegistry = vi.mocked<TeamRegistry>({
    parseTeamManifest: vi.fn(() => makeBlueprint()),
    listInstalled: vi.fn(() => []),
    locate: vi.fn(() => null),
  });

  const agentRegistry = vi.mocked<AgentRegistry>({
    resolve: vi.fn(),
    listInstalled: vi.fn(() => []),
    locate: vi.fn(() => null),
  });

  const dispatcher = new AgentDispatcherImpl(teamManager, eventManager, teamRegistry, agentRegistry);
  return { eventManager, teamManager, teamRegistry, agentRegistry, dispatcher };
}

function makeRequest(overrides: Partial<CallAgentRequest> = {}): CallAgentRequest {
  return {
    teamId: "t1",
    sessionId: "sess-1",
    callerAgentKey: "leader-1",
    agent: "reviewer-1",
    prompt: "review this",
    ...overrides,
  };
}

function publishedEvents(eventManager: ReturnType<typeof vi.mocked<EventManager>>): EventEnvelope<EventType>[] {
  return eventManager.publish.mock.calls.map((call) => call[0]);
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("AgentDispatcherImpl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("resolves an exact loaded agent key and dispatches immediately", async () => {
    const h = makeHarness();
    const reviewer = makeFakeBody({
      teamId: "t1",
      role: "reviewer",
      agentKey: "reviewer-1",
      isLeader: false,
      tools: ["notify"],
      subscribe: [],
      skills: [],
      model: null,
      ephemeral: false,
    });
    h.teamManager.bodies.mockReturnValue([reviewer]);

    const ticket = h.dispatcher.call(makeRequest());

    expect(ticket.agentKey).toBe("reviewer-1");
    expect(ticket.queued).toBe(false);
    expect(ticket.callbackTopic).toBe("callback.leader-1");
    await flush();
    const customs = publishedEvents(h.eventManager).filter((e) => e.topic.startsWith("custom."));
    expect(customs).toHaveLength(1);
    expect(customs[0]!.topic).toBe("custom.t1.inbox.reviewer-1");
  });

  test("resolves a role to a replica and returns the selected key", () => {
    const h = makeHarness();
    const r1 = makeFakeBody({
      teamId: "t1", role: "reviewer", agentKey: "reviewer-1", isLeader: false, tools: ["notify"], subscribe: [], skills: [], model: null, ephemeral: false,
    });
    const r2 = makeFakeBody({
      teamId: "t1", role: "reviewer", agentKey: "reviewer-2", isLeader: false, tools: ["notify"], subscribe: [], skills: [], model: null, ephemeral: false,
    });
    h.teamManager.bodies.mockReturnValue([r1, r2]);
    h.teamRegistry.parseTeamManifest.mockReturnValue(makeBlueprint({
      roles: [{ role: "reviewer", systemPrompt: "", tools: ["notify"], subscribe: [], skills: [], replicas: 2, model: "m" }],
      leaderRole: "reviewer",
    }));

    const ticket = h.dispatcher.call(makeRequest({ agent: "reviewer" }));

    expect(["reviewer-1", "reviewer-2"]).toContain(ticket.agentKey);
    expect(ticket.callbackTopic).toBe("callback.leader-1");
  });

  test("selects the idle replica over a running replica", () => {
    const h = makeHarness();
    const r1 = makeFakeBody({
      teamId: "t1", role: "worker", agentKey: "worker-1", isLeader: false, tools: ["notify"], subscribe: [], skills: [], model: null, ephemeral: false,
    });
    const r2 = makeFakeBody({
      teamId: "t1", role: "worker", agentKey: "worker-2", isLeader: false, tools: ["notify"], subscribe: [], skills: [], model: null, ephemeral: false,
    });
    h.teamManager.bodies.mockReturnValue([r1, r2]);
    h.teamRegistry.parseTeamManifest.mockReturnValue(makeBlueprint({
      roles: [{ role: "worker", systemPrompt: "", tools: ["notify"], subscribe: [], skills: [], replicas: 2, model: "m" }],
      leaderRole: "worker",
    }));
    h.eventManager.publish(Events.agentTurnStart({ kind: "agent", teamId: "t1", agentKey: "worker-2" }, "test"));

    const ticket = h.dispatcher.call(makeRequest({ agent: "worker" }));

    expect(ticket.agentKey).toBe("worker-1");
    expect(ticket.queued).toBe(false);
  });

  test("selects the replica with the shorter queue when all are busy", async () => {
    const h = makeHarness();
    const r1 = makeFakeBody({
      teamId: "t1", role: "worker", agentKey: "worker-1", isLeader: false, tools: ["notify"], subscribe: [], skills: [], model: null, ephemeral: false,
    });
    const r2 = makeFakeBody({
      teamId: "t1", role: "worker", agentKey: "worker-2", isLeader: false, tools: ["notify"], subscribe: [], skills: [], model: null, ephemeral: false,
    });
    h.teamManager.bodies.mockReturnValue([r1, r2]);
    h.teamRegistry.parseTeamManifest.mockReturnValue(makeBlueprint({
      roles: [{ role: "worker", systemPrompt: "", tools: ["notify"], subscribe: [], skills: [], replicas: 2, model: "m" }],
      leaderRole: "worker",
    }));
    h.eventManager.publish(Events.agentTurnStart({ kind: "agent", teamId: "t1", agentKey: "worker-1" }, "test"));
    h.eventManager.publish(Events.agentTurnStart({ kind: "agent", teamId: "t1", agentKey: "worker-2" }, "test"));

    const first = h.dispatcher.call(makeRequest({ agent: "worker", prompt: "first" }));
    const second = h.dispatcher.call(makeRequest({ agent: "worker", prompt: "second" }));

    expect(first.agentKey).toBe("worker-1");
    expect(first.queued).toBe(true);
    expect(second.agentKey).toBe("worker-2");
    expect(second.queued).toBe(true);

    h.eventManager.publish(Events.agentIdle({ kind: "agent", teamId: "t1", agentKey: "worker-2" }, "stop"));
    await flush();

    const customs = publishedEvents(h.eventManager).filter((e) => e.topic === "custom.t1.inbox.worker-2");
    expect(customs).toHaveLength(1);
    expect((customs[0]!.payload as { message: string }).message).toContain("second");
  });

  test("spawns an ad-hoc shared agent when agent is not loaded but is installed", async () => {
    const h = makeHarness();
    const explorer = makeFakeBody({
      teamId: "t1", role: "explorer", agentKey: "explorer", isLeader: false, tools: ["notify"], subscribe: [], skills: [], model: null, ephemeral: true,
    });
    h.teamManager.bodies.mockReturnValue([]);
    h.teamRegistry.parseTeamManifest.mockReturnValue(makeBlueprint());
    h.agentRegistry.locate.mockReturnValue("project");
    h.teamManager.spawnAdHoc.mockResolvedValue(explorer);

    const ticket = h.dispatcher.call(makeRequest({ agent: "explorer" }));

    expect(ticket.agentKey).toBe("explorer");
    await flush();
    expect(h.teamManager.spawnAdHoc).toHaveBeenCalledWith("t1", "explorer");
  });

  test("rejects an unknown agent", () => {
    const h = makeHarness();
    h.teamManager.bodies.mockReturnValue([]);
    h.teamRegistry.parseTeamManifest.mockReturnValue(makeBlueprint());
    h.agentRegistry.locate.mockReturnValue(null);

    expect(() => h.dispatcher.call(makeRequest({ agent: "ghost" }))).toThrow(
      expect.objectContaining({ code: "AGENT_NOT_FOUND" }),
    );
  });

  test("rejects self-calls", () => {
    const h = makeHarness();
    const body = makeFakeBody({
      teamId: "t1", role: "leader", agentKey: "leader-1", isLeader: true, tools: ["notify"], subscribe: [], skills: [], model: null, ephemeral: false,
    });
    h.teamManager.bodies.mockReturnValue([body]);

    expect(() => h.dispatcher.call(makeRequest({ agent: "leader-1" }))).toThrow(
      expect.objectContaining({ code: "CALL_AGENT_SELF" }),
    );
  });

  test("queues when the target is busy and dispatches after idle", async () => {
    const h = makeHarness();
    const reviewer = makeFakeBody({
      teamId: "t1", role: "reviewer", agentKey: "reviewer-1", isLeader: false, tools: ["notify"], subscribe: [], skills: [], model: null, ephemeral: false,
    });
    h.teamManager.bodies.mockReturnValue([reviewer]);

    const first = h.dispatcher.call(makeRequest());
    expect(first.queued).toBe(false);
    await flush();

    const second = h.dispatcher.call(makeRequest({ prompt: "second" }));
    expect(second.queued).toBe(true);

    h.eventManager.publish(Events.agentIdle({ kind: "agent", teamId: "t1", agentKey: "reviewer-1" }, "stop"));
    await flush();

    const customs = publishedEvents(h.eventManager).filter((e) => e.topic === "custom.t1.inbox.reviewer-1");
    expect(customs).toHaveLength(2);
  });

  test("publishes a failure when the target ends without notifying", async () => {
    const h = makeHarness();
    const reviewer = makeFakeBody({
      teamId: "t1", role: "reviewer", agentKey: "reviewer-1", isLeader: false, tools: ["notify"], subscribe: [], skills: [], model: null, ephemeral: false,
    });
    h.teamManager.bodies.mockReturnValue([reviewer]);

    h.dispatcher.call(makeRequest());
    await flush();

    h.eventManager.publish(Events.agentIdle({ kind: "agent", teamId: "t1", agentKey: "reviewer-1" }, "stop"));
    await flush();

    const customs = publishedEvents(h.eventManager).filter((e) => e.topic === "custom.t1.callback.leader-1");
    expect(customs).toHaveLength(1);
    expect((customs[0]!.payload as { message: string }).message).toContain("ended without a result");
  });

  test("does not publish failure when the target has already notified", async () => {
    const h = makeHarness();
    const reviewer = makeFakeBody({
      teamId: "t1", role: "reviewer", agentKey: "reviewer-1", isLeader: false, tools: ["notify"], subscribe: [], skills: [], model: null, ephemeral: false,
    });
    h.teamManager.bodies.mockReturnValue([reviewer]);

    h.dispatcher.call(makeRequest());
    await flush();

    h.eventManager.publish(Events.agentToolResult(
      { kind: "agent", teamId: "t1", agentKey: "reviewer-1" },
      "tc-1",
      "notify",
      "ok",
      0,
      null,
      { topic: "callback.leader-1" },
    ));
    h.eventManager.publish(Events.agentIdle({ kind: "agent", teamId: "t1", agentKey: "reviewer-1" }, "stop"));
    await flush();

    const customs = publishedEvents(h.eventManager).filter((e) => e.topic === "custom.t1.callback.leader-1");
    expect(customs).toHaveLength(0);
  });

  test("resets the target before dispatch when requested", async () => {
    const h = makeHarness();
    const reviewer = makeFakeBody({
      teamId: "t1", role: "reviewer", agentKey: "reviewer-1", isLeader: false, tools: ["notify"], subscribe: [], skills: [], model: null, ephemeral: false,
    });
    h.teamManager.bodies.mockReturnValue([reviewer]);
    h.teamManager.resetAgent.mockResolvedValue(reviewer);

    h.dispatcher.call(makeRequest({ reset: true }));
    await flush();

    expect(h.teamManager.resetAgent).toHaveBeenCalledWith("t1", "reviewer-1");
  });

  test("publishes a failure when the target lacks the notify tool", async () => {
    const h = makeHarness();
    const reviewer = makeFakeBody({
      teamId: "t1", role: "reviewer", agentKey: "reviewer-1", isLeader: false, tools: ["read_file"], subscribe: [], skills: [], model: null, ephemeral: false,
    });
    h.teamManager.bodies.mockReturnValue([reviewer]);

    h.dispatcher.call(makeRequest());
    await flush();

    const customs = publishedEvents(h.eventManager).filter((e) => e.topic === "custom.t1.callback.leader-1");
    expect(customs).toHaveLength(1);
    expect((customs[0]!.payload as { message: string }).message).toContain("does not have the notify tool");
  });

  test("publishes a failure when reset fails", async () => {
    const h = makeHarness();
    const reviewer = makeFakeBody({
      teamId: "t1", role: "reviewer", agentKey: "reviewer-1", isLeader: false, tools: ["notify"], subscribe: [], skills: [], model: null, ephemeral: false,
    });
    h.teamManager.bodies.mockReturnValue([reviewer]);
    h.teamManager.resetAgent.mockRejectedValue(new Error("reset failed"));

    h.dispatcher.call(makeRequest({ reset: true }));
    await flush();

    const customs = publishedEvents(h.eventManager).filter((e) => e.topic === "custom.t1.callback.leader-1");
    expect(customs).toHaveLength(1);
    expect((customs[0]!.payload as { message: string }).message).toContain("reset failed");
  });

  test("fails all queued calls when ad-hoc spawn fails", async () => {
    const h = makeHarness();
    h.teamManager.bodies.mockReturnValue([]);
    h.teamRegistry.parseTeamManifest.mockReturnValue(makeBlueprint());
    h.agentRegistry.locate.mockReturnValue("project");
    h.teamManager.spawnAdHoc.mockRejectedValue(new Error("spawn failed"));

    const first = h.dispatcher.call(makeRequest({ prompt: "first" }));
    const second = h.dispatcher.call(makeRequest({ prompt: "second" }));

    expect(first.queued).toBe(true);
    expect(second.queued).toBe(true);

    await flush();

    const customs = publishedEvents(h.eventManager).filter((e) => e.topic === "custom.t1.callback.leader-1");
    expect(customs).toHaveLength(2);
    expect((customs[0]!.payload as { message: string }).message).toContain("spawn failed");
    expect((customs[1]!.payload as { message: string }).message).toContain("spawn failed");
  });

  test("publishes a failure when event publish fails during dispatch", async () => {
    const h = makeHarness();
    const reviewer = makeFakeBody({
      teamId: "t1", role: "reviewer", agentKey: "reviewer-1", isLeader: false, tools: ["notify"], subscribe: [], skills: [], model: null, ephemeral: false,
    });
    h.teamManager.bodies.mockReturnValue([reviewer]);
    h.eventManager.publish.mockImplementationOnce(() => {
      throw new Error("publish failed");
    });

    h.dispatcher.call(makeRequest());
    await flush();

    const customs = publishedEvents(h.eventManager).filter((e) => e.topic === "custom.t1.callback.leader-1");
    expect(customs).toHaveLength(1);
    expect((customs[0]!.payload as { message: string }).message).toContain("publish failed");
  });
});
