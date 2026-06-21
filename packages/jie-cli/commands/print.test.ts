import { describe, expect, test } from "bun:test";
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
      handlers.get("agent.turn.start")?.({ sender: { kind: "agent" }, payload: {} });
      handlers.get("agent.idle")?.({ sender: { kind: "agent" }, payload: {} });
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
      "t1.leader.prompt",
      expect.objectContaining({ prompt: "hi" }),
      expect.objectContaining({ kind: "agent", identity: expect.objectContaining({ teamId, agentRole: leaderRole, agentKey: leaderKey }) }),
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
});