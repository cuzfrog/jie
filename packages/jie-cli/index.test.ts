
import { describe, expect, spyOn, test } from "bun:test";
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
import { main } from "./index.ts";

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
  } catch (e) {
    exit = 1;
    stderrLines.push(e instanceof Error ? e.message : String(e));
  }
  try {
    const capture: Capture = { exit, stdout: stdoutLines.join("\n"), stderr: stderrLines.join("\n") };
    return { capture, readHomeFile, cleanup };
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
  }
}

describe("jie — dispatch guards", () => {
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

describe("jie --api-key (top-level, integration)", () => {
  test("without defaultProvider -> exit 1, 'no provider resolved'", async () => {
    const r = await runInIsolatedHome(["--api-key", "sk-new"]);
    try {
      expect(r.capture.exit).toBe(1);
      expect(r.capture.stderr).toContain("no provider resolved");
    } finally {
      r.cleanup();
    }
  });

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
      expect(authText).not.toBeNull();
      expect(JSON.parse(authText!)).toEqual({ anthropic: { type: "api_key", key: "sk-new" } });
    } finally {
      r.cleanup();
    }
  });
});

describe("jie --resume unknown session", () => {
  test("--resume nonexistent -p 'hi' -> exit 1, stderr has 'unknown session_id: nonexistent'", async () => {
    const r = await runInIsolatedHome(["--resume", "nonexistent", "-p", "hi"], {
      pre: (homeDir) => {
        writeFileSync(
          join(homeDir, ".jie", "settings.json"),
          JSON.stringify({ defaultProvider: "anthropic", defaultModel: "claude-sonnet-4" }),
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
