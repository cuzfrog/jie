import { join } from "node:path";
import {
  Events,
  type Command,
  type CommandName,
  type CommandResult,
  type EventEnvelope,
  type EventType,
  type JiePlatform,
  type JiePlatformOptions,
  type TeamInfo,
} from "../platform";
import type { CreateTUIOptions, Tui, TuiDeps } from "../tui";
import type { Console } from "../utils";
import { _run } from ".";

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

interface FakePlatform extends JiePlatform {
  execute: ReturnType<typeof vi.fn>;
  shutdown: ReturnType<typeof vi.fn>;
  subscribeCalls: EventType[];
  trace: TraceEvent[];
  emit<T extends EventType>(topic: T, event: EventEnvelope<T>): void;
}

type TraceEvent =
  | { readonly kind: "subscribe"; readonly topic: EventType }
  | { readonly kind: "execute"; readonly commandName: string };

function makeFakePlatform(): FakePlatform {
  const subscribeCalls: EventType[] = [];
  const trace: TraceEvent[] = [];
  const subscribers = new Map<string, Array<(event: EventEnvelope<EventType>) => void>>();
  const fake: FakePlatform = {
    settings: {},
    subscribeCalls,
    trace,
    subscribe<T extends EventType>(topic: T, cb: (event: EventEnvelope<T>) => void): () => void {
      subscribeCalls.push(topic);
      trace.push({ kind: "subscribe", topic });
      const listeners = subscribers.get(topic) ?? [];
      if (listeners.length === 0) subscribers.set(topic, listeners);
      const stored = cb as (event: EventEnvelope<EventType>) => void;
      listeners.push(stored);
      return () => {
        const index = listeners.indexOf(stored);
        if (index !== -1) listeners.splice(index, 1);
      };
    },
    emit<T extends EventType>(topic: T, event: EventEnvelope<T>): void {
      for (const listener of subscribers.get(topic) ?? []) listener(event);
    },
    prompt: vi.fn(),
    interrupt: vi.fn(),
    dequeuePrompt: vi.fn(),
    requeuePrompt: vi.fn(),
    execute: vi.fn(async <T extends CommandName>(command: Command<T>): Promise<CommandResult<T>> => {
      trace.push({ kind: "execute", commandName: command.name });
      return dispatch(command) as CommandResult<T>;
    }),
    teams: () => [],
    shutdown: vi.fn(),
  };
  return fake;
}

function dispatch(command: Command<CommandName>): CommandResult<CommandName> | null {
  switch (command.name) {
    case "setApiKey":
      throw new Error("setApiKey boom");
    case "getGitStatus":
      return { branch: "test-branch", dirty: true, ahead: 0, behind: 0 };
    case "getDefaultModel":
      return { provider: "anthropic", id: "claude-sonnet-4-5", effort: "off", contextWindow: null };
    case "team": {
      const teamId = command.teamId ?? "default-solo";
      const team: TeamInfo = {
        id: teamId,
        leaderKey: "general-1",
        sessionName: null,
        currentSessionId: null,
        kanbanCards: [],
        history: [],
        agents: [{
          teamId,
          role: "general",
          agentKey: "general-1",
          isLeader: true,
          tools: [],
          subscribe: [],
          skills: [],
          model: null,
        }],
      };
      return team;
    }
    default:
      return null;
  }
}

interface CapturedRun {
  fakePlatform: FakePlatform;
  bootPlatform: ReturnType<typeof vi.fn>;
  runFirstRun: ReturnType<typeof vi.fn>;
  tuiCalls: { options: CreateTUIOptions; deps: TuiDeps }[];
  startCalls: { value: number };
  stopCalls: { value: number };
  consoleMock: Console;
  run: (parsed: Parameters<typeof _run>[0]) => Promise<number>;
}

