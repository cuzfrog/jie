/**
 * End-to-end v1 user-scenario tests.
 *
 * Drives the full `jie -p` pipeline against a real LLM. The LLM
 * config comes from `tests/e2e/fixtures/models.json`; the test
 * copies it into the test workspace (project scope) and runs the
 * v1 user scenarios. The CLI's `ModelRegistry` resolves the
 * provider/model from the workspace, exercising the same code
 * path the user takes via `.jie/models.json` (issue #20).
 *
 * Required env vars (provided by `setenv` for local dev and by
 * the CI workflow for GitHub Models):
 *   JIE_E2E_BASE_URL, JIE_E2E_API_KEY, JIE_E2E_MODEL
 *
 * The suite hard-fails at module load if any of those are unset,
 * and again at module load if the LLM endpoint is unreachable.
 * There is no skip-on-unreachable path; e2e must be backed by a
 * real LLM in every environment that runs it.
 */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../../packages/jie-cli/index.ts";

const NO_MODEL_ERROR = "No model has been selected";

interface Fixture {
  provider: string;
  modelId: string;
  baseUrl: string;
  raw: string;
}

interface PrintArgv {
  instruction: string;
  team?: string;
  timeout?: number;
  json?: boolean;
  apiKey?: string;
  resume?: string;
}

function printArgv(p: PrintArgv): string[] {
  const argv: string[] = ["-p", p.instruction];
  if (p.team !== undefined) argv.push("--team", p.team);
  if (p.timeout !== undefined) argv.push("--timeout", String(p.timeout));
  if (p.json === true) argv.push("--json");
  if (p.apiKey !== undefined) argv.push("--api-key", p.apiKey);
  if (p.resume !== undefined) argv.push("--resume", p.resume);
  return argv;
}

const FIXTURE_PATH = join(import.meta.dir, "fixtures", "models.json");

/** Required env vars. The CI workflow and `setenv` (for local dev)
 *  must populate these. Failing here keeps the e2e suite honest:
 *  it cannot silently green-check. */
function requireEnv(name: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    throw new Error(
      `Missing required env var ${name}. Source ./setenv for local dev, or set it in CI.`,
    );
  }
  return v;
}
const E2E_BASE_URL = requireEnv("JIE_E2E_BASE_URL");
requireEnv("JIE_E2E_API_KEY");
const E2E_MODEL = requireEnv("JIE_E2E_MODEL");

const FIXTURE: Fixture = (() => {
  const raw = readFileSync(FIXTURE_PATH, "utf-8");
  const parsed = JSON.parse(raw) as {
    providers: Record<string, { baseUrl: string; models: Array<{ id: string }> }>;
  };
  const providerId = Object.keys(parsed.providers)[0]!;
  return {
    provider: providerId,
    modelId: E2E_MODEL,
    baseUrl: E2E_BASE_URL,
    raw,
  };
})();

/** Synchronously probe the fixture's baseUrl to fail fast when the
 *  LLM endpoint is unreachable. Uses `Bun.connect` so the probe
 *  does not require `fetch` semantics; falls back to a 1.5s
 *  timeout TCP connect. */
async function assertLlmReachable(): Promise<void> {
  const url = FIXTURE.baseUrl;
  let host: string;
  let port: number;
  try {
    const u = new URL(url);
    host = u.hostname;
    port = u.port === ""
      ? u.protocol === "https:" ? 443 : 80
      : Number(u.port);
  } catch (cause) {
    throw new Error(`invalid JIE_E2E_BASE_URL: ${url}`);
  }
  try {
    await new Promise<void>((resolve, reject) => {
      let socket: { end: () => void } | undefined;
      const settle = (fn: () => void): void => {
        try { socket?.end(); } catch { /* socket may already be closed */ }
        fn();
      };
      const timeoutId = setTimeout(
        () => settle(() => reject(new Error("probe timeout"))),
        1500,
      );
      Bun.connect({
        hostname: host,
        port,
        socket: {
          open: (s) => {
            socket = s;
            clearTimeout(timeoutId);
            settle(() => resolve());
          },
          data: () => {},
          error: (_s, err) => {
            clearTimeout(timeoutId);
            settle(() => reject(err));
          },
        },
      }).catch((err: unknown) => {
        clearTimeout(timeoutId);
        settle(() => reject(err));
      });
    });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `e2e backend at ${url} unreachable (${reason}). Start the LLM (LM Studio for local, or fix JIE_E2E_BASE_URL for CI).`,
    );
  }
}

/** Writes the fixture's `models.json` content to `{dir}/.jie/models.json`. */
function writeModelsJsonTo(dir: string): void {
  mkdirSync(join(dir, ".jie"), { recursive: true });
  writeFileSync(join(dir, ".jie", "models.json"), FIXTURE.raw);
}

/** Writes `settings.json` (project-scoped) so the CLI's
 *  `loadMergedSettings` returns the LLM provider/model. */
function writeSettingsJson(workspace: string): void {
  mkdirSync(join(workspace, ".jie"), { recursive: true });
  writeFileSync(
    join(workspace, ".jie", "settings.json"),
    JSON.stringify(
      { defaultProvider: FIXTURE.provider, defaultModel: FIXTURE.modelId },
      null,
      2,
    ),
  );
}

