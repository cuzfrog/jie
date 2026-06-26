import { describe, expect, test, vi } from "bun:test";
import { runPrint } from "./print.ts";

interface JiePlatformStub {
  events: {
    subscribe: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
  };
  stop: ReturnType<typeof vi.fn>;
}

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

describe("runPrint", () => {
  test("happy path: subscribes to agent.stream.chunk, publishes leader.prompt, waits for agent.idle, then stop()s", async () => {
    const { handle, events } = makeHandle();
    const teamId = "t1";
    const leaderRole = "general";
    const leaderKey = "general-1";

    const handlers = new Map<string, (env: { sender: { kind: string; identity?: { teamId?: string; agentRole?: string } }; payload: { prompt?: string; text?: string } }) => void>();
    events.subscribe.mockImplementation(
      (topic: string, callback: (env: { sender: { kind: string; identity?: { teamId?: string; agentRole?: string } }; payload: { prompt?: string; text?: string } }) => void) => {
        handlers.set(topic, callback);
        return () => {};
      },
    );
    setImmediate(() => {
      handlers.get("agent.turn.start")?.({
        sender: { kind: "agent", identity: { teamId: teamId, agentRole: leaderRole, agentKey: leaderKey } },
        payload: {},
      });
      handlers.get("agent.idle")?.({
        sender: { kind: "agent", identity: { teamId: teamId, agentRole: leaderRole, agentKey: leaderKey } },
        payload: {},
      });
    });

    const code = await runPrint(
      handle as never,
      teamId,
      leaderRole,
      leaderKey,
      { kind: "print", instruction: "hi", team: undefined, timeout: 30, json: false, apiKey: undefined, resume: undefined, continueLast: false },
    );
    expect(code).toBe(0);
    expect(events.subscribe).toHaveBeenCalledWith("agent.stream.chunk", expect.any(Function));
    expect(events.subscribe).toHaveBeenCalledWith("agent.turn.start", expect.any(Function));
    expect(events.subscribe).toHaveBeenCalledWith("agent.idle", expect.any(Function));
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: "team.t1.agent.general-1.prompt",
        payload: expect.objectContaining({ teamId: "t1", agentKey: "general-1", prompt: "hi" }),
        sender: expect.objectContaining({ kind: "cli" }),
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
      { kind: "print", instruction: "hi", team: undefined, timeout: 0.05, json: false, apiKey: undefined, resume: undefined, continueLast: false },
    );
    expect(code).toBe(3);
    expect(handle.stop).toHaveBeenCalled();
  });

  test("worker idle does not resolve the leader gate", async () => {
    const { handle, events } = makeHandle();
    const teamId = "t1";
    const leaderKey = "general-1";
    const workerKey = "worker-1";

    const handlers = new Map<string, (env: { sender: { kind: string; identity?: { teamId?: string; agentRole?: string; agentKey?: string } }; payload: Record<string, unknown> }) => void>();
    events.subscribe.mockImplementation(
      (topic: string, callback: (env: { sender: { kind: string; identity?: { teamId?: string; agentRole?: string; agentKey?: string } }; payload: Record<string, unknown> }) => void) => {
        handlers.set(topic, callback);
        return () => {};
      },
    );

    let workerIdleFired = false;
    setImmediate(() => {
      workerIdleFired = true;
      handlers.get("agent.idle")?.({
        sender: { kind: "agent", identity: { teamId, agentRole: "worker", agentKey: workerKey } },
        payload: {},
      });
      setTimeout(() => {
        handlers.get("agent.idle")?.({
          sender: { kind: "agent", identity: { teamId, agentRole: "general", agentKey: leaderKey } },
          payload: {},
        });
      }, 10);
    });

    const code = await runPrint(
      handle as never,
      teamId,
      "general",
      leaderKey,
      { kind: "print", instruction: "hi", team: undefined, timeout: 1, json: false, apiKey: undefined, resume: undefined, continueLast: false },
    );
    expect(workerIdleFired).toBe(true);
    expect(code).toBe(0);
  });
});