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
 * These tests require the LLM endpoint declared in the fixture
 * to be reachable. If the endpoint is unreachable, the entire
 * suite is skipped via `describe.skipIf` after a startup probe,
 * and a warning is printed.
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
  continueLast?: boolean;
}

/** Builds the argv for `jie -p "<instruction>" [...]` from a
 *  `PrintArgv` shape. Mirrors the field-to-flag mapping in
 *  `cli-flags.ts:parsePrint`. */
function printArgv(p: PrintArgv): string[] {
  const argv: string[] = ["-p", p.instruction];
  if (p.team !== undefined) argv.push("--team", p.team);
  if (p.timeout !== undefined) argv.push("--timeout", String(p.timeout));
  if (p.json === true) argv.push("--json");
  if (p.apiKey !== undefined) argv.push("--api-key", p.apiKey);
  if (p.resume !== undefined) argv.push("--resume", p.resume);
  if (p.continueLast === true) argv.push("--continue");
  return argv;
}

const FIXTURE_PATH = join(import.meta.dir, "fixtures", "models.json");
const FIXTURE: Fixture = (() => {
  const raw = readFileSync(FIXTURE_PATH, "utf-8");
  const parsed = JSON.parse(raw) as {
    providers: Record<string, { baseUrl: string; models: Array<{ id: string }> }>;
  };
  const providerId = Object.keys(parsed.providers)[0]!;
  const provider = parsed.providers[providerId]!;
  const modelId = provider.models[0]!.id;
  return { provider: providerId, modelId, baseUrl: provider.baseUrl, raw };
})();

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

/** Synchronously probe the fixture's baseUrl to decide whether to
 *  run the e2e scenarios. Returns true if the LLM endpoint is
 *  reachable.  Uses `node:net` so the probe does not require
 *  `fetch` semantics; falls back to a 1.5s timeout TCP connect. */
const LLM_AVAILABLE: boolean = await (async (): Promise<boolean> => {
  const url = FIXTURE.baseUrl;
  let host: string;
  let port: number;
  try {
    const u = new URL(url);
    host = u.hostname;
    port = u.port === "" ? 80 : Number(u.port);
  } catch {
    return false;
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
    return true;
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    // eslint-disable-next-line no-console
    console.warn(
      `[v1-scenarios] skipping all scenarios: fixture LLM at ${url} unreachable (${reason})`,
    );
    return false;
  }
})();

describe.skipIf(!LLM_AVAILABLE)("v1 user-scenarios — real LLM end-to-end", () => {
  let workspace: string;
  let prevHome: string | undefined;
  let writeOut: ReturnType<typeof vi.spyOn> | undefined;
  let writeErr: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-e2e-"));
    // Redirect HOME so the CLI does not pick up the user's real
    // `~/.jie/auth.json` / `~/.jie/models.json`.
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
    return (
      (writeOut?.mock.calls as unknown[][])
        .map((c) => String(c[0] as string))
        .join("") ?? ""
    );
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
      expect(code).toBe(0);
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
      expect(code).toBe(0);
      const written = readFileSync(join(workspace, "file2.txt"), "utf-8");
      expect(written).toContain("Hello123888");
    },
  );

  test(
    "Scenario 2: --team my-team-1 / my-team-2 / wrong-team produce distinct outputs",
    async () => {
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

      writeOut?.mockReset();
      writeOut?.mockImplementation(() => true);
      const code1 = await main(
        printArgv({ instruction: "Tell me a story", team: "my-team-1", timeout: 60 }),
        workspace,
      );
      const out1 = captureStdout();
      expect(code1).toBe(0);
      expect(out1).toContain("Marry had a little lamb");

      writeOut?.mockReset();
      writeOut?.mockImplementation(() => true);
      const code2 = await main(
        printArgv({ instruction: "Tell me a story", team: "my-team-2", timeout: 60 }),
        workspace,
      );
      const out2 = captureStdout();
      expect(code2).toBe(0);
      expect(out2).toContain("Once upon a time");

      writeOut?.mockReset();
      writeOut?.mockImplementation(() => true);
      const code3 = await main(
        printArgv({ instruction: "Tell me a story", team: "wrong-team", timeout: 60 }),
        workspace,
      );
      expect(code3).toBe(1);
    },
  );

  test(
    "Scenario 3: first-time setup → 'no model' error, then setup, then success",
    async () => {
      // First call: no models.json, no settings, no team. The CLI
      // should exit 1 with the "No model has been selected" message.
      writeErr?.mockReset();
      const code1 = await main(
        printArgv({ instruction: "Tell me a joke", timeout: 5 }),
        workspace,
      );
      expect(code1).toBe(1);
      const stderr1 =
        (writeErr?.mock.calls as unknown[][])
          .map((c) => String(c[0] as string))
          .join("") ?? "";
      expect(stderr1).toContain(
        "No model has been selected, please login and select a default model.",
      );

      // Simulate `jie model lm-studio/qwen3.5-2b` and the user
      // creating `.jie/models.json` with the provider config.
      writeModelsJsonTo(workspace);
      writeSettingsJson(workspace);

      // Final call: with .jie/models.json and .jie/settings.json,
      // the CLI should resolve the model through the registry and
      // stream a response. No hooks needed.
      writeOut?.mockReset();
      writeOut?.mockImplementation(() => true);
      const code2 = await main(
        printArgv({ instruction: "Tell me a joke", timeout: 60 }),
        workspace,
      );
      expect(code2).toBe(0);
      const stdout2 = captureStdout();
      expect(stdout2.length).toBeGreaterThan(0);
    },
  );
});
