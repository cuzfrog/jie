import { PassThrough } from "node:stream";
import { createTui, type Tui } from "./tui";
import { Actions } from "./state";
import { withTTY } from "../../tests/support";
import { Events, type JiePlatform, type EventType, type AnyEventEnvelope, type EventEnvelope } from "@cuzfrog/jie-platform";

class FakeStdin extends PassThrough {
  isTTY = true;
  ref(): this { return this; }
  unref(): this { return this; }
  setRawMode(): this { return this; }
  setEncoding(): this { return this; }
  resume(): this { super.resume(); return this; }
  pause(): this { super.pause(); return this; }
}

class FakeStdout extends PassThrough {
  columns = 80;
  rows = 30;
}

interface PromptCall {
  readonly teamId: string;
  readonly agentKey: string;
  readonly text: string;
}

interface PlatformHarness {
  readonly platform: JiePlatform;
  readonly promptCalls: ReadonlyArray<PromptCall>;
  emit(event: AnyEventEnvelope): void;
}

function makePlatformHarness(): PlatformHarness {
  const handlers = new Map<EventType, (env: AnyEventEnvelope) => void>();
  const recorded: PromptCall[] = [];
  const platform: JiePlatform = {
    settings: { defaultTeam: undefined, defaultProvider: undefined, defaultModel: undefined },
    subscribe: <T extends EventType>(topic: T, cb: (env: EventEnvelope<T>) => void) => {
      const handler = cb as (env: AnyEventEnvelope) => void;
      handlers.set(topic, handler);
      return () => {
        if (handlers.get(topic) === handler) handlers.delete(topic);
      };
    },
    prompt: (teamId, agentKey, text) => {
      recorded.push({ teamId, agentKey, text });
    },
    interrupt: () => undefined,
    execute: (async () => null) as JiePlatform["execute"],
    teams: () => [],
  };
  return {
    platform,
    promptCalls: recorded,
    emit: (event) => {
      handlers.get(event.type)?.(event);
    },
  };
}

interface TuiHarness {
  readonly tui: Tui;
  readonly stdin: FakeStdin;
  readonly stdout: FakeStdout;
  readonly platform: PlatformHarness;
}

function bootTui(): TuiHarness {
  const stdin = new FakeStdin();
  const stdout = new FakeStdout();
  const platform = makePlatformHarness();
  const tui = createTui({ cwd: process.cwd() }, {
    platform: platform.platform,
    stdin,
    stdout,
  });
  return { tui, stdin, stdout, platform };
}

function makePlatform(): JiePlatform {
  return makePlatformHarness().platform;
}

describe("createTui — start resolves on pendingQuit", () => {
  test("dispatching requestQuit resolves start()", async () => {
    withTTY(true, async () => {
      const { tui } = bootTui();
      const stateStore = (tui as unknown as { stateStore: { getState: () => { pendingQuit: boolean }; dispatch: (a: unknown) => void } }).stateStore;
      const started = tui.start();
      await new Promise((r) => setTimeout(r, 30));
      stateStore.dispatch(Actions.requestQuit());
      expect(stateStore.getState().pendingQuit).toBe(true);
      await Promise.race([
        started,
        new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("start did not resolve within 2s after requestQuit")), 2000)),
      ]);
      tui.stop();
    });
  });

  test("stop() resolves start() even without requestQuit", async () => {
    withTTY(true, async () => {
      const { tui } = bootTui();
      const started = tui.start();
      await new Promise((r) => setTimeout(r, 30));
      tui.stop();
      await Promise.race([
        started,
        new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("stop did not resolve within 2s")), 2000)),
      ]);
    });
  });
});

describe("createTui — surface contract", () => {
  test("throws when not on a TTY", () => {
    withTTY(false, () => {
      expect(() => createTui({ cwd: process.cwd() }, { platform: makePlatform() })).toThrow(/interactive terminal/);
    });
  });

  test("returns a Tui handle with initial empty state", () => {
    withTTY(true, () => {
      const platform = makePlatform();
      const tui: Tui = createTui({ cwd: process.cwd() }, { platform });
      const s0 = tui.state;
      expect(s0.teamId).toBeNull();
      expect(s0.agents.size).toBe(0);
      tui.stop();
    });
  });
});

const TEAM_LOADED = Events.teamLoaded({ kind: "system" }, {
  id: "my-team",
  leaderKey: "general-1",
  history: [],
  agents: [{ teamId: "my-team", role: "general", agentKey: "general-1", isLeader: true, model: null }],
});

