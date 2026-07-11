import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  Command,
  CommandName,
  CommandResult,
  Console,
  EventEnvelope,
  EventType,
  JiePlatform,
  JiePlatformOptions,
  TeamInfo,
} from "@cuzfrog/jie-platform";
import type { CreateTUIOptions, Tui, TuiDeps } from "@cuzfrog/jie-tui";
import { _run, main } from ".";

interface Capture {
  exit: number;
  stdout: string;
  stderr: string;
}

interface RunOptions {
  pre?: (homeDir: string) => void;
}

interface RunResult {
  capture: Capture;
  readHomeFile: (relative: string) => string | null;
  cleanup: () => void;
}

function makeConsoleMock(): Console & {
  print: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
} {
  return {
    print: vi.fn(),
    error: vi.fn(),
  };
}

async function runInIsolatedHome(argv: string[], options: RunOptions = {}): Promise<RunResult> {
  const homeDir = mkdtempSync(join(tmpdir(), "jie-cli-main-"));
  mkdirSync(join(homeDir, ".jie"), { recursive: true });
  options.pre?.(homeDir);
  const prevCwd = process.cwd();
  const prevHome = process.env.HOME;
  const consoleMock = makeConsoleMock();
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  consoleMock.print.mockImplementation((...args: ReadonlyArray<string>) => {
    stdoutLines.push(args.join(" "));
  });
  consoleMock.error.mockImplementation((...args: ReadonlyArray<string>) => {
    stderrLines.push(args.join(" "));
  });
  process.chdir(homeDir);
  process.env.HOME = homeDir;
  const readHomeFile = (relative: string): string | null => {
    const path = join(homeDir, relative);
    if (!existsSync(path)) return null;
    return readFileSync(path, "utf-8");
  };
  const cleanup = (): void => {
    process.chdir(prevCwd);
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    rmSync(homeDir, { recursive: true, force: true });
  };
  let exit = 0;
  try {
    exit = await Promise.race([
      main(argv, homeDir, consoleMock),
      new Promise<number>((resolve) => setTimeout(() => resolve(-1), 2000)),
    ]);
    if (exit === -1) stderrLines.push("[timeout] main did not return within 2s");
  } catch (error) {
    exit = 1;
    stderrLines.push(error instanceof Error ? error.message : String(error));
  }
  const capture: Capture = { exit, stdout: stdoutLines.join("\n"), stderr: stderrLines.join("\n") };
  return { capture, readHomeFile, cleanup };
}

describe("jie --version", () => {
  test("--version -> exit 0, stdout starts with 'jie '", async () => {
    const r = await runInIsolatedHome(["--version"]);
    try {
      expect(r.capture.exit).toBe(0);
      expect(r.capture.stdout).toMatch(/^jie /);
    } finally {
      r.cleanup();
    }
  });
});

describe("jie --help", () => {
  test("--help -> exit 0, stdout lists -p, --print, login, model, team", async () => {
    const r = await runInIsolatedHome(["--help"]);
    try {
      expect(r.capture.exit).toBe(0);
      expect(r.capture.stdout).toContain("-p");
      expect(r.capture.stdout).toContain("--print");
      expect(r.capture.stdout).toContain("login");
      expect(r.capture.stdout).toContain("model");
      expect(r.capture.stdout).toContain("team");
    } finally {
      r.cleanup();
    }
  });
});

describe("jie --api-key (top-level, integration)", () => {
  test("with defaultProvider -> writes auth.json and exits 0", async () => {
    const r = await runInIsolatedHome(["--api-key", "sk-new"], {
      pre: (homeDir) => {
        writeFileSync(
          join(homeDir, ".jie", "settings.json"),
          JSON.stringify({ defaultProvider: "anthropic", defaultModel: "claude-sonnet-4" }),
        );
      },
    });
    try {
      expect(r.capture.exit).toBe(0);
      const authText = r.readHomeFile(".jie/auth.json");
      if (authText === null) throw new Error("auth.json was not written");
      expect(JSON.parse(authText)).toEqual({ anthropic: { type: "api_key", key: "sk-new" } });
    } finally {
      r.cleanup();
    }
  });
});

