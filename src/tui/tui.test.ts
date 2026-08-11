import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { type Tui } from "./tui";
import { bootTui } from "./container";
import { Actions, type StateStore } from "./state";
import { withTTY } from "../../tests/support";
import { asValue } from "awilix";
import { type Terminal } from "@earendil-works/pi-tui";
import { Events, type JiePlatform, type EventType, type AnyEventEnvelope, type EventEnvelope, type Command, type CommandResult } from "../platform";

class FakeStdin extends PassThrough {
  isTTY = true;
  ref(): this { return this; }
  unref(): this { return this; }
  setRawMode(): this { return this; }
  override setEncoding(): this { return this; }
  override resume(): this { super.resume(); return this; }
  override pause(): this { super.pause(); return this; }
}

class FakeStdout extends PassThrough {
  columns = 80;
  rows = 30;
}

class RecordingTerminal implements Terminal {
  readonly writeCalls: string[] = [];
  columns = 80;
  rows = 30;
  start(): void {}
  stop(): void {}
  drainInput(): Promise<void> { return Promise.resolve(); }
  write(data: string): void { this.writeCalls.push(data); }
  get kittyProtocolActive(): boolean { return false; }
  moveBy(): void {}
  hideCursor(): void {}
  showCursor(): void {}
  clearLine(): void {}
  clearFromCursor(): void {}
  clearScreen(): void {}
  setTitle(): void {}
  setProgress(): void {}
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
  readonly executeCalls: ReadonlyArray<Command>;
  emit(event: AnyEventEnvelope): void;
}

function makePlatformHarness(executeResult: CommandResult<"kanbanEdit"> = { board: [] }, soundEnabled = true): PlatformHarness {
  const handlers = new Map<EventType, (env: AnyEventEnvelope) => void>();
  const recorded: PromptCall[] = [];
  const dequeues: QueueCall[] = [];
  const requeues: QueueCall[] = [];
  const executes: Command[] = [];
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
    execute: (async (command: Command) => {
      executes.push(command);
      if (command.name === "kanbanEdit") return executeResult;
      if (command.name === "getNotificationSoundEnabled") return soundEnabled;
      return null;
    }) as JiePlatform["execute"],
    teams: () => [],
    shutdown: () => Promise.resolve(),
  };
  return {
    platform,
    promptCalls: recorded,
    dequeueCalls: dequeues,
    requeueCalls: requeues,
    executeCalls: executes,
    emit: (event) => {
      handlers.get(event.type)?.(event);
    },
  };
}

interface TuiHarness {
  readonly container: ReturnType<typeof bootTui>;
  readonly tui: Tui;
  readonly stateStore: StateStore;
  readonly stdin: FakeStdin;
  readonly stdout: FakeStdout;
  readonly platform: PlatformHarness;
  readonly terminal?: RecordingTerminal;
}

function bootHarness(executeResult?: CommandResult<"kanbanEdit">, recordWrites = false, soundEnabled = true): TuiHarness {
  const stdin = new FakeStdin();
  const stdout = new FakeStdout();
  const platform = makePlatformHarness(executeResult, soundEnabled);
  const container = bootTui({ cwd: process.cwd() }, {
    platform: platform.platform,
    homeJieDir: join(tmpdir(), "jie-tui-unit-home"),
    stdin,
    stdout,
  });
  let terminal: RecordingTerminal | undefined;
  if (recordWrites) {
    terminal = new RecordingTerminal();
    container.register({ terminal: asValue(terminal) });
  }
  return { container, tui: container.cradle.tui, stateStore: container.cradle.stateStore, stdin, stdout, platform, terminal };
}

function makePlatform(): JiePlatform {
  return makePlatformHarness().platform;
}

describe("bootTui — run resolves on pendingQuit", () => {
  test("dispatching requestQuit resolves run()", async () => {
    withTTY(true, async () => {
      const { tui, stateStore, container } = bootHarness();
      const started = tui.run();
      await new Promise((r) => setTimeout(r, 10));
      stateStore.dispatch(Actions.requestQuit());
      expect(stateStore.getState().pendingQuit).toBe(true);
      await Promise.race([
        started,
        new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("run did not resolve within 2s after requestQuit")), 2000)),
      ]);
      await container.dispose();
    });
  });

  test("dispose() resolves run() even without requestQuit", async () => {
    withTTY(true, async () => {
      const { tui, container } = bootHarness();
      const started = tui.run();
      await new Promise((r) => setTimeout(r, 10));
      const disposed = container.dispose();
      await Promise.race([
        started,
        new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("dispose did not resolve within 2s")), 2000)),
      ]);
      await disposed;
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
      const container = bootTui({ cwd: process.cwd() }, { platform, homeJieDir: join(tmpdir(), "jie-tui-unit-home") });
      const s0 = container.cradle.stateStore.getState();
      expect(s0.teamId).toBeNull();
      expect(s0.agents.size).toBe(0);
      void container.dispose();
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
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms - 15)));
}

