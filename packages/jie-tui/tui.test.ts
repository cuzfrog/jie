import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { type Tui } from "./tui";
import { bootTui } from "./container";
import { Actions, type StateStore } from "./state";
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

interface QueueCall {
  readonly teamId: string;
  readonly agentKey: string;
  readonly prompt: string;
}

interface PlatformHarness {
  readonly platform: JiePlatform;
  readonly promptCalls: ReadonlyArray<PromptCall>;
  readonly dequeueCalls: ReadonlyArray<QueueCall>;
  readonly requeueCalls: ReadonlyArray<QueueCall>;
  emit(event: AnyEventEnvelope): void;
}

function makePlatformHarness(): PlatformHarness {
  const handlers = new Map<EventType, (env: AnyEventEnvelope) => void>();
  const recorded: PromptCall[] = [];
  const dequeues: QueueCall[] = [];
  const requeues: QueueCall[] = [];
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
    dequeuePrompt: (teamId, agentKey, prompt) => {
      dequeues.push({ teamId, agentKey, prompt });
    },
    requeuePrompt: (teamId, agentKey, prompt) => {
      requeues.push({ teamId, agentKey, prompt });
    },
    execute: (async () => null) as JiePlatform["execute"],
    teams: () => [],
    shutdown: () => Promise.resolve(),
  };
  return {
    platform,
    promptCalls: recorded,
    dequeueCalls: dequeues,
    requeueCalls: requeues,
    emit: (event) => {
      handlers.get(event.type)?.(event);
    },
  };
}

interface TuiHarness {
  readonly tui: Tui;
  readonly stateStore: StateStore;
  readonly stdin: FakeStdin;
  readonly stdout: FakeStdout;
  readonly platform: PlatformHarness;
}

function bootHarness(): TuiHarness {
  const stdin = new FakeStdin();
  const stdout = new FakeStdout();
  const platform = makePlatformHarness();
  const container = bootTui({ cwd: process.cwd() }, {
    platform: platform.platform,
    homeJieDir: join(tmpdir(), "jie-tui-unit-home"),
    stdin,
    stdout,
  });
  return { tui: container.cradle.tui, stateStore: container.cradle.stateStore, stdin, stdout, platform };
}

function makePlatform(): JiePlatform {
  return makePlatformHarness().platform;
}

