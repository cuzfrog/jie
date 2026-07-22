import { type Command, type CommandName, type CommandResult, type Console, type EventEnvelope, type EventType, type JiePlatform, type TeamInfo } from "@cuzfrog/jie-platform";
import { runPrint } from "./print";

type AgentEnvelope = {
  sender: { kind: string; teamId?: string; agentKey?: string };
  payload: Record<string, unknown>;
};
type Handler = (env: AgentEnvelope) => void;

function makeHandle(): { handle: JiePlatform; subscribes: Map<string, Handler> } {
  const subscribes = new Map<string, Handler>();
  const dispatch = vi.fn(async <T extends CommandName>(_command: Command<T>): Promise<CommandResult<T>> => {
    return null as CommandResult<T>;
  });
  const subscribeFn = <T extends EventType>(topic: T, callback: (event: EventEnvelope<T>) => void): (() => void) => {
    subscribes.set(topic as unknown as string, callback as unknown as Handler);
    return () => {};
  };
  const subscribeSpy = vi.fn(subscribeFn);
  const handle: JiePlatform = {
    settings: {},
    subscribe: subscribeSpy,
    prompt: vi.fn(),
    interrupt: vi.fn(),
    execute: dispatch,
    teams: () => [],
  };
  return { handle, subscribes };
}

function makeConsoleMock(): Console {
  return {
    print: vi.fn(),
    error: vi.fn(),
  };
}

function makeTeam(teamId: string, agentKeys: ReadonlyArray<string>, leaderKey: string): TeamInfo {
  return {
    id: teamId,
    leaderKey,
    agents: agentKeys.map((k) => ({ teamId, role: k, agentKey: k, isLeader: k === leaderKey, model: null })),
    history: [],
  };
}

const baseArgs = { kind: "print", instruction: "hi", team: undefined, timeout: 30, json: false, apiKey: undefined, resume: undefined, inMemory: false } as const;

describe("runPrint", () => {
  test("happy path: subscribes to agent.stream.chunk, publishes leader.prompt, waits for agent.idle, then stop()s", async () => {
    const { handle, subscribes } = makeHandle();
    const teamId = "t1";
    const leaderKey = "general-1";
    const team = makeTeam(teamId, [leaderKey], leaderKey);

    setImmediate(() => {
      subscribes.get("agent.turn.start")?.({
        sender: { kind: "agent", teamId, agentKey: leaderKey },
        payload: {},
      });
      subscribes.get("agent.idle")?.({
        sender: { kind: "agent", teamId, agentKey: leaderKey },
        payload: {},
      });
    });

    const code = await runPrint(handle, team, baseArgs, makeConsoleMock());
    expect(code).toBe(0);
    expect(handle.subscribe).toHaveBeenCalledWith("agent.stream.chunk", expect.any(Function));
    expect(handle.prompt).toHaveBeenCalledWith(teamId, leaderKey, "hi");
    expect(handle.execute).toHaveBeenCalledWith({ name: "stop" });
  });

  test("timeout: returns 3 and stops the handle", async () => {
    const { handle } = makeHandle();
    const team = makeTeam("t1", ["general-1"], "general-1");
    const consoleMock = makeConsoleMock();
    const code = await runPrint(
      handle,
      team,
      { ...baseArgs, timeout: 0.05 },
      consoleMock,
    );
    expect(code).toBe(3);
    expect(handle.execute).toHaveBeenCalledWith({ name: "stop" });
    expect(consoleMock.error).toHaveBeenCalledWith("no response from team within 0.05s");
  });

  test("worker busy while leader idles: gate does NOT open until worker idles", async () => {
    const { handle, subscribes } = makeHandle();
    const teamId = "t1";
    const leaderKey = "general-1";
    const workerKey = "worker-1";
    const team = makeTeam(teamId, [leaderKey, workerKey], leaderKey);

    setImmediate(() => {
      subscribes.get("agent.turn.start")?.({
        sender: { kind: "agent", teamId, agentKey: leaderKey },
        payload: {},
      });
      subscribes.get("agent.turn.start")?.({
        sender: { kind: "agent", teamId, agentKey: workerKey },
        payload: {},
      });
      setTimeout(() => {
        subscribes.get("agent.idle")?.({
          sender: { kind: "agent", teamId, agentKey: leaderKey },
          payload: {},
        });
      }, 10);
      setTimeout(() => {
        subscribes.get("agent.idle")?.({
          sender: { kind: "agent", teamId, agentKey: workerKey },
          payload: {},
        });
      }, 30);
    });

    const start = Date.now();
    const code = await runPrint(handle, team, { ...baseArgs, timeout: 2 }, makeConsoleMock());
    const elapsed = Date.now() - start;
    expect(code).toBe(0);
    expect(elapsed).toBeGreaterThanOrEqual(25);
  });

  test("agents unknown to the gate are ignored: a stray worker-idle does not resolve early", async () => {
    const { handle, subscribes } = makeHandle();
    const teamId = "t1";
    const leaderKey = "general-1";
    const team = makeTeam(teamId, [leaderKey], leaderKey);

    setImmediate(() => {
      subscribes.get("agent.turn.start")?.({
        sender: { kind: "agent", teamId, agentKey: leaderKey },
        payload: {},
      });
      setTimeout(() => {
        subscribes.get("agent.idle")?.({
          sender: { kind: "agent", teamId, agentKey: "ghost-1" },
          payload: {},
        });
      }, 5);
      setTimeout(() => {
        subscribes.get("agent.idle")?.({
          sender: { kind: "agent", teamId, agentKey: leaderKey },
          payload: {},
        });
      }, 30);
    });

    const start = Date.now();
    const code = await runPrint(handle, team, { ...baseArgs, timeout: 2 }, makeConsoleMock());
    const elapsed = Date.now() - start;
    expect(code).toBe(0);
    expect(elapsed).toBeGreaterThanOrEqual(25);
  });

  test("agent.stream.chunk: only the leader's chunks are written; foreign-team and non-leader chunks are dropped", async () => {
    const { handle, subscribes } = makeHandle();
    const teamId = "t1";
    const leaderKey = "general-1";
    const workerKey = "worker-1";
    const team = makeTeam(teamId, [leaderKey], leaderKey);

    const writes: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      writes.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    });

    setImmediate(() => {
      subscribes.get("agent.stream.chunk")?.({
        sender: { kind: "agent", teamId, agentKey: leaderKey },
        payload: { text: "leader-1", seq: 0, block_type: "text" },
      });
      subscribes.get("agent.stream.chunk")?.({
        sender: { kind: "agent", teamId, agentKey: workerKey },
        payload: { text: "worker-1", seq: 0, block_type: "text" },
      });
      subscribes.get("agent.stream.chunk")?.({
        sender: { kind: "agent", teamId: "other-team", agentKey: leaderKey },
        payload: { text: "other-team", seq: 0, block_type: "text" },
      });
      subscribes.get("agent.stream.chunk")?.({
        sender: { kind: "user" },
        payload: { text: "user-text", seq: 0, block_type: "text" },
      });
      subscribes.get("agent.idle")?.({
        sender: { kind: "agent", teamId, agentKey: leaderKey },
        payload: {},
      });
    });

    const code = await runPrint(handle, team, { ...baseArgs, timeout: 5 }, makeConsoleMock());
    expect(code).toBe(0);
    const concatenated = writes.join("");
    expect(concatenated).toContain("leader-1");
    expect(concatenated).not.toContain("worker-1");
    expect(concatenated).not.toContain("other-team");
    expect(concatenated).not.toContain("user-text");
    stdoutSpy.mockRestore();
  });
});
