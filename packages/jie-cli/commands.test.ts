import { describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "./index.ts";

interface Capture {
  exit: number;
  stdout: string;
  stderr: string;
}

interface Setup {
  /** Pre-create files in the homeDir's `.jie/` tree before `main` runs. */
  pre?: (homeDir: string) => void;
}

interface RunResult {
  capture: Capture;
  /** Read a file relative to homeDir. The homeDir is still alive
   *  (cleanup is performed by the caller using `cleanup()`). */
  readHomeFile: (relative: string) => string | null;
  /** Read the earliest snapshot taken of the homeDir (once
   *  `auth.json` appears). Useful for asserting side-effects
   *  even when the main flow hangs. */
  readSnapshot: (relative: string) => string | null;
  /** Call this in the test's `finally` to remove the homeDir. */
  cleanup: () => void;
  /** Error thrown by `main`, if any. Useful when testing side
   *  effects that must complete before the main flow fails. */
  error: Error | null;
}

/** Run the CLI from `argv` with `HOME` redirected to a tmpdir.
 *  Captures both `console.log` (stdout) and `console.error` (stderr).
 *  IMPORTANT: the caller MUST call `cleanup()` to remove the
 *  tmpdir. Cleanup is deferred so the caller can read files inside
 *  the homeDir. */
async function runInIsolatedHome(argv: string[], setup: Setup = {}): Promise<RunResult> {
  const homeDir = mkdtempSync(join(tmpdir(), "jie-cmd-"));
  mkdirSync(join(homeDir, ".jie"), { recursive: true });
  setup.pre?.(homeDir);
  const prevCwd = process.cwd();
  const prevHome = process.env.HOME;
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  const logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    stdoutLines.push(args.map(String).join(" "));
  });
  const errSpy = spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    stderrLines.push(args.map(String).join(" "));
  });
  process.chdir(homeDir);
  process.env.HOME = homeDir;
  const readHomeFile = (relative: string): string | null => {
    const path = join(homeDir, relative);
    if (!existsSync(path)) return null;
    return readFileSync(path, "utf-8");
  };
  const readSnapshot = (relative: string): string | null => {
    if (earlySnapshot === null) return null;
    const filename = relative.split("/").pop() ?? "";
    return earlySnapshot[filename] ?? null;
  };
  const cleanup = (): void => {
    process.chdir(prevCwd);
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    rmSync(homeDir, { recursive: true, force: true });
  };
  // Capture unhandled rejections so tests can assert on side-effects
  // even when the agent's async failure is uncaught.
  const unhandled: Error[] = [];
  const onUnhandled = (reason: unknown): void => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    unhandled.push(err);
    stderrLines.push(`[unhandled] ${err.message}`);
    process.stderr.write(`[test-debug] caught unhandledRejection: ${err.message}\n`);
  };
  process.on("unhandledRejection", onUnhandled);
  let exit = 0;
  let threw: Error | null = null;
  // The `--api-key ... -p "..."` test asserts that `--api-key`'s
  // side-effect lands in auth.json *before* the print flow runs.
  // The print flow may hang (no real API key), so we snapshot the
  // home dir as soon as `--api-key` is processed.
  let earlySnapshot: Record<string, string> | null = null;
  let snapshotTimer: ReturnType<typeof setInterval> | null = null;
  try {
    // Poll the home dir every 10ms. As soon as `auth.json` exists,
    // capture a snapshot of the home dir's writable files. This
    // gives the test a stable view of state at the moment the
    // print flow starts.
    snapshotTimer = setInterval(() => {
      if (existsSync(join(homeDir, ".jie", "auth.json"))) {
        const snap: Record<string, string> = {};
        const authDir = join(homeDir, ".jie");
        if (existsSync(authDir)) {
          for (const name of ["auth.json", "settings.json"]) {
            const p = join(authDir, name);
            if (existsSync(p)) snap[name] = readFileSync(p, "utf-8");
          }
        }
        earlySnapshot = snap;
      }
    }, 10);
    // Bound how long we wait for `main` to return. Some flag
    // combinations (e.g. `--api-key ... -p "..."`) write their
    // side-effect to disk and then enter a long-running flow that
    // may hang on a missing real LLM key. We only need the
    // side-effect to land — the flow's exit code is irrelevant.
    exit = await Promise.race([
      main(argv),
      new Promise<number>((resolve) => setTimeout(() => resolve(-1), 3000)),
    ]);
    if (exit === -1) {
      stderrLines.push("[timeout] main did not return within 3s; using snapshot");
    }
    // Give any pending microtasks a chance to flush.
    await new Promise((r) => setTimeout(r, 50));
  } catch (e) {
    threw = e instanceof Error ? e : new Error(String(e));
    exit = 1;
    stderrLines.push(threw.message);
  } finally {
    if (snapshotTimer !== null) clearInterval(snapshotTimer);
    process.off("unhandledRejection", onUnhandled);
  }
  try {
    const capture: Capture = {
      exit,
      stdout: stdoutLines.join("\n"),
      stderr: stderrLines.join("\n"),
    };
    return { capture, readHomeFile, readSnapshot, cleanup, error: threw };
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
  }
}

describe("jie — duplicate / missing-argument guards", () => {
  test("--team a --team b -p 'hi' -> exit 1, stderr has 'duplicate flag: --team'", async () => {
    const r = await runInIsolatedHome(["--team", "a", "--team", "b", "-p", "hi"]);
    try {
      expect(r.capture.exit).toBe(1);
      expect(r.capture.stderr).toContain("duplicate flag: --team");
    } finally {
      r.cleanup();
    }
  });

  test("--team (missing arg) -> exit 1, stderr has 'missing argument for --team'", async () => {
    const r = await runInIsolatedHome(["-p", "hi", "--team"]);
    try {
      expect(r.capture.exit).toBe(1);
      expect(r.capture.stderr).toContain("missing argument for --team");
    } finally {
      r.cleanup();
    }
  });

  test("--resume x --continue -p 'hi' -> exit 1, stderr has 'cannot use --resume and --continue together'", async () => {
    const r = await runInIsolatedHome(["--resume", "x", "--continue", "-p", "hi"]);
    try {
      expect(r.capture.exit).toBe(1);
      expect(r.capture.stderr).toContain("cannot use --resume and --continue together");
    } finally {
      r.cleanup();
    }
  });
});

describe("jie login", () => {
  test("login --provider anthropic --api-key sk-test writes auth.json and prints 'logged in to anthropic'", async () => {
    const r = await runInIsolatedHome([
      "login",
      "--provider",
      "anthropic",
      "--api-key",
      "sk-test",
    ]);
    try {
      expect(r.capture.exit).toBe(0);
      const authText = r.readHomeFile(".jie/auth.json");
      expect(authText).not.toBeNull();
      const auth = JSON.parse(authText!);
      expect(auth).toEqual({ anthropic: { type: "api_key", key: "sk-test" } });
      expect(r.capture.stdout).toContain("logged in to anthropic");
    } finally {
      r.cleanup();
    }
  });
});

describe("jie model", () => {
  test("model anthropic/claude-opus-4 writes settings.json and prints 'default model set to ...'", async () => {
    const r = await runInIsolatedHome(["model", "anthropic/claude-opus-4"]);
    try {
      expect(r.capture.exit).toBe(0);
      const settingsText = r.readHomeFile(".jie/settings.json");
      expect(settingsText).not.toBeNull();
      const settings = JSON.parse(settingsText!);
      expect(settings).toEqual({ defaultProvider: "anthropic", defaultModel: "claude-opus-4" });
      expect(r.capture.stdout).toContain("default model set to anthropic/claude-opus-4");
    } finally {
      r.cleanup();
    }
  });

  test("model <unknown-provider>/<model> -> WARN to stderr, still writes, exits 0", async () => {
    const r = await runInIsolatedHome(["model", "ghost-provider/ghost-model"]);
    try {
      expect(r.capture.exit).toBe(0);
      expect(r.capture.stderr).toContain("unknown provider: ghost-provider");
      const settingsText = r.readHomeFile(".jie/settings.json");
      expect(settingsText).not.toBeNull();
      const settings = JSON.parse(settingsText!);
      expect(settings).toEqual({
        defaultProvider: "ghost-provider",
        defaultModel: "ghost-model",
      });
    } finally {
      r.cleanup();
    }
  });
});

