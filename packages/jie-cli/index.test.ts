
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
  EventEnvelope,
  EventType,
  JiePlatform,
  JiePlatformOptions,
  TeamIdentity,
} from "@cuzfrog/jie-platform";
import type { CreateTUIOptions, Tui, TuiDeps } from "@cuzfrog/jie-tui";
import { _run } from ".";
import { main } from ".";

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

async function runInIsolatedHome(argv: string[], options: RunOptions = {}): Promise<RunResult> {
  const homeDir = mkdtempSync(join(tmpdir(), "jie-cli-main-"));
  mkdirSync(join(homeDir, ".jie"), { recursive: true });
  options.pre?.(homeDir);
  const prevCwd = process.cwd();
  const prevHome = process.env.HOME;
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  const logSpy = vi.spyOn(console, "log").mockImplementation((...args: Parameters<typeof console.log>) => {
    stdoutLines.push(args.map(String).join(" "));
  });
  const errSpy = vi.spyOn(console, "error").mockImplementation((...args: Parameters<typeof console.error>) => {
    stderrLines.push(args.map(String).join(" "));
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
      main(argv),
      new Promise<number>((resolve) => setTimeout(() => resolve(-1), 2000)),
    ]);
    if (exit === -1) stderrLines.push("[timeout] main did not return within 2s");
  } catch (error) {
    exit = 1;
    stderrLines.push(error instanceof Error ? error.message : String(error));
  }
  try {
    const capture: Capture = { exit, stdout: stdoutLines.join("\n"), stderr: stderrLines.join("\n") };
    return { capture, readHomeFile, cleanup };
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
  }
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

interface FakePlatform {
  handle: JiePlatform;
  execute: ReturnType<typeof vi.fn>;
  subscribeCalls: EventType[];
}

function makeFakePlatform(): FakePlatform {
  const subscribeCalls: EventType[] = [];
  const execute = vi.fn(async (cmd: { name: string } & Record<string, unknown>): Promise<unknown> => {
    if (cmd.name === "setApiKey") throw new Error("setApiKey boom");
    if (cmd.name === "getDefaultModel") return { provider: "anthropic", modelId: "claude-sonnet-4-5" };
    if (cmd.name === "team") {
      const teamId = (cmd as { teamId?: string }).teamId ?? "minimal";
      return {
        id: teamId,
        leaderKey: "general-1",
        agents: [{
          teamId,
          role: "general",
          agentKey: "general-1",
          isLeader: true,
        }],
      } satisfies TeamIdentity;
    }
    return null;
  });
  const handle = {
    settings: {},
    subscribe: <T extends EventType>(topic: T, _cb: (event: EventEnvelope<T>) => void) => {
      subscribeCalls.push(topic);
      return () => undefined;
    },
    prompt: vi.fn(),
    interrupt: vi.fn(),
    execute: execute as unknown as JiePlatform["execute"],
  } as unknown as JiePlatform;
  return { handle, execute, subscribeCalls };
}

interface CapturedRun {
  fakePlatform: FakePlatform;
  tuiCalls: { options: CreateTUIOptions; deps: TuiDeps }[];
  startCalls: { value: number };
  run: (parsed: Parameters<typeof _run>[0]) => Promise<number>;
}

function captureRun(platform: JiePlatform): CapturedRun {
  const fakePlatform = platform as unknown as FakePlatform;
  const tuiCalls: { options: CreateTUIOptions; deps: TuiDeps }[] = [];
  const startCalls = { value: 0 };
  const createPlatform = vi.fn(async (_opts: JiePlatformOptions): Promise<JiePlatform> => platform);
  const createTui = vi.fn((options: CreateTUIOptions, deps: TuiDeps): Tui => {
    tuiCalls.push({ options, deps });
    const tui: Tui = {
      state: {
        teamId: null,
        leaderAgentId: null,
        focusedAgentId: null,
        agents: new Map(),
        showTeamRailPanel: false,
        pendingQuit: false,
        transientMessage: null,
        errorBanner: null,
      },
      submit: () => undefined,
      start: () => {
        startCalls.value += 1;
        return Promise.resolve();
      },
      stop: () => undefined,
    };
    return tui;
  });
  const run = (parsed: Parameters<typeof _run>[0]): Promise<number> => _run(parsed, process.cwd(), process.env.HOME ?? "/tmp", { createPlatform, createTui });
  return { fakePlatform, tuiCalls, startCalls, run };
}