describe("bootTui — submit pipeline", () => {
  test("routes typed text to platform.prompt when text and return arrive as separate chunks", async () => {
    let harness: TuiHarness | null = null;
    withTTY(true, () => {
      harness = bootHarness();
    });
    const started = harness!.tui.run();
    await waitFrames(30);
    harness!.platform.emit(TEAM_LOADED);
    await waitFrames(20);
    harness!.stdin.write("hi");
    await waitFrames(20);
    harness!.stdin.write("\r");
    await waitFrames(30);
    expect(harness!.platform.promptCalls).toEqual([{ teamId: "my-team", agentKey: "general-1", text: "hi" }]);
    await harness!.container.dispose();
    await started;
  });

  test("routes typed text to platform.prompt when text and return arrive coalesced in one chunk", async () => {
    let harness: TuiHarness | null = null;
    withTTY(true, () => {
      harness = bootHarness();
    });
    const started = harness!.tui.run();
    await waitFrames(30);
    harness!.platform.emit(TEAM_LOADED);
    await waitFrames(20);
    harness!.stdin.write("hi\r");
    await waitFrames(30);
    expect(harness!.platform.promptCalls).toEqual([{ teamId: "my-team", agentKey: "general-1", text: "hi" }]);
    await harness!.container.dispose();
    await started;
  });
});

describe("bootTui — dequeue pipeline", () => {
  test("requestDequeue action forwards to platform.dequeuePrompt", async () => {
    let harness: TuiHarness | null = null;
    withTTY(true, () => {
      harness = bootHarness();
    });
    harness!.stateStore.dispatch(Actions.requestDequeue("my-team", "general-1", "queued text"));
    expect(harness!.platform.dequeueCalls).toEqual([{ teamId: "my-team", agentKey: "general-1", prompt: "queued text" }]);
    await harness!.container.dispose();
  });

  test("requestRequeue action forwards to platform.requeuePrompt", async () => {
    let harness: TuiHarness | null = null;
    withTTY(true, () => {
      harness = bootHarness();
    });
    harness!.stateStore.dispatch(Actions.requestRequeue("my-team", "general-1", "abandoned text"));
    expect(harness!.platform.requeueCalls).toEqual([{ teamId: "my-team", agentKey: "general-1", prompt: "abandoned text" }]);
    await harness!.container.dispose();
  });
});

describe("bootTui — kanban edit pipeline", () => {
  test("SAVE_KANBAN_EDIT forwards to platform.execute and applies the returned board", async () => {
    const board = [{ id: "#1", content: "edited content", status: "pending" as const }];
    let harness: TuiHarness | null = null;
    withTTY(true, () => {
      harness = bootHarness({ board });
    });
    harness!.platform.emit(TEAM_LOADED);
    harness!.stateStore.dispatch(Actions.saveKanbanEdit("#1", "edited content", "content"));
    await waitFrames(0);
    expect(harness!.platform.executeCalls.at(-1)).toEqual({ name: "kanbanEdit", teamId: "my-team", cardId: "#1", field: "content", text: "edited content" });
    expect(harness!.stateStore.getState().kanban.board).toEqual(board);
    await harness!.container.dispose();
  });
});

describe("bootTui — event bus wiring", () => {
  test("agent.usage events update the agent's reported context tokens", async () => {
    let harness: TuiHarness | null = null;
    withTTY(true, () => {
      harness = bootHarness();
    });
    const started = harness!.tui.run();
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
    await harness!.container.dispose();
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
    const started = harness!.tui.run();
    await waitFrames(30);
    harness!.platform.emit(TEAM_LOADED);
    harness!.platform.emit(Events.agentTurnStart({ kind: "agent", teamId: "my-team", agentKey: "general-1" }, null));
    await waitFrames(60);
    expect(frames.join("")).toContain("Working");
    await harness!.container.dispose();
    await started;
  });
});

describe("bootTui — global keys", () => {
  test("ctrl+t and ctrl+o toggle thinking and tool-card expansion", async () => {
    let harness: TuiHarness | null = null;
    withTTY(true, () => {
      harness = bootHarness();
    });
    const started = harness!.tui.run();
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
    await harness!.container.dispose();
    await started;
  });

  test("left at the editor start toggles the team panel; arrows move the cursor; enter commits it to the focused agent", async () => {
    let harness: TuiHarness | null = null;
    withTTY(true, () => {
      harness = bootHarness();
    });
    const started = harness!.tui.run();
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
    await harness!.container.dispose();
    await started;
  });

  test("left away from the editor start moves the cursor without toggling the team panel", async () => {
    let harness: TuiHarness | null = null;
    withTTY(true, () => {
      harness = bootHarness();
    });
    const started = harness!.tui.run();
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
    await harness!.container.dispose();
    await started;
  });
});