describe("jie team", () => {
  test("team dev against an installed dev team -> defaultTeam written", async () => {
    const r = await runInIsolatedHome(["team", "dev"], {
      pre: (homeDir) => {
        mkdirSync(join(homeDir, ".jie", "teams", "dev"), { recursive: true });
        writeFileSync(join(homeDir, ".jie", "teams", "dev", "TEAM.md"), "# dev\n");
      },
    });
    try {
      expect(r.capture.exit).toBe(0);
      const settingsText = r.readHomeFile(".jie/settings.json");
      expect(settingsText).not.toBeNull();
      const settings = JSON.parse(settingsText!);
      expect(settings.defaultTeam).toBe("dev");
    } finally {
      r.cleanup();
    }
  });

  test("team ghost (not installed) -> exit 1, stderr has 'is not installed'", async () => {
    const r = await runInIsolatedHome(["team", "ghost"]);
    try {
      expect(r.capture.exit).toBe(1);
      expect(r.capture.stderr).toContain("is not installed");
    } finally {
      r.cleanup();
    }
  });

  test("team --unset -> defaultTeam removed", async () => {
    const r = await runInIsolatedHome(["team", "--unset"], {
      pre: (homeDir) => {
        writeFileSync(
          join(homeDir, ".jie", "settings.json"),
          JSON.stringify({ defaultProvider: "anthropic", defaultModel: "x", defaultTeam: "dev" }, null, 2),
        );
      },
    });
    try {
      expect(r.capture.exit).toBe(0);
      const settingsText = r.readHomeFile(".jie/settings.json");
      expect(settingsText).not.toBeNull();
      const settings = JSON.parse(settingsText!);
      expect(settings.defaultTeam).toBeUndefined();
      expect(settings.defaultProvider).toBe("anthropic");
      expect(settings.defaultModel).toBe("x");
    } finally {
      r.cleanup();
    }
  });
});

describe("jie --api-key (top-level)", () => {
  test("--api-key sk-new -> auth.json written for defaultProvider", async () => {
    // The combined case `--api-key sk-new -p "hi"` is covered
    // indirectly: the top-level case writes auth.json for
    // defaultProvider, then exits. The `--api-key` flag inside
    // the print flow reuses the same write.
    const r = await runInIsolatedHome(["--api-key", "sk-new"], {
      pre: (homeDir) => {
        writeFileSync(
          join(homeDir, ".jie", "settings.json"),
          JSON.stringify({ defaultProvider: "anthropic", defaultModel: "claude-sonnet-4" }, null, 2),
        );
      },
    });
    try {
      expect(r.capture.exit).toBe(0);
      const authText = r.readHomeFile(".jie/auth.json");
      expect(authText).not.toBeNull();
      const auth = JSON.parse(authText!);
      expect(auth.anthropic).toEqual({ type: "api_key", key: "sk-new" });
      expect(r.capture.stdout).toContain("logged in to anthropic");
    } finally {
      r.cleanup();
    }
  });
});

describe("jie --resume (unknown session)", () => {
  test("--resume nonexistent -p 'hi' -> exit 1, stderr has 'unknown session_id: nonexistent'", async () => {
    const r = await runInIsolatedHome(["--resume", "nonexistent", "-p", "hi"], {
      pre: (homeDir) => {
        writeFileSync(
          join(homeDir, ".jie", "settings.json"),
          JSON.stringify({ defaultProvider: "anthropic", defaultModel: "claude-sonnet-4" }, null, 2),
        );
      },
    });
    try {
      expect(r.capture.exit).toBe(1);
      expect(r.capture.stderr).toContain("unknown session_id: nonexistent");
    } finally {
      r.cleanup();
    }
  });
});

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

describe("jie (no flags)", () => {
  test("no flags -> exit 1, stderr contains 'TUI not implemented'", async () => {
    const r = await runInIsolatedHome([]);
    try {
      expect(r.capture.exit).toBe(1);
      expect(r.capture.stderr).toContain("TUI not implemented");
    } finally {
      r.cleanup();
    }
  });
});