interface FakePlatform extends JiePlatform {
  execute: ReturnType<typeof vi.fn>;
  subscribeCalls: EventType[];
  trace: TraceEvent[];
}

type TraceEvent =
  | { readonly kind: "subscribe"; readonly topic: EventType }
  | { readonly kind: "execute"; readonly commandName: string };

function makeFakePlatform(): FakePlatform {
  const subscribeCalls: EventType[] = [];
  const trace: TraceEvent[] = [];
  const fake: FakePlatform = {
    settings: {},
    subscribeCalls,
    trace,
    subscribe<T extends EventType>(topic: T, _cb: (event: EventEnvelope<T>) => void): () => void {
      subscribeCalls.push(topic);
      trace.push({ kind: "subscribe", topic });
      return () => undefined;
    },
    prompt: vi.fn(),
    interrupt: vi.fn(),
    execute: vi.fn(async <T extends CommandName>(command: Command<T>): Promise<CommandResult<T>> => {
      trace.push({ kind: "execute", commandName: command.name });
      return dispatch(command) as CommandResult<T>;
    }),
    teams: () => [],
  };
  return fake;
}

function dispatch(command: Command<CommandName>): CommandResult<CommandName> | null {
  switch (command.name) {
    case "setApiKey":
      throw new Error("setApiKey boom");
    case "getDefaultModel":
      return { provider: "anthropic", id: "claude-sonnet-4-5", effort: "off" };
    case "team": {
      const teamId = command.teamId ?? "minimal";
      const team: TeamInfo = {
        id: teamId,
        leaderKey: "general-1",
        agents: [{
          teamId,
          role: "general",
          agentKey: "general-1",
          isLeader: true,
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
  const createPlatform = vi.fn(async (_opts: JiePlatformOptions): Promise<JiePlatform> => platform);
  const createTui = vi.fn((options: CreateTUIOptions, deps: TuiDeps): Tui => {
    tuiCalls.push({ options, deps });
    deps.platform.subscribe("system.team.loaded", () => undefined);
    deps.platform.subscribe("system.error", () => undefined);
    const tui: Tui = {
      state: {
        cwd: null,
        gitBranch: null,
        gitDirty: false,
        teamId: null,
        leaderAgentId: null,
        focusedAgentId: null,
        agents: new Map(),
        showTeamRailPanel: false,
        thinkingExpanded: false,
        toolCardsExpanded: false,
        pendingQuit: false,
        transientMessage: null,
        errorBanner: null,
        editorText: "",
      },
      start: () => {
        startCalls.value += 1;
        return Promise.resolve();
      },
      stop: () => {
        stopCalls.value += 1;
      },
    };
    return tui;
  });
  const run = (parsed: Parameters<typeof _run>[0]): Promise<number> =>
    _run(parsed, process.cwd(), process.env.HOME ?? "/tmp", { createPlatform, createTui, console: consoleMock });
  return { fakePlatform: platform, tuiCalls, startCalls, stopCalls, consoleMock, run };
}

describe("_run — tui", () => {
  test("tui boot: loads team, calls createTui({cwd},{platform}), awaits start, stops platform, returns 0", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform);
    const exit = await captured.run({ kind: "tui" });
    expect(exit).toBe(0);
    expect(captured.fakePlatform.execute).toHaveBeenCalledWith({ name: "team", teamId: undefined });
    expect(captured.fakePlatform.execute).toHaveBeenCalledWith({ name: "stop" });
    expect(captured.tuiCalls).toHaveLength(1);
    expect(captured.tuiCalls[0]?.options.cwd).toBe(process.cwd());
    expect(captured.tuiCalls[0]?.deps.platform).toBe(platform);
    expect(captured.startCalls.value).toBe(1);
  });

  test("tui boot: calls tui.stop() after start resolves (restores terminal state)", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform);
    const exit = await captured.run({ kind: "tui" });
    expect(exit).toBe(0);
    expect(captured.stopCalls.value).toBe(1);
  });

  test("tui boot: passes args.team to execute({name:'team'})", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform);
    const exit = await captured.run({ kind: "tui", team: "alpha" });
    expect(exit).toBe(0);
    expect(captured.fakePlatform.execute).toHaveBeenCalledWith({ name: "team", teamId: "alpha" });
  });

  test("tui boot: subscribes to system.error before dispatching", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform);
    await captured.run({ kind: "tui" });
    expect(platform.subscribeCalls).toContain("system.error");
  });

  test("tui boot: TUI subscribes BEFORE execute({name:'team'}) so system.team.loaded reaches the TUI", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform);
    await captured.run({ kind: "tui" });
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

  test("tui boot: propagates createPlatform rejection via thrown error", async () => {
    const platform = makeFakePlatform();
    const consoleMock = makeConsoleMock();
    const run = (parsed: Parameters<typeof _run>[0]): Promise<number> =>
      _run(parsed, process.cwd(), "/tmp", {
        createPlatform: () => Promise.reject(new Error("boot blew up")),
        createTui: vi.fn(),
        console: consoleMock,
      });
    expect(run({ kind: "tui" })).rejects.toThrow("boot blew up");
    expect(platform.execute).not.toHaveBeenCalledWith({ name: "stop" });
  });
});

