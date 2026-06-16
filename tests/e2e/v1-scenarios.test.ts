/**
 * End-to-end v1 user-scenario tests.
 *
 * Drives the full `jie -p` pipeline against a real LLM provider,
 * configured via `.jie/models.json` in the test workspace.
 * The dev environment is LM Studio at `http://192.168.1.6:12345/v1`
 * exposing model `qwen3.5-2b`. The base URL is read from
 * `JIE_E2E_LLM_BASE_URL`; the rest is the platform's `models.json`
 * machinery (issue #20).
 *
 * When `JIE_E2E_LLM_BASE_URL` is unset, the tests are skipped.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPrintCli } from "../../packages/jie-cli/index.ts";

const LLM_BASE_URL = process.env.JIE_E2E_LLM_BASE_URL;
const LLM_API_KEY = process.env.JIE_E2E_LLM_API_KEY ?? "not-needed";
const LLM_PROVIDER = "lm-studio";
const LLM_MODEL_ID = "qwen3.5-2b";

const E2E_ENABLED = LLM_BASE_URL !== undefined && LLM_BASE_URL !== "";

/** Writes the project's `.jie/models.json` with the dev LLM
 *  provider configuration. The `apiKey` uses `$ENV` interpolation
 *  so the test does not embed a real key; the env var is set in
 *  `beforeEach`. */
function writeModelsJson(workspace: string): void {
  mkdirSync(join(workspace, ".jie"), { recursive: true });
  writeFileSync(
    join(workspace, ".jie", "models.json"),
    JSON.stringify(
      {
        providers: {
          [LLM_PROVIDER]: {
            baseUrl: `${LLM_BASE_URL}/v1`,
            api: "openai-completions",
            apiKey: "$JIE_E2E_LLM_KEY",
            compat: {
              supportsDeveloperRole: false,
              supportsReasoningEffort: false,
            },
            models: [
              {
                id: LLM_MODEL_ID,
                name: LLM_MODEL_ID,
                reasoning: true,
                input: ["text"],
                contextWindow: 131528,
                maxTokens: 40960,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              },
            ],
          },
        },
      },
      null,
      2,
    ),
  );
}

/** Writes `settings.json` (project-scoped) so the CLI's
 *  `loadMergedSettings` returns the LLM provider/model. */
function writeSettingsJson(workspace: string): void {
  mkdirSync(join(workspace, ".jie"), { recursive: true });
  writeFileSync(
    join(workspace, ".jie", "settings.json"),
    JSON.stringify(
      { defaultProvider: LLM_PROVIDER, defaultModel: LLM_MODEL_ID },
      null,
      2,
    ),
  );
}

