/**
 * End-to-end v1 user-scenario tests.
 *
 * These tests drive the full `jie -p` pipeline against a real LLM
 * provider. They are gated by the env var `JIE_E2E_LLM_BASE_URL`
 * (and `JIE_E2E_LLM_API_KEY`, defaulting to "not-needed"). When
 * the env is unset, the tests are skipped — they are meant to be
 * run in environments where a local LLM is reachable.
 *
 * The local LLM in the dev environment is LM Studio at
 * `http://192.168.1.6:12345/v1`, exposing model `qwen3.5-2b`.
 * Both are configured in `~/.pi/agent/models.json` under the
 * `lm-studio` provider.
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
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Model } from "@earendil-works/pi-ai";
import { runPrintCli, type PrintHooks } from "../../packages/jie-cli/index.ts";
import type { MergedSettings } from "@cuzfrog/jie-platform";

const LLM_BASE_URL = process.env.JIE_E2E_LLM_BASE_URL;
const LLM_API_KEY = process.env.JIE_E2E_LLM_API_KEY ?? "not-needed";
const LLM_PROVIDER = process.env.JIE_E2E_LLM_PROVIDER ?? "lm-studio";
const LLM_MODEL_ID = process.env.JIE_E2E_LLM_MODEL_ID ?? "qwen3.5-2b";

const E2E_ENABLED = LLM_BASE_URL !== undefined && LLM_BASE_URL !== "";

/** A `Model<"openai-completions">` shaped for an OpenAI-compatible
 *  local LLM. The fields are the same as the ones in
 *  `~/.pi/agent/models.json` under the `lm-studio` provider. */
function makeLocalModel(): Model<"openai-completions"> {
  return {
    id: LLM_MODEL_ID,
    name: LLM_MODEL_ID,
    api: "openai-completions",
    provider: LLM_PROVIDER,
    baseUrl: `${LLM_BASE_URL}/v1`,
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131528,
    maxTokens: 40960,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
    },
  } as Model<"openai-completions">;
}

function makeSettings(): MergedSettings {
  return { defaultProvider: LLM_PROVIDER, defaultModel: LLM_MODEL_ID };
}

function makeHooks(overrides: Partial<PrintHooks> = {}): PrintHooks {
  return {
    resolveModel: () => makeLocalModel() as unknown as Model<never>,
    getApiKey: () => LLM_API_KEY,
    settingsOverride: makeSettings(),
    ...overrides,
  };
}

describe("v1 user-scenarios — real LLM end-to-end", () => {
  let workspace: string;
  let prevHome: string | undefined;
  let writeOut: ReturnType<typeof spyOn> | undefined;
  let writeErr: ReturnType<typeof spyOn> | undefined;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-e2e-"));
    // Redirect HOME so the CLI does not pick up the user's real
    // `~/.jie/auth.json` / `~/.jie/settings.json` for these
    // tests. Each test sets up its own auth.json / settings.json
    // explicitly.
    prevHome = process.env.HOME;
    const fakeHome = join(workspace, "home");
    mkdirSync(fakeHome, { recursive: true });
    process.env.HOME = fakeHome;
    writeOut = spyOn(process.stdout, "write").mockImplementation(() => true);
    writeErr = spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    writeOut?.mockRestore();
    writeErr?.mockRestore();
    if (prevHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = prevHome;
    }
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
        makeHooks(),
      );
      expect(code).toBe(0);
      const stdout = captureStdout();
      expect(stdout.length).toBeGreaterThan(0);
      expect(stdout.endsWith("\n")).toBe(true);
    },
  );

  test.if(E2E_ENABLED)(
    "Scenario 2: --team my-team-1 / my-team-2 / wrong-team produce distinct outputs",
    async () => {
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
      writeErr?.mockReset();
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
        makeHooks(),
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
        makeHooks(),
      );
      expect(code2).toBe(0);
      const out2 = captureStdout();
      expect(out2).toContain("TEAM_TWO");
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
        makeHooks(),
      );
      expect(code3).toBe(1);
    },
  );

  test.if(E2E_ENABLED)(
    "Scenario 3: first-time setup → 'no model' error, then setup, then success",
    async () => {
      // First call: no auth, no settings, no team. The CLI should
      // exit 1 with the "No model has been selected" message.
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
        {
          // No `settingsOverride` so the CLI reads from
          // `loadMergedSettings`. The fake HOME is empty, so
          // there is no defaultProvider / defaultModel.
          resolveModel: () => makeLocalModel() as unknown as Model<never>,
          getApiKey: () => LLM_API_KEY,
        },
      );
      expect(code1).toBe(1);
      const stderr1 = (writeErr?.mock.calls as unknown[][]).map((c) => String(c[0] as string)).join("") ?? "";
      expect(stderr1).toContain(
        "No model has been selected, please login and select a default model.",
      );

      // Now: simulate the user running `jie login` + `jie model`.
      const fakeHome = process.env.HOME!;
      mkdirSync(join(fakeHome, ".jie"), { recursive: true });
      writeFileSync(
        join(fakeHome, ".jie", "auth.json"),
        JSON.stringify({ [LLM_PROVIDER]: { type: "api_key", key: LLM_API_KEY } }, null, 2),
      );
      writeFileSync(
        join(fakeHome, ".jie", "settings.json"),
        JSON.stringify(
          { defaultProvider: LLM_PROVIDER, defaultModel: LLM_MODEL_ID },
          null,
          2,
        ),
      );

      // Final call: with auth + settings, the CLI should resolve
      // the model and stream a response. Since the local LLM
      // provider is unknown to pi-ai's `getProviders()` list, we
      // still pass `resolveModel` as a safety net — but ideally,
      // we should be able to drive the CLI without it. We pass it
      // because the platform's `loadMergedSettings` warns and
      // ignores unknown `defaultProvider` values.
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
        makeHooks(),
      );
      expect(code2).toBe(0);
      const stdout2 = captureStdout();
      expect(stdout2.length).toBeGreaterThan(0);
    },
  );
});