describe("bootTui — start resolves on pendingQuit", () => {
  test("dispatching requestQuit resolves start()", async () => {
    withTTY(true, async () => {
      const { tui, stateStore } = bootHarness();
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
      const { tui } = bootHarness();
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

describe("bootTui — surface contract", () => {
  test("throws when not on a TTY", () => {
    withTTY(false, () => {
      expect(() => bootTui({ cwd: process.cwd() }, { platform: makePlatform(), homeJieDir: join(tmpdir(), "jie-tui-unit-home") })).toThrow(/interactive terminal/);
    });
  });

  test("returns a Tui handle with initial empty state", () => {
    withTTY(true, () => {
      const platform = makePlatform();
      const cradle = bootTui({ cwd: process.cwd() }, { platform, homeJieDir: join(tmpdir(), "jie-tui-unit-home") }).cradle;
      const s0 = cradle.stateStore.getState();
      expect(s0.teamId).toBeNull();
      expect(s0.agents.size).toBe(0);
      cradle.tui.stop();
    });
  });
});

const TEAM_LOADED = Events.teamLoaded({ kind: "system" }, {
  id: "my-team",
  leaderKey: "general-1",
  sessionName: null,
  currentSessionId: null,
  kanbanCards: [],
  history: [],
  agents: [{ teamId: "my-team", role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null }],
});

const TWO_AGENT_TEAM = Events.teamLoaded({ kind: "system" }, {
  id: "my-team",
  leaderKey: "manager-1",
  sessionName: null,
  currentSessionId: null,
  kanbanCards: [],
  history: [],
  agents: [
    { teamId: "my-team", role: "manager", agentKey: "manager-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null },
    { teamId: "my-team", role: "worker", agentKey: "worker-1", isLeader: false, tools: [], subscribe: [], skills: [], model: null },
  ],
});

function waitFrames(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("bootTui — submit pipeline", () => {
  test("routes typed text to platform.prompt when text and return arrive as separate chunks", async () => {
    let harness: TuiHarness | null = null;
    withTTY(true, () => {
      harness = bootHarness();
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
      harness = bootHarness();
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

describe("bootTui — dequeue pipeline", () => {
  test("requestDequeue action forwards to platform.dequeuePrompt", () => {
    let harness: TuiHarness | null = null;
    withTTY(true, () => {
      harness = bootHarness();
    });
    harness!.stateStore.dispatch(Actions.requestDequeue("my-team", "general-1", "queued text"));
    expect(harness!.platform.dequeueCalls).toEqual([{ teamId: "my-team", agentKey: "general-1", prompt: "queued text" }]);
    harness!.tui.stop();
  });

  test("requestRequeue action forwards to platform.requeuePrompt", () => {
    let harness: TuiHarness | null = null;
    withTTY(true, () => {
      harness = bootHarness();
    });
    harness!.stateStore.dispatch(Actions.requestRequeue("my-team", "general-1", "abandoned text"));
    expect(harness!.platform.requeueCalls).toEqual([{ teamId: "my-team", agentKey: "general-1", prompt: "abandoned text" }]);
    harness!.tui.stop();
  });
});

describe("bootTui — event bus wiring", () => {
  test("agent.usage events update the agent's reported context tokens", async () => {
    let harness: TuiHarness | null = null;
    withTTY(true, () => {
      harness = bootHarness();
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
    const agent = harness!.stateStore.getState().agents.get("my-team:general-1");
    expect(agent?.contextTokensUsed).toBe(4242);
    expect(agent?.lastReportedTotalTokens).toBe(4242);
    harness!.tui.stop();
    await started;
  });
});

describe("bootTui — working indicator", () => {
  test("renders the working indicator while an agent is busy", async () => {
    let harness: TuiHarness | null = null;
    withTTY(true, () => {
      harness = bootHarness();
    });
    const frames: string[] = [];
    harness!.stdout.on("data", (chunk: Buffer) => {
      frames.push(chunk.toString("utf8"));
    });
    const started = harness!.tui.start();
    await waitFrames(30);
    harness!.platform.emit(TEAM_LOADED);
    harness!.platform.emit(Events.agentTurnStart({ kind: "agent", teamId: "my-team", agentKey: "general-1" }, null));
    await waitFrames(60);
    expect(frames.join("")).toContain("Working");
    harness!.tui.stop();
    await started;
  });
});

describe("bootTui — global keys", () => {
  test("ctrl+t and ctrl+o toggle thinking and tool-card expansion", async () => {
    let harness: TuiHarness | null = null;
    withTTY(true, () => {
      harness = bootHarness();
    });
    const started = harness!.tui.start();
    await waitFrames(30);
    harness!.stdin.write("\x14");
    await waitFrames(20);
    expect(harness!.stateStore.getState().thinkingExpanded).toBe(true);
    harness!.stdin.write("\x0f");
    await waitFrames(20);
    expect(harness!.stateStore.getState().toolCardsExpanded).toBe(true);
    harness!.stdin.write("\x14");
    await waitFrames(20);
    expect(harness!.stateStore.getState().thinkingExpanded).toBe(false);
    harness!.tui.stop();
    await started;
  });

  test("left at the editor start toggles the team panel; arrows move the cursor; enter commits it to the focused agent", async () => {
    let harness: TuiHarness | null = null;
    withTTY(true, () => {
      harness = bootHarness();
    });
    const started = harness!.tui.start();
    await waitFrames(30);
    harness!.platform.emit(TWO_AGENT_TEAM);
    await waitFrames(20);
    expect(harness!.stateStore.getState().focusedAgentId).toBe("my-team:manager-1");
    expect(harness!.stateStore.getState().editorCursorAtStart).toBe(true);
    harness!.stdin.write("\x1b[D");
    await waitFrames(20);
    expect(harness!.stateStore.getState().teamPanelVisible).toBe(true);
    expect(harness!.stateStore.getState().teamCursorAgentId).toBe("my-team:manager-1");
    harness!.stdin.write("\x1b[B");
    await waitFrames(20);
    expect(harness!.stateStore.getState().teamCursorAgentId).toBe("my-team:worker-1");
    expect(harness!.stateStore.getState().focusedAgentId).toBe("my-team:manager-1");
    harness!.stdin.write("\r");
    await waitFrames(20);
    expect(harness!.stateStore.getState().focusedAgentId).toBe("my-team:worker-1");
    harness!.stdin.write("\x1b[D");
    await waitFrames(20);
    expect(harness!.stateStore.getState().teamPanelVisible).toBe(false);
    expect(harness!.stateStore.getState().teamCursorAgentId).toBeNull();
    harness!.tui.stop();
    await started;
  });

  test("left away from the editor start moves the cursor without toggling the team panel", async () => {
    let harness: TuiHarness | null = null;
    withTTY(true, () => {
      harness = bootHarness();
    });
    const started = harness!.tui.start();
    await waitFrames(30);
    harness!.platform.emit(TWO_AGENT_TEAM);
    await waitFrames(20);
    harness!.stdin.write("hi");
    await waitFrames(20);
    expect(harness!.stateStore.getState().editorCursorAtStart).toBe(false);
    harness!.stdin.write("\x1b[D");
    await waitFrames(20);
    expect(harness!.stateStore.getState().teamPanelVisible).toBe(false);
    expect(harness!.stateStore.getState().editorCursorAtStart).toBe(false);
    harness!.stdin.write("\x1b[D");
    await waitFrames(20);
    expect(harness!.stateStore.getState().editorCursorAtStart).toBe(true);
    harness!.stdin.write("\x1b[D");
    await waitFrames(20);
    expect(harness!.stateStore.getState().teamPanelVisible).toBe(true);
    harness!.tui.stop();
    await started;
  });
});
