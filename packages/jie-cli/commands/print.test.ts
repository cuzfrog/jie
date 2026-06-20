import { describe, expect, test } from "bun:test";
import { runPrint } from "./print.ts";

interface JiePlatformStub {
  bus: {
    subscribe: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
  };
  stop: ReturnType<typeof vi.fn>;
}

function makeHandle(): { handle: JiePlatformStub; bus: JiePlatformStub["bus"] } {
  const bus = {
    subscribe: vi.fn(),
    publish: vi.fn(),
  };
  const handle: JiePlatformStub = {
    bus,
    stop: vi.fn().mockResolvedValue(undefined),
  };
  return { handle, bus };
}

describe("runPrint", () => {
  test("happy path: subscribes to agent.stream.chunk, publishes leader.prompt, waits for agent.idle, then stop()s", async () => {
    const { handle, bus } = makeHandle();
    const teamId = "t1";
    const leaderRole = "general";
    const leaderKey = "general-1";

    const handlers = new Map<string, (s: string, p: object) => void>();
    bus.subscribe.mockImplementation(
      (subject: string, _subjOrHandler: string | ((s: string, p: object) => void), handler?: (s: string, p: object) => void) => {
        const fn = handler ?? (typeof _subjOrHandler === "function" ? _subjOrHandler : () => {});
        handlers.set(subject, fn);
        return () => {};
      },
    );
    setImmediate(() => {
      handlers.get("agent.turn.start")?.("agent.turn.start", {});
      handlers.get("agent.idle")?.("agent.idle", {});
    });

    const code = await runPrint(
      handle as never,
      teamId,
      leaderRole,
      leaderKey,
      { kind: "print", instruction: "hi", team: undefined, timeout: 30, json: false, apiKey: undefined, resume: undefined, continueLast: false },
    );
    expect(code).toBe(0);
    expect(bus.subscribe).toHaveBeenCalledWith("agent.stream.chunk", expect.any(Function));
    expect(bus.subscribe).toHaveBeenCalledWith("agent.turn.start", expect.any(Function));
    expect(bus.subscribe).toHaveBeenCalledWith("agent.idle", expect.any(Function));
    expect(bus.publish).toHaveBeenCalledWith(
      `${teamId}.leader.prompt`,
      expect.objectContaining({
        event_type: "leader.prompt",
        team_id: teamId,
        agent_role: leaderRole,
        agent_key: leaderKey,
        payload: { prompt: "hi" },
      }),
    );
    expect(handle.stop).toHaveBeenCalled();
  });

  test("timeout: returns 3 and stops the handle", async () => {
    const { handle, bus } = makeHandle();
    bus.subscribe.mockReturnValue(() => {});

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
