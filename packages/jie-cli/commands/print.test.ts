import { runPrint } from "./print";

interface JiePlatformStub {
  events: {
    subscribe: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
  };
  stop: ReturnType<typeof vi.fn>;
}

type AgentEnvelope = {
  sender: { kind: string; identity?: { teamId?: string; agentRole?: string; agentKey?: string } };
  payload: Record<string, unknown>;
};
type Handler = (env: AgentEnvelope) => void;

function makeHandle(): { handle: JiePlatformStub; events: JiePlatformStub["events"] } {
  const events = {
    subscribe: vi.fn(),
    publish: vi.fn(),
  };
  const handle: JiePlatformStub = {
    events,
    stop: vi.fn().mockResolvedValue(undefined),
  };
  return { handle, events };
}

function captureHandlers(events: JiePlatformStub["events"]): Map<string, Handler> {
  const handlers = new Map<string, Handler>();
  events.subscribe.mockImplementation((topic: string, cb: Handler) => {
    handlers.set(topic, cb);
    return () => {};
  });
  return handlers;
}

describe("runPrint", () => {
  test("happy path: subscribes to agent.stream.chunk, publishes leader.prompt, waits for agent.idle, then stop()s", async () => {
    const { handle, events } = makeHandle();
    const teamId = "t1";
    const leaderRole = "general";
    const leaderKey = "general-1";
    const handlers = captureHandlers(events);

    setImmediate(() => {
      handlers.get("agent.turn.start")?.({
        sender: { kind: "agent", identity: { teamId, agentRole: leaderRole, agentKey: leaderKey } },
        payload: {},
      });
      handlers.get("agent.idle")?.({
        sender: { kind: "agent", identity: { teamId, agentRole: leaderRole, agentKey: leaderKey } },
        payload: {},
      });
    });

    const code = await runPrint(
      handle as never,
      teamId,
      leaderRole,
      leaderKey,
      [leaderKey],
      { kind: "print", instruction: "hi", team: undefined, timeout: 30, json: false, apiKey: undefined, resume: undefined, continueLast: false },
    );
    expect(code).toBe(0);
    expect(events.subscribe).toHaveBeenCalledWith("agent.stream.chunk", expect.any(Function));
    expect(events.subscribe).toHaveBeenCalledWith("agent.turn.start", expect.any(Function));
    expect(events.subscribe).toHaveBeenCalledWith("agent.idle", expect.any(Function));
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: "user.prompt",
        payload: expect.objectContaining({ teamId: "t1", agentKey: "general-1", prompt: "hi" }),
        sender: expect.objectContaining({ kind: "user" }),
      }),
    );
    expect(handle.stop).toHaveBeenCalled();
  });

  test("timeout: returns 3 and stops the handle", async () => {
    const { handle, events } = makeHandle();
    events.subscribe.mockReturnValue(() => {});

    const code = await runPrint(
      handle as never,
      "t1",
      "general",
      "general-1",
      ["general-1"],
      { kind: "print", instruction: "hi", team: undefined, timeout: 0.05, json: false, apiKey: undefined, resume: undefined, continueLast: false },
    );
    expect(code).toBe(3);
    expect(handle.stop).toHaveBeenCalled();
  });

  test("worker busy while leader idles: gate does NOT open until worker idles", async () => {
    const { handle, events } = makeHandle();
    const teamId = "t1";
    const leaderKey = "general-1";
    const workerKey = "worker-1";
    const handlers = captureHandlers(events);

    setImmediate(() => {
      handlers.get("agent.turn.start")?.({
        sender: { kind: "agent", identity: { teamId, agentRole: "general", agentKey: leaderKey } },
        payload: {},
      });
      handlers.get("agent.turn.start")?.({
        sender: { kind: "agent", identity: { teamId, agentRole: "worker", agentKey: workerKey } },
        payload: {},
      });
      setTimeout(() => {
        handlers.get("agent.idle")?.({
          sender: { kind: "agent", identity: { teamId, agentRole: "general", agentKey: leaderKey } },
          payload: {},
        });
      }, 10);
      setTimeout(() => {
        handlers.get("agent.idle")?.({
          sender: { kind: "agent", identity: { teamId, agentRole: "worker", agentKey: workerKey } },
          payload: {},
        });
      }, 30);
    });

    const start = Date.now();
    const code = await runPrint(
      handle as never,
      teamId,
      "general",
      leaderKey,
      [leaderKey, workerKey],
      { kind: "print", instruction: "hi", team: undefined, timeout: 2, json: false, apiKey: undefined, resume: undefined, continueLast: false },
    );
    const elapsed = Date.now() - start;
    expect(code).toBe(0);
    expect(elapsed).toBeGreaterThanOrEqual(25);
  });

  test("agents unknown to the gate are ignored: a stray worker-idle does not resolve early", async () => {
    const { handle, events } = makeHandle();
    const teamId = "t1";
    const leaderKey = "general-1";
    const handlers = captureHandlers(events);

    setImmediate(() => {
      handlers.get("agent.turn.start")?.({
        sender: { kind: "agent", identity: { teamId, agentRole: "general", agentKey: leaderKey } },
        payload: {},
      });
      setTimeout(() => {
        handlers.get("agent.idle")?.({
          sender: { kind: "agent", identity: { teamId, agentRole: "ghost", agentKey: "ghost-1" } },
          payload: {},
        });
      }, 5);
      setTimeout(() => {
        handlers.get("agent.idle")?.({
          sender: { kind: "agent", identity: { teamId, agentRole: "general", agentKey: leaderKey } },
          payload: {},
        });
      }, 30);
    });

    const start = Date.now();
    const code = await runPrint(
      handle as never,
      teamId,
      "general",
      leaderKey,
      [leaderKey],
      { kind: "print", instruction: "hi", team: undefined, timeout: 2, json: false, apiKey: undefined, resume: undefined, continueLast: false },
    );
    const elapsed = Date.now() - start;
    expect(code).toBe(0);
    expect(elapsed).toBeGreaterThanOrEqual(25);
  });
});