function captureRun(platform: FakePlatform): CapturedRun {
  const tuiCalls: { options: CreateTUIOptions; deps: TuiDeps }[] = [];
  const startCalls = { value: 0 };
  const stopCalls = { value: 0 };
  const consoleMock = makeConsoleMock();
  const bootPlatform = vi.fn(async (_options: JiePlatformOptions): Promise<JiePlatform> => platform);
  const runFirstRun = vi.fn(async (_homeJieDir: string, _noInstall: boolean): Promise<void> => {});
  const bootTui = vi.fn((options: CreateTUIOptions, deps: TuiDeps): Tui => {
    tuiCalls.push({ options, deps });
    deps.platform.subscribe("system.team.loaded", () => undefined);
    deps.platform.subscribe("system.error", () => undefined);
    return {
      start: () => {
        startCalls.value += 1;
        return Promise.resolve();
      },
      stop: () => {
        stopCalls.value += 1;
      },
    };
  });
  const run = (parsed: Parameters<typeof _run>[0]): Promise<number> =>
    _run(parsed, process.cwd(), process.env.HOME ?? "/tmp", { bootPlatform, bootTui, runFirstRun, console: consoleMock });
  return { fakePlatform: platform, bootPlatform, runFirstRun, tuiCalls, startCalls, stopCalls, consoleMock, run };
}

describe("_run — tui", () => {
  test("tui boot: loads team, calls bootTui({cwd},{platform}), awaits start, stops platform, returns 0", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform);
    const exit = await captured.run({ kind: "tui", inMemory: false, debug: false, noInstall: false });
    expect(exit).toBe(0);
    expect(captured.fakePlatform.execute).toHaveBeenCalledWith({ name: "team", teamId: undefined });
    expect(captured.fakePlatform.execute).toHaveBeenCalledWith({ name: "stop" });
    expect(captured.tuiCalls).toHaveLength(1);
    expect(captured.tuiCalls[0]?.options.cwd).toBe(process.cwd());
    expect(captured.tuiCalls[0]?.deps.platform).toBe(platform);
    expect(captured.startCalls.value).toBe(1);
    expect(captured.fakePlatform.shutdown).toHaveBeenCalledTimes(1);
  });

  test("tui boot: calls tui.stop() after start resolves (restores terminal state)", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform);
    const exit = await captured.run({ kind: "tui", inMemory: false, debug: false, noInstall: false });
    expect(exit).toBe(0);
    expect(captured.stopCalls.value).toBe(1);
  });

  test("tui boot: passes args.team to execute({name:'team'})", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform);
    const exit = await captured.run({ kind: "tui", team: "alpha", inMemory: false, debug: false, noInstall: false });
    expect(exit).toBe(0);
    expect(captured.fakePlatform.execute).toHaveBeenCalledWith({ name: "team", teamId: "alpha" });
  });

  test("tui boot with resume: passes resumeSessionId in bootPlatform options", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform);
    const exit = await captured.run({ kind: "tui", resume: "sess-1", inMemory: false, debug: false, noInstall: false });
    expect(exit).toBe(0);
    expect(captured.bootPlatform.mock.calls[0]?.[0]).toMatchObject({ resumeSessionId: "sess-1" });
  });

  test("tui boot: subscribes to system.error before dispatching", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform);
    await captured.run({ kind: "tui", inMemory: false, debug: false, noInstall: false });
    expect(platform.subscribeCalls).toContain("system.error");
  });

  test("tui boot: TUI subscribes BEFORE execute({name:'team'}) so system.team.loaded reaches the TUI", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform);
    await captured.run({ kind: "tui", inMemory: false, debug: false, noInstall: false });
    const teamExecuteIndex = platform.trace.findIndex(
      (e) => e.kind === "execute" && e.commandName === "team",
    );
    expect(teamExecuteIndex).toBeGreaterThanOrEqual(0);
    const subscribedBeforeTeam = platform.trace
      .slice(0, teamExecuteIndex)
      .filter((e): e is { kind: "subscribe"; topic: EventType } => e.kind === "subscribe")
      .some((e) => e.topic === "system.team.loaded");
    expect(subscribedBeforeTeam).toBe(true);
  });

  test("tui boot: passes git branch and dirty flag from the git snapshot to bootTui", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform);
    const exit = await captured.run({ kind: "tui", inMemory: false, debug: false, noInstall: false });
    expect(exit).toBe(0);
    expect(captured.tuiCalls[0]?.deps.gitBranch).toBe("test-branch");
    expect(captured.tuiCalls[0]?.deps.gitDirty).toBe(true);
  });

  test("tui boot: propagates bootPlatform failure via thrown error", async () => {
    const platform = makeFakePlatform();
    const consoleMock = makeConsoleMock();
    const run = (parsed: Parameters<typeof _run>[0]): Promise<number> =>
      _run(parsed, process.cwd(), "/tmp", {
        bootPlatform: async () => {
          throw new Error("boot blew up");
        },
        bootTui: vi.fn(),
        runFirstRun: vi.fn(),
        console: consoleMock,
      });
    expect(run({ kind: "tui", inMemory: false, debug: false, noInstall: false })).rejects.toThrow("boot blew up");
    expect(platform.execute).not.toHaveBeenCalledWith({ name: "stop" });
  });

  test("tui boot: triggers first-run welcome with homeJieDir and noInstall before platform boot", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform);
    await captured.run({ kind: "tui", inMemory: false, debug: false, noInstall: true });
    expect(captured.runFirstRun).toHaveBeenCalledTimes(1);
    expect(captured.runFirstRun.mock.calls[0]?.[0]).toBe(join(process.env.HOME ?? "/tmp", ".jie"));
    expect(captured.runFirstRun.mock.calls[0]?.[1]).toBe(true);
    const firstRunIndex = captured.bootPlatform.mock.invocationCallOrder[0]!;
    const runFirstRunIndex = captured.runFirstRun.mock.invocationCallOrder[0]!;
    expect(runFirstRunIndex).toBeLessThan(firstRunIndex);
  });

  test("print mode: skips first-run welcome (non-interactive)", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform);
    await captured.run({
      kind: "print",
      instruction: "hello",
      timeout: 0.05,
      json: false,
      inMemory: false,
      debug: false,
    });
    expect(captured.runFirstRun).not.toHaveBeenCalled();
  });
});

