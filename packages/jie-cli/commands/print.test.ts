import type { JiePlatform, TeamIdentity } from "@cuzfrog/jie-platform";
import { runPrint } from "./print";

interface JiePlatformStub {
  subscribe: ReturnType<typeof vi.fn>;
  prompt: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
}

type AgentEnvelope = {
  sender: { kind: string; teamId?: string; agentKey?: string };
  payload: Record<string, unknown>;
};
type Handler = (env: AgentEnvelope) => void;

function makeHandle(): { handle: JiePlatformStub; subscribes: Map<string, Handler> } {
  const subscribes = new Map<string, Handler>();
  const handle: JiePlatformStub = {
    subscribe: vi.fn((topic: string, cb: Handler) => {
      subscribes.set(topic, cb);
      return () => {};
    }),
    prompt: vi.fn(),
    execute: vi.fn().mockResolvedValue(null),
  };
  return { handle, subscribes };
}

function makeTeam(teamId: string, agentKeys: ReadonlyArray<string>, leaderKey: string): TeamIdentity {
  return {
    id: teamId,
    leaderKey,
    agents: agentKeys.map((k) => ({ teamId, role: k, agentKey: k, isLeader: k === leaderKey })),
  };
}

const baseArgs = { kind: "print", instruction: "hi", team: undefined, timeout: 30, json: false, apiKey: undefined, resume: undefined } as const;

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

    const code = await runPrint(handle as unknown as JiePlatform, team, baseArgs);
    expect(code).toBe(0);
    expect(handle.subscribe).toHaveBeenCalledWith("agent.stream.chunk", expect.any(Function));
    expect(handle.prompt).toHaveBeenCalledWith(teamId, leaderKey, "hi");
    expect(handle.execute).toHaveBeenCalledWith({ name: "stop" });
  });

  test("timeout: returns 3 and stops the handle", async () => {
    const { handle } = makeHandle();
    const team = makeTeam("t1", ["general-1"], "general-1");
    const code = await runPrint(
      handle as unknown as JiePlatform,
      team,
      { ...baseArgs, timeout: 0.05 },
    );
    expect(code).toBe(3);
    expect(handle.execute).toHaveBeenCalledWith({ name: "stop" });
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
    const code = await runPrint(handle as unknown as JiePlatform, team, { ...baseArgs, timeout: 2 });
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
    const code = await runPrint(handle as unknown as JiePlatform, team, { ...baseArgs, timeout: 2 });
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

    const code = await runPrint(handle as unknown as JiePlatform, team, { ...baseArgs, timeout: 5 });
    expect(code).toBe(0);
    const concatenated = writes.join("");
    expect(concatenated).toContain("leader-1");
    expect(concatenated).not.toContain("worker-1");
    expect(concatenated).not.toContain("other-team");
    expect(concatenated).not.toContain("user-text");
    stdoutSpy.mockRestore();
  });
});