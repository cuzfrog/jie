import { type Command, type CommandName, type CommandResult, type EventEnvelope, type EventType, type JiePlatform, type TeamInfo } from "../../platform";
import { type Console } from "../../utils";
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
    dequeuePrompt: vi.fn(),
    requeuePrompt: vi.fn(),
    execute: dispatch,
    teams: () => [],
    shutdown: vi.fn(),
  };
  return { handle, subscribes };
}

function makeConsoleMock(): Console & {
  print: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
} {
  return {
    print: vi.fn(),
    error: vi.fn(),
    write: vi.fn(),
  };
}

function makeTeam(teamId: string, agentKeys: ReadonlyArray<string>, leaderKey: string): TeamInfo {
  return {
    id: teamId,
    leaderKey,
    sessionName: null,
    currentSessionId: null,
    kanbanCards: [],
    agents: agentKeys.map((k) => ({ teamId, role: k, agentKey: k, isLeader: k === leaderKey, tools: [], subscribe: [], skills: [], model: null })),
    history: [],
  };
}

const baseArgs = { kind: "print", instruction: "hi", team: undefined, timeout: 30, json: false, apiKey: undefined, resume: undefined, inMemory: false, debug: false } as const;

class ProcessExitError extends Error {
  constructor(readonly exitCode: number | undefined) {
    super(`process.exit(${exitCode})`);
  }
}

describe("runPrint", () => {
  let processExitSpy: { mockRestore(): void } | null = null;

  afterEach(() => {
    processExitSpy?.mockRestore();
    processExitSpy = null;
  });

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

  test("SIGINT interrupts the leader instead of exiting, and returns 130 once the team idles", async () => {
    const { handle, subscribes } = makeHandle();
    const teamId = "t1";
    const leaderKey = "general-1";
    const team = makeTeam(teamId, [leaderKey], leaderKey);

    setImmediate(() => {
      subscribes.get("agent.turn.start")?.({
        sender: { kind: "agent", teamId, agentKey: leaderKey },
        payload: {},
      });
      process.emit("SIGINT");
      setTimeout(() => {
        subscribes.get("agent.idle")?.({
          sender: { kind: "agent", teamId, agentKey: leaderKey },
          payload: {},
        });
      }, 10);
    });

    const code = await runPrint(handle, team, baseArgs, makeConsoleMock());
    expect(code).toBe(130);
    expect(handle.interrupt).toHaveBeenCalledWith(teamId, leaderKey);
    expect(handle.execute).toHaveBeenCalledWith({ name: "stop" });
  });

  test("a second SIGINT exits with code 130 without interrupting again", async () => {
    const { handle, subscribes } = makeHandle();
    const teamId = "t1";
    const leaderKey = "general-1";
    const team = makeTeam(teamId, [leaderKey], leaderKey);

    const exitCodes: number[] = [];
    processExitSpy = vi.spyOn(process, "exit").mockImplementation((code?: number): never => {
      exitCodes.push(code ?? 0);
      throw new ProcessExitError(code);
    });

    const baselineListeners = new Set(process.listeners("SIGINT"));
    setImmediate(() => {
      subscribes.get("agent.turn.start")?.({
        sender: { kind: "agent", teamId, agentKey: leaderKey },
        payload: {},
      });
      const sigintListeners = process.listeners("SIGINT").filter((l) => !baselineListeners.has(l));
      expect(sigintListeners).toHaveLength(1);
      const fireSigint = sigintListeners[0]!;
      fireSigint("SIGINT");
      try {
        fireSigint("SIGINT");
      } catch (error) {
        if (!(error instanceof ProcessExitError)) throw error;
      }
      setTimeout(() => {
        subscribes.get("agent.idle")?.({
          sender: { kind: "agent", teamId, agentKey: leaderKey },
          payload: {},
        });
      }, 10);
    });

    const code = await runPrint(handle, team, baseArgs, makeConsoleMock());
    expect(exitCodes).toEqual([130]);
    expect(code).toBe(130);
    expect(handle.interrupt).toHaveBeenCalledTimes(1);
    expect(handle.interrupt).toHaveBeenCalledWith(teamId, leaderKey);
  });

  test("SIGINT before a gate timeout turns the timeout exit into 130", async () => {
    const { handle, subscribes } = makeHandle();
    const teamId = "t1";
    const leaderKey = "general-1";
    const team = makeTeam(teamId, [leaderKey], leaderKey);
    const consoleMock = makeConsoleMock();

    setImmediate(() => {
      subscribes.get("agent.turn.start")?.({
        sender: { kind: "agent", teamId, agentKey: leaderKey },
        payload: {},
      });
      process.emit("SIGINT");
    });

    const code = await runPrint(handle, team, { ...baseArgs, timeout: 0.05 }, consoleMock);
    expect(code).toBe(130);
    expect(handle.interrupt).toHaveBeenCalledWith(teamId, leaderKey);
    expect(handle.execute).toHaveBeenCalledWith({ name: "stop" });
    expect(consoleMock.error).toHaveBeenCalledWith("no response from team within 0.05s");
  });

  test("agent.stream.chunk: only the leader's chunks are written; foreign-team and non-leader chunks are dropped", async () => {
    const { handle, subscribes } = makeHandle();
    const teamId = "t1";
    const leaderKey = "general-1";
    const workerKey = "worker-1";
    const team = makeTeam(teamId, [leaderKey], leaderKey);

    const writes: string[] = [];
    const consoleMock = makeConsoleMock();
    consoleMock.write.mockImplementation((text: string) => {
      writes.push(text);
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

    const code = await runPrint(handle, team, { ...baseArgs, timeout: 5 }, consoleMock);
    expect(code).toBe(0);
    const concatenated = writes.join("");
    expect(concatenated).toContain("leader-1");
    expect(concatenated).not.toContain("worker-1");
    expect(concatenated).not.toContain("other-team");
    expect(concatenated).not.toContain("user-text");
  });
});