describe("_run — error/help/version bypass boot", () => {
  test("error kind -> prints message, exit 1, no platform boot", async () => {
    const bootPlatform = vi.fn();
    const consoleMock = makeConsoleMock();
    const exit = await _run(
      { kind: "error", message: "bad flag" },
      process.cwd(),
      "/tmp",
      { bootPlatform, bootTui: vi.fn(), runFirstRun: vi.fn(), console: consoleMock },
    );
    expect(exit).toBe(1);
    expect(bootPlatform).not.toHaveBeenCalled();
    expect(consoleMock.error).toHaveBeenCalledWith("bad flag");
  });

  test("version kind -> prints version, exit 0, no platform boot", async () => {
    const bootPlatform = vi.fn();
    const consoleMock = makeConsoleMock();
    const exit = await _run(
      { kind: "version" },
      process.cwd(),
      "/tmp",
      { bootPlatform, bootTui: vi.fn(), runFirstRun: vi.fn(), console: consoleMock },
    );
    expect(exit).toBe(0);
    expect(bootPlatform).not.toHaveBeenCalled();
    expect(consoleMock.print.mock.calls[0]?.[0]).toMatch(/^jie /);
  });

  test("help kind -> prints usage listing the main commands, exit 0, no platform boot", async () => {
    const bootPlatform = vi.fn();
    const consoleMock = makeConsoleMock();
    const exit = await _run(
      { kind: "help" },
      process.cwd(),
      "/tmp",
      { bootPlatform, bootTui: vi.fn(), runFirstRun: vi.fn(), console: consoleMock },
    );
    expect(exit).toBe(0);
    expect(bootPlatform).not.toHaveBeenCalled();
    const text = consoleMock.print.mock.calls[0]?.[0] ?? "";
    expect(text).toContain("-p");
    expect(text).toContain("--print");
    expect(text).toContain("login");
    expect(text).toContain("model");
    expect(text).toContain("team");
  });
});

describe("_run — print + apiKey", () => {
  test("print without apiKey -> calls execute({name:'team'}), dispatches to runPrint (returns 3 on fake timeout)", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform);
    const exit = await captured.run({
      kind: "print",
      instruction: "hello",
      team: "default-solo",
      timeout: 0.05,
      json: false,
      inMemory: false,
      debug: false,
    });
    expect(exit).toBe(3);
    expect(captured.fakePlatform.execute).toHaveBeenCalledWith({ name: "team", teamId: "default-solo" });
    expect(captured.fakePlatform.execute).toHaveBeenCalledWith({ name: "stop" });
    expect(captured.fakePlatform.shutdown).toHaveBeenCalledTimes(1);
  });

  test("print: shutdown waits until the command settles, never tearing down mid-command", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform);
    const runPromise = captured.run({
      kind: "print",
      instruction: "hello",
      team: "default-solo",
      timeout: 0,
      json: false,
      inMemory: false,
      debug: false,
    });
    while (!platform.subscribeCalls.includes("agent.idle")) await Bun.sleep(1);
    expect(platform.shutdown).not.toHaveBeenCalled();
    platform.emit("agent.idle", Events.agentIdle({ kind: "agent", teamId: "default-solo", agentKey: "general-1" }, "stop"));
    const exit = await runPromise;
    expect(exit).toBe(0);
    expect(platform.execute).toHaveBeenCalledWith({ name: "stop" });
    expect(platform.shutdown).toHaveBeenCalledTimes(1);
  });

  test("print with resume: passes resumeSessionId in bootPlatform options", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform);
    await captured.run({
      kind: "print",
      instruction: "hello",
      timeout: 0.05,
      json: false,
      resume: "sess-1",
      inMemory: false,
      debug: false,
    });
    expect(captured.bootPlatform.mock.calls[0]?.[0]).toMatchObject({ resumeSessionId: "sess-1" });
  });

  test("print with failing setApiKey -> stops platform, returns 1", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform);
    const exit = await captured.run({
      kind: "print",
      instruction: "hello",
      timeout: 0.05,
      json: false,
      apiKey: "sk-fail",
      inMemory: false,
      debug: false,
    });
    expect(exit).toBe(1);
    expect(captured.fakePlatform.execute).toHaveBeenCalledWith({ name: "setApiKey", apiKey: "sk-fail" });
    expect(captured.fakePlatform.execute).toHaveBeenCalledWith({ name: "stop" });
    expect(captured.fakePlatform.shutdown).toHaveBeenCalledTimes(1);
    expect(captured.consoleMock.error).toHaveBeenCalledWith("setApiKey boom");
  });
});

describe("_run — dispatch to command handlers", () => {
  test("login dispatches to runLogin (execute login command)", async () => {
    const platform = makeFakePlatform();
    platform.execute.mockImplementation(async (cmd: { name: string } & Record<string, unknown>) => {
      if (cmd.name === "login") return null;
      return null;
    });
    const captured = captureRun(platform);
    const exit = await captured.run({ kind: "login", provider: "anthropic", apiKey: "sk-x" });
    expect(exit).toBe(0);
    expect(captured.fakePlatform.execute).toHaveBeenCalledWith({ name: "login", provider: "anthropic", apiKey: "sk-x" });
    expect(captured.consoleMock.print).toHaveBeenCalledWith("logged in to anthropic");
  });

  test("logout dispatches to runLogout", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform);
    const exit = await captured.run({ kind: "logout", provider: "anthropic" });
    expect(exit).toBe(0);
    expect(captured.fakePlatform.execute).toHaveBeenCalledWith({ name: "logout", provider: "anthropic" });
    expect(captured.consoleMock.print).toHaveBeenCalledWith("logged out of anthropic");
  });

  test("apiKey dispatches to runApiKey which reads default model then logs in", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform);
    const exit = await captured.run({ kind: "apiKey", apiKey: "sk-y" });
    expect(exit).toBe(0);
    expect(captured.fakePlatform.execute).toHaveBeenCalledWith({ name: "getDefaultModel" });
    expect(captured.fakePlatform.execute).toHaveBeenCalledWith({ name: "login", provider: "anthropic", apiKey: "sk-y" });
    expect(captured.consoleMock.print).toHaveBeenCalledWith("logged in to anthropic");
  });

  test("model dispatches to runModel which calls setDefaultModel", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform);
    const exit = await captured.run({ kind: "model", provider: "anthropic", modelId: "claude-sonnet-4-5" });
    expect(exit).toBe(0);
    expect(captured.fakePlatform.execute).toHaveBeenCalledWith({ name: "setDefaultModel", provider: "anthropic", id: "claude-sonnet-4-5" });
    expect(captured.consoleMock.print).toHaveBeenCalledWith("default model set to anthropic/claude-sonnet-4-5");
  });

  test("team with id dispatches to runTeam which calls setDefaultTeam", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform);
    const exit = await captured.run({ kind: "team", action: "setDefault", teamId: "default-solo" });
    expect(exit).toBe(0);
    expect(captured.fakePlatform.execute).toHaveBeenCalledWith({ name: "setDefaultTeam", teamId: "default-solo" });
    expect(captured.consoleMock.print).toHaveBeenCalledWith("default team set to 'default-solo'");
  });
});