describe("v1 user-scenarios — real LLM end-to-end", () => {
  let workspace: string;
  let prevHome: string | undefined;
  let writeOut: ReturnType<typeof vi.spyOn<typeof process.stdout, "write">> | undefined;
  let writeErr: ReturnType<typeof vi.spyOn<typeof console, "error">> | undefined;

  beforeAll(async () => {
    await assertLlmReachable();
  });

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-e2e-"));
    prevHome = process.env.HOME;
    const fakeHome = join(workspace, "home");
    mkdirSync(fakeHome, { recursive: true });
    process.env.HOME = fakeHome;
    writeOut = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    writeErr = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    writeOut?.mockRestore();
    writeErr?.mockRestore();
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    rmSync(workspace, { recursive: true, force: true });
  });

  function captureStdout(): string {
    return writeOut?.mock.calls.map((c) => String(c[0] ?? "")).join("") ?? "";
  }

  function captureStderr(): string {
    return writeErr?.mock.calls.map((c) => String(c[0] ?? "")).join("") ?? "";
  }

  /** Bundle `code` + captured stderr so a failing assertion shows
   *  the CLI's last words, not just "Expected 0, Received 1". */
  function expectExit(actual: number, expected: 0 | 1): void {
    if (actual === expected) return;
    const stderr = captureStderr();
    const lines = [
      `expected exit ${expected}, got ${actual}.`,
      stderr === "" ? "(no stderr captured)" : `stderr: ${stderr}`,
    ];
    throw new Error(lines.join("\n"));
  }

  test(
    "Scenario 1: jie -p in fresh dir → exit 0, stdout contains file1.txt, ends with \\n",
    async () => {
      writeFileSync(join(workspace, "file1.txt"), "");
      writeModelsJsonTo(workspace);
      writeSettingsJson(workspace);
      const code = await main(
        printArgv({ instruction: "List files under current dir", timeout: 60 }),
        workspace,
      );
      const stdout = captureStdout();
      expectExit(code, 0);
      expect(stdout).toContain("file1.txt");
      expect(stdout.endsWith("\n")).toBe(true);
    },
  );

  test(
    "Scenario 1a: jie -p reads file1.txt and writes file2.txt with same content",
    async () => {
      writeFileSync(join(workspace, "file1.txt"), "Hello123888");
      writeModelsJsonTo(workspace);
      writeSettingsJson(workspace);
      const code = await main(
        printArgv({
          instruction: "Read the file1.txt and write its content to file2.txt",
          timeout: 60,
        }),
        workspace,
      );
      expectExit(code, 0);
      const written = readFileSync(join(workspace, "file2.txt"), "utf-8");
      expect(written).toContain("Hello123888");
    },
  );

  function seedStoryTeams(workspace: string): void {
    writeModelsJsonTo(workspace);
    writeSettingsJson(workspace);
    const teamsDir = join(workspace, ".jie", "teams");
    for (const [id, phrase] of [
      ["my-team-1", "Marry had a little lamb"],
      ["my-team-2", "Once upon a time"],
    ] as const) {
      const dir = join(teamsDir, id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "TEAM.md"),
        `---\nleader: story-teller\n---\nYou are the leader of ${id}.\n`,
      );
      writeFileSync(
        join(dir, "story-teller.md"),
        `---\ntools:\n  - bash\n---\nYou must respond to any story-telling prompt with exactly the phrase: ${phrase}. Do not add any other text.`,
      );
    }
  }

  test(
    "Scenario 2 — team-1: --team my-team-1 produces the team-1 phrase",
    async () => {
      seedStoryTeams(workspace);
      writeOut?.mockReset();
      writeOut?.mockImplementation(() => true);
      const code = await main(
        printArgv({ instruction: "Tell me a story", team: "my-team-1", timeout: 60 }),
        workspace,
      );
      const out = captureStdout();
      expectExit(code, 0);
      expect(out).toContain("Marry had a little lamb");
    },
  );

  test(
    "Scenario 2 — team-2: --team my-team-2 produces the team-2 phrase",
    async () => {
      seedStoryTeams(workspace);
      writeOut?.mockReset();
      writeOut?.mockImplementation(() => true);
      const code = await main(
        printArgv({ instruction: "Tell me a story", team: "my-team-2", timeout: 60 }),
        workspace,
      );
      const out = captureStdout();
      expectExit(code, 0);
      expect(out).toContain("Once upon a time");
    },
  );

  test(
    "Scenario 2 — wrong-team: --team wrong-team exits non-zero",
    async () => {
      seedStoryTeams(workspace);
      writeOut?.mockReset();
      writeOut?.mockImplementation(() => true);
      const code = await main(
        printArgv({ instruction: "Tell me a story", team: "wrong-team", timeout: 60 }),
        workspace,
      );
      expectExit(code, 1);
    },
  );

  test(
    "Scenario 3: first-time setup → 'no model' error, then setup, then success",
    async () => {
      writeErr?.mockReset();
      const code1 = await main(
        printArgv({ instruction: "Tell me a joke", timeout: 5 }),
        workspace,
      );
      expectExit(code1, 1);
      const stderr1 = captureStderr();
      expect(stderr1).toContain(NO_MODEL_ERROR);

      writeModelsJsonTo(workspace);
      writeSettingsJson(workspace);

      writeOut?.mockReset();
      writeOut?.mockImplementation(() => true);
      const code2 = await main(
        printArgv({ instruction: "Tell me a joke", timeout: 60 }),
        workspace,
      );
      expectExit(code2, 0);
      const stdout2 = captureStdout();
      expect(stdout2.length).toBeGreaterThan(0);
    },
  );
});