describe("bootTui — notification sound", () => {
  test("agent.idle for the focused agent with a terminal sound reason rings the terminal", async () => {
    let harness: TuiHarness | null = null;
    withTTY(true, () => {
      harness = bootHarness(undefined, true);
    });
    const started = harness!.tui.run();
    await waitFrames(30);
    harness!.platform.emit(TEAM_LOADED);
    await waitFrames(20);
    harness!.platform.emit(Events.agentIdle({ kind: "agent", teamId: "my-team", agentKey: "general-1" }, "stop"));
    await waitFrames(20);
    expect(harness!.platform.executeCalls.some((command) => command.name === "getNotificationSoundEnabled")).toBe(true);
    expect(harness!.terminal!.writeCalls.some((data) => data === "\x07")).toBe(true);
    await harness!.container.dispose();
    await started;
  });

  test("agent.idle with sound disabled does not ring the terminal", async () => {
    let harness: TuiHarness | null = null;
    withTTY(true, () => {
      harness = bootHarness(undefined, true, false);
    });
    const started = harness!.tui.run();
    await waitFrames(30);
    harness!.platform.emit(TEAM_LOADED);
    await waitFrames(20);
    harness!.platform.emit(Events.agentIdle({ kind: "agent", teamId: "my-team", agentKey: "general-1" }, "stop"));
    await waitFrames(20);
    expect(harness!.terminal!.writeCalls.some((data) => data === "\x07")).toBe(false);
    await harness!.container.dispose();
    await started;
  });

  test("agent.idle for a non-focused agent does not ring the terminal", async () => {
    let harness: TuiHarness | null = null;
    withTTY(true, () => {
      harness = bootHarness(undefined, true);
    });
    const started = harness!.tui.run();
    await waitFrames(30);
    harness!.platform.emit(TWO_AGENT_TEAM);
    await waitFrames(20);
    harness!.platform.emit(Events.agentIdle({ kind: "agent", teamId: "my-team", agentKey: "worker-1" }, "stop"));
    await waitFrames(20);
    expect(harness!.platform.executeCalls.some((command) => command.name === "getNotificationSoundEnabled")).toBe(false);
    expect(harness!.terminal!.writeCalls.some((data) => data === "\x07")).toBe(false);
    await harness!.container.dispose();
    await started;
  });

  test("agent.idle with a non-sound stop reason does not ring the terminal", async () => {
    let harness: TuiHarness | null = null;
    withTTY(true, () => {
      harness = bootHarness(undefined, true);
    });
    const started = harness!.tui.run();
    await waitFrames(30);
    harness!.platform.emit(TEAM_LOADED);
    await waitFrames(20);
    harness!.platform.emit(Events.agentIdle({ kind: "agent", teamId: "my-team", agentKey: "general-1" }, "toolUse"));
    await waitFrames(20);
    expect(harness!.terminal!.writeCalls.some((data) => data === "\x07")).toBe(false);
    await harness!.container.dispose();
    await started;
  });
});

function bootTransientHarness(ttlMs: number, tickMs: number): TuiHarness {
  const stdin = new FakeStdin();
  const stdout = new FakeStdout();
  const platform = makePlatformHarness();
  const container = bootTui({ cwd: process.cwd() }, {
    platform: platform.platform,
    homeJieDir: join(tmpdir(), "jie-tui-unit-home"),
    stdin,
    stdout,
  });
  container.register({
    transientTtlMs: asValue(ttlMs),
    renderTickMs: asValue(tickMs),
  });
  return { container, tui: container.cradle.tui, stateStore: container.cradle.stateStore, stdin, stdout, platform };
}

describe("bootTui — transient message", () => {
  test("expires the transient message after the configured TTL", async () => {
    let harness: TuiHarness | null = null;
    withTTY(true, () => {
      harness = bootTransientHarness(50, 20);
    });
    const started = harness!.tui.run();
    await waitFrames(30);
    harness!.stateStore.dispatch(Actions.setTransientMessage("hello"));
    expect(harness!.stateStore.getState().transientMessage).toBe("hello");
    await waitFrames(100);
    expect(harness!.stateStore.getState().transientMessage).toBeNull();
    await harness!.container.dispose();
    await started;
  });
});