describe("v1 user-scenarios — real LLM end-to-end", () => {
  let workspace: string;
  let prevHome: string | undefined;
  let prevKey: string | undefined;
  let writeOut: ReturnType<typeof spyOn> | undefined;
  let writeErr: ReturnType<typeof spyOn> | undefined;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-e2e-"));
    // Redirect HOME so the CLI does not pick up the user's real
    // `~/.jie/auth.json` / `~/.jie/models.json`.
    prevHome = process.env.HOME;
    const fakeHome = join(workspace, "home");
    mkdirSync(fakeHome, { recursive: true });
    process.env.HOME = fakeHome;
    // Set the key for `$JIE_E2E_LLM_KEY` interpolation.
    prevKey = process.env.JIE_E2E_LLM_KEY;
    process.env.JIE_E2E_LLM_KEY = LLM_API_KEY;
    writeOut = spyOn(process.stdout, "write").mockImplementation(() => true);
    writeErr = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    writeOut?.mockRestore();
    writeErr?.mockRestore();
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    if (prevKey === undefined) delete process.env.JIE_E2E_LLM_KEY;
    else process.env.JIE_E2E_LLM_KEY = prevKey;
    rmSync(workspace, { recursive: true, force: true });
  });

  function captureStdout(): string {
    return (
      (writeOut?.mock.calls as unknown[][])
        .map((c) => String(c[0] as string))
        .join("") ?? ""
    );
  }

  test.if(E2E_ENABLED)(
    "Scenario 1: jie -p in fresh dir → exit 0, stdout non-empty, ends with \\n",
    async () => {
      writeModelsJson(workspace);
      writeSettingsJson(workspace);
      const code = await runPrintCli(
        {
          kind: "print",
          instruction: "List files under current dir",
          timeout: 60,
          json: false,
          apiKey: undefined,
          resume: undefined,
          continueLast: false,
        },
        workspace,
        {},
      );
      const stdout = captureStdout();
      expect(code).toBe(0);
      expect(stdout.length).toBeGreaterThan(0);
      expect(stdout.endsWith("\n")).toBe(true);
    },
  );

  test.if(E2E_ENABLED)(
    "Scenario 2: --team my-team-1 / my-team-2 / wrong-team produce distinct outputs",
    async () => {
      writeModelsJson(workspace);
      writeSettingsJson(workspace);

      // Set up two teams under the workspace.
      const teamsDir = join(workspace, ".jie", "teams");
      for (const [id, marker] of [
        ["my-team-1", "TEAM_ONE"],
        ["my-team-2", "TEAM_TWO"],
      ] as const) {
        const dir = join(teamsDir, id);
        mkdirSync(dir, { recursive: true });
        writeFileSync(
          join(dir, "TEAM.md"),
          `---\nleader: general\n---\nYou are a member of ${id}.\n`,
        );
        writeFileSync(
          join(dir, "general.md"),
          `---\ntools:\n  - bash\n---\nYou must respond to any user prompt with exactly the literal marker \`${marker}\` and nothing else. Do not include punctuation, explanation, or surrounding text.`,
        );
      }

      // First, with my-team-1, stdout should contain TEAM_ONE.
      writeOut?.mockReset();
      writeOut?.mockImplementation(() => true);
      const code1 = await runPrintCli(
        {
          kind: "print",
          instruction: "say it",
          team: "my-team-1",
          timeout: 60,
          json: false,
          apiKey: undefined,
          resume: undefined,
          continueLast: false,
        },
        workspace,
        {},
      );
      const out1 = captureStdout();
      expect(code1).toBe(0);
      expect(out1).toContain("TEAM_ONE");

      // Then, with my-team-2, stdout should contain TEAM_TWO.
      writeOut?.mockReset();
      writeOut?.mockImplementation(() => true);
      const code2 = await runPrintCli(
        {
          kind: "print",
          instruction: "say it",
          team: "my-team-2",
          timeout: 60,
          json: false,
          apiKey: undefined,
          resume: undefined,
          continueLast: false,
        },
        workspace,
        {},
      );
      expect(code2).toBe(0);
      const out2 = captureStdout();
      expect(out2).toContain("TEAM_TWO");

      // Finally, with wrong-team, exit 1.
      writeOut?.mockReset();
      writeOut?.mockImplementation(() => true);
      const code3 = await runPrintCli(
        {
          kind: "print",
          instruction: "hi",
          team: "wrong-team",
          timeout: 60,
          json: false,
          apiKey: undefined,
          resume: undefined,
          continueLast: false,
        },
        workspace,
        {},
      );
      expect(code3).toBe(1);
    },
  );

  test.if(E2E_ENABLED)(
    "Scenario 3: first-time setup → 'no model' error, then setup, then success",
    async () => {
      // First call: no models.json, no settings, no team. The CLI
      // should exit 1 with the "No model has been selected" message.
      writeErr?.mockReset();
      const code1 = await runPrintCli(
        {
          kind: "print",
          instruction: "Tell me a joke",
          timeout: 5,
          json: false,
          apiKey: undefined,
          resume: undefined,
          continueLast: false,
        },
        workspace,
        {},
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
      writeModelsJson(workspace);
      writeSettingsJson(workspace);

      // Final call: with .jie/models.json and .jie/settings.json,
      // the CLI should resolve the model through the registry and
      // stream a response. No hooks needed.
      writeOut?.mockReset();
      writeOut?.mockImplementation(() => true);
      const code2 = await runPrintCli(
        {
          kind: "print",
          instruction: "Tell me a joke",
          timeout: 60,
          json: false,
          apiKey: undefined,
          resume: undefined,
          continueLast: false,
        },
        workspace,
        {},
      );
      expect(code2).toBe(0);
      const stdout2 = captureStdout();
      expect(stdout2.length).toBeGreaterThan(0);
    },
  );
});