describe("_run — tui", () => {
  test("tui boot: loads team, calls createTui({cwd},{platform}), awaits start, stops platform, returns 0", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform.handle);
    const exit = await captured.run({ kind: "tui" });
    expect(exit).toBe(0);
    expect(captured.fakePlatform.execute).toHaveBeenCalledWith({ name: "team", teamId: undefined });
    expect(captured.fakePlatform.execute).toHaveBeenCalledWith({ name: "stop" });
    expect(captured.tuiCalls).toHaveLength(1);
    expect(captured.tuiCalls[0]?.options.cwd).toBe(process.cwd());
    expect(captured.tuiCalls[0]?.deps.platform).toBe(platform.handle);
    expect(captured.startCalls.value).toBe(1);
  });

  test("tui boot: passes args.team to execute({name:'team'})", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform.handle);
    const exit = await captured.run({ kind: "tui", team: "alpha" });
    expect(exit).toBe(0);
    expect(captured.fakePlatform.execute).toHaveBeenCalledWith({ name: "team", teamId: "alpha" });
  });

  test("tui boot: subscribes to system.error before dispatching", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform.handle);
    await captured.run({ kind: "tui" });
    expect(platform.subscribeCalls).toContain("system.error");
  });

  test("tui boot: propagates createPlatform rejection via thrown error", async () => {
    const platform = makeFakePlatform();
    const run = (parsed: Parameters<typeof _run>[0]): Promise<number> =>
      _run(parsed, process.cwd(), "/tmp", {
        createPlatform: () => Promise.reject(new Error("boot blew up")),
        createTui: vi.fn(),
      });
    expect(run({ kind: "tui" })).rejects.toThrow("boot blew up");
    expect(platform.execute).not.toHaveBeenCalledWith({ name: "stop" });
  });
});

describe("_run — error/help/version bypass boot", () => {
  test("error kind -> prints message, exit 1, no platform boot", async () => {
    let platformBoots = 0;
    const platform = makeFakePlatform();
    const run = (parsed: Parameters<typeof _run>[0]): Promise<number> =>
      _run(parsed, process.cwd(), "/tmp", {
        createPlatform: () => {
          platformBoots += 1;
          return Promise.resolve(platform.handle);
        },
        createTui: vi.fn(),
      });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const exit = await run({ kind: "error", message: "bad flag" });
      expect(exit).toBe(1);
      expect(platformBoots).toBe(0);
    } finally {
      errSpy.mockRestore();
    }
  });

  test("version kind -> prints version, exit 0, no platform boot", async () => {
    let platformBoots = 0;
    const platform = makeFakePlatform();
    const run = (parsed: Parameters<typeof _run>[0]): Promise<number> =>
      _run(parsed, process.cwd(), "/tmp", {
        createPlatform: () => {
          platformBoots += 1;
          return Promise.resolve(platform.handle);
        },
        createTui: vi.fn(),
      });
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const exit = await run({ kind: "version" });
      expect(exit).toBe(0);
      expect(platformBoots).toBe(0);
    } finally {
      logSpy.mockRestore();
    }
  });
});

describe("_run — print + apiKey", () => {
  test("print without apiKey -> calls execute({name:'team'}), dispatches to runPrint (returns 3 on fake timeout)", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform.handle);
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
    const captured = captureRun(platform.handle);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
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
    } finally {
      errSpy.mockRestore();
    }
  });
});

describe("_run — dispatch to command handlers", () => {
  test("login dispatches to runLogin (execute login command)", async () => {
    const platform = makeFakePlatform();
    platform.execute.mockImplementation(async (cmd: { name: string } & Record<string, unknown>) => {
      if (cmd.name === "login") return null;
      return null;
    });
    const captured = captureRun(platform.handle);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const exit = await captured.run({ kind: "login", provider: "anthropic", apiKey: "sk-x" });
      expect(exit).toBe(0);
      expect(captured.fakePlatform.execute).toHaveBeenCalledWith({ name: "login", provider: "anthropic", apiKey: "sk-x" });
    } finally {
      logSpy.mockRestore();
    }
  });

  test("logout dispatches to runLogout", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform.handle);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const exit = await captured.run({ kind: "logout", provider: "anthropic" });
      expect(exit).toBe(0);
      expect(captured.fakePlatform.execute).toHaveBeenCalledWith({ name: "logout", provider: "anthropic" });
    } finally {
      logSpy.mockRestore();
    }
  });

  test("apiKey dispatches to runApiKey which reads default model then logs in", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform.handle);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const exit = await captured.run({ kind: "apiKey", apiKey: "sk-y" });
      expect(exit).toBe(0);
      expect(captured.fakePlatform.execute).toHaveBeenCalledWith({ name: "getDefaultModel" });
      expect(captured.fakePlatform.execute).toHaveBeenCalledWith({ name: "login", provider: "anthropic", apiKey: "sk-y" });
    } finally {
      logSpy.mockRestore();
    }
  });

  test("model dispatches to runModel which calls setDefaultModel", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform.handle);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const exit = await captured.run({ kind: "model", provider: "anthropic", modelId: "claude-sonnet-4-5" });
      expect(exit).toBe(0);
      expect(captured.fakePlatform.execute).toHaveBeenCalledWith({ name: "setDefaultModel", provider: "anthropic", modelId: "claude-sonnet-4-5" });
    } finally {
      logSpy.mockRestore();
    }
  });

  test("team with id dispatches to runTeam which calls setDefaultTeam", async () => {
    const platform = makeFakePlatform();
    const captured = captureRun(platform.handle);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const exit = await captured.run({ kind: "team", teamId: "minimal" });
      expect(exit).toBe(0);
      expect(captured.fakePlatform.execute).toHaveBeenCalledWith({ name: "setDefaultTeam", teamId: "minimal" });
    } finally {
      logSpy.mockRestore();
    }
  });
});