const TWO_AGENT_TEAM = Events.teamLoaded({ kind: "system" }, {
  id: "my-team",
  leaderKey: "manager-1",
  history: [],
  agents: [
    { teamId: "my-team", role: "manager", agentKey: "manager-1", isLeader: true, model: null },
    { teamId: "my-team", role: "worker", agentKey: "worker-1", isLeader: false, model: null },
  ],
});

function waitFrames(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("createTui — submit pipeline", () => {
  test("routes typed text to platform.prompt when text and return arrive as separate chunks", async () => {
    let harness: TuiHarness | null = null;
    withTTY(true, () => {
      harness = bootTui();
    });
    const started = harness!.tui.start();
    await waitFrames(30);
    harness!.platform.emit(TEAM_LOADED);
    await waitFrames(20);
    harness!.stdin.write("hi");
    await waitFrames(20);
    harness!.stdin.write("\r");
    await waitFrames(30);
    expect(harness!.platform.promptCalls).toEqual([{ teamId: "my-team", agentKey: "general-1", text: "hi" }]);
    harness!.tui.stop();
    await started;
  });

  test("routes typed text to platform.prompt when text and return arrive coalesced in one chunk", async () => {
    let harness: TuiHarness | null = null;
    withTTY(true, () => {
      harness = bootTui();
    });
    const started = harness!.tui.start();
    await waitFrames(30);
    harness!.platform.emit(TEAM_LOADED);
    await waitFrames(20);
    harness!.stdin.write("hi\r");
    await waitFrames(30);
    expect(harness!.platform.promptCalls).toEqual([{ teamId: "my-team", agentKey: "general-1", text: "hi" }]);
    harness!.tui.stop();
    await started;
  });
});

describe("createTui — event bus wiring", () => {
  test("agent.usage events update the agent's reported context tokens", async () => {
    let harness: TuiHarness | null = null;
    withTTY(true, () => {
      harness = bootTui();
    });
    const started = harness!.tui.start();
    await waitFrames(30);
    harness!.platform.emit(TEAM_LOADED);
    await waitFrames(20);
    harness!.platform.emit(Events.agentUsage(
      { kind: "agent", teamId: "my-team", agentKey: "general-1" },
      { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, totalTokens: 4242 },
    ));
    await waitFrames(20);
    const agent = harness!.tui.state.agents.get("my-team:general-1");
    expect(agent?.contextTokensUsed).toBe(4242);
    expect(agent?.lastReportedTotalTokens).toBe(4242);
    harness!.tui.stop();
    await started;
  });
});

describe("createTui — working indicator", () => {
  test("renders the working indicator while an agent is busy", async () => {
    let harness: TuiHarness | null = null;
    withTTY(true, () => {
      harness = bootTui();
    });
    const frames: string[] = [];
    harness!.stdout.on("data", (chunk: Buffer) => {
      frames.push(chunk.toString("utf8"));
    });
    const started = harness!.tui.start();
    await waitFrames(30);
    harness!.platform.emit(TEAM_LOADED);
    harness!.platform.emit(Events.agentTurnStart({ kind: "agent", teamId: "my-team", agentKey: "general-1" }));
    await waitFrames(60);
    expect(frames.join("")).toContain("Working");
    harness!.tui.stop();
    await started;
  });
});

describe("createTui — global keys", () => {
  test("ctrl+t and ctrl+o toggle thinking and tool-card expansion", async () => {
    let harness: TuiHarness | null = null;
    withTTY(true, () => {
      harness = bootTui();
    });
    const started = harness!.tui.start();
    await waitFrames(30);
    harness!.stdin.write("\x14");
    await waitFrames(20);
    expect(harness!.tui.state.thinkingExpanded).toBe(true);
    harness!.stdin.write("\x0f");
    await waitFrames(20);
    expect(harness!.tui.state.toolCardsExpanded).toBe(true);
    harness!.stdin.write("\x14");
    await waitFrames(20);
    expect(harness!.tui.state.thinkingExpanded).toBe(false);
    harness!.tui.stop();
    await started;
  });

  test("shift+down cycles the focused agent to the next team member", async () => {
    let harness: TuiHarness | null = null;
    withTTY(true, () => {
      harness = bootTui();
    });
    const started = harness!.tui.start();
    await waitFrames(30);
    harness!.platform.emit(TWO_AGENT_TEAM);
    await waitFrames(20);
    expect(harness!.tui.state.focusedAgentId).toBe("my-team:manager-1");
    harness!.stdin.write("\x1b[1;2B");
    await waitFrames(20);
    expect(harness!.tui.state.focusedAgentId).toBe("my-team:worker-1");
    harness!.tui.stop();
    await started;
  });
});