describe("_run — error/help/version bypass boot", () => {
  test("error kind -> prints message, exit 1, no platform boot", async () => {
    let platformBoots = 0;
    const platform = makeFakePlatform();
    const consoleMock = makeConsoleMock();
    const run = (parsed: Parameters<typeof _run>[0]): Promise<number> =>
      _run(parsed, process.cwd(), "/tmp", {
        createPlatform: () => {
          platformBoots += 1;
          return Promise.resolve(platform);
        },
        createTui: vi.fn(),
        console: consoleMock,
      });
    const exit = await run({ kind: "error", message: "bad flag" });
    expect(exit).toBe(1);
    expect(platformBoots).toBe(0);
    expect(consoleMock.error).toHaveBeenCalledWith("bad flag");
  });

  test("version kind -> prints version, exit 0, no platform boot", async () => {
    let platformBoots = 0;
    const platform = makeFakePlatform();
    const consoleMock = makeConsoleMock();
    const run = (parsed: Parameters<typeof _run>[0]): Promise<number> =>
      _run(parsed, process.cwd(), "/tmp", {
        createPlatform: () => {
          platformBoots += 1;
          return Promise.resolve(platform);
        },
        createTui: vi.fn(),
        console: consoleMock,
      });
    const exit = await run({ kind: "version" });
    expect(exit).toBe(0);
    expect(platformBoots).toBe(0);
    expect(consoleMock.print.mock.calls[0]?.[0]).toMatch(/^jie /);
  });
});

describe("_run — print + apiKey", () => {
  test("print without apiKey -> calls execute({name:'team'}), dispatches to runPrint (returns 3 on fake timeout)", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform);
    const exit = await captured.run({
      kind: "print",
      instruction: "hello",
      team: "minimal",
      timeout: 1,
      json: false,
    });
    expect(exit).toBe(3);
    expect(captured.fakePlatform.execute).toHaveBeenCalledWith({ name: "team", teamId: "minimal" });
    expect(captured.fakePlatform.execute).toHaveBeenCalledWith({ name: "stop" });
  });

  test("print with failing setApiKey -> stops platform, returns 1", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform);
    const exit = await captured.run({
      kind: "print",
      instruction: "hello",
      timeout: 1,
      json: false,
      apiKey: "sk-fail",
    });
    expect(exit).toBe(1);
    expect(captured.fakePlatform.execute).toHaveBeenCalledWith({ name: "setApiKey", apiKey: "sk-fail" });
    expect(captured.fakePlatform.execute).toHaveBeenCalledWith({ name: "stop" });
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
    expect(captured.fakePlatform.execute).toHaveBeenCalledWith({ name: "setDefaultModel", provider: "anthropic", id: "claude-sonnet-4-5", effort: "off" });
    expect(captured.consoleMock.print).toHaveBeenCalledWith("default model set to anthropic/claude-sonnet-4-5");
  });

  test("team with id dispatches to runTeam which calls setDefaultTeam", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform);
    const exit = await captured.run({ kind: "team", teamId: "minimal" });
    expect(exit).toBe(0);
    expect(captured.fakePlatform.execute).toHaveBeenCalledWith({ name: "setDefaultTeam", teamId: "minimal" });
    expect(captured.consoleMock.print).toHaveBeenCalledWith("default team set to 'minimal'");
  });
});