import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../../../packages/jie-cli/index.ts";
import { loadMockExpectations } from "../../../packages/mock-llm-backend/index.ts";
import {
  assertLlmReachable,
  writeModelsJsonTo,
  writeSettingsJson,
} from "../_fixture.ts";
import expectations from "./v1-scenarios.llm.ts";

const NO_MODEL_ERROR = "No model has been selected";

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

describe("v1 user-scenarios — real LLM end-to-end", () => {
  let workspace: string;
  let prevHome: string | undefined;
  let writeOut: ReturnType<typeof vi.spyOn<typeof process.stdout, "write">> | undefined;
  let writeErr: ReturnType<typeof vi.spyOn<typeof console, "error">> | undefined;

  beforeAll(async () => {
    await assertLlmReachable();
    await loadMockExpectations(expectations);
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
      writeModelsJsonTo(join(workspace, ".jie"));
      writeSettingsJson(join(workspace, ".jie"));
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
      writeModelsJsonTo(join(workspace, ".jie"));
      writeSettingsJson(join(workspace, ".jie"));
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

  function seedStoryTeams(): void {
    writeModelsJsonTo(join(workspace, ".jie"));
    writeSettingsJson(join(workspace, ".jie"));
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
      seedStoryTeams();
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
      seedStoryTeams();
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
      seedStoryTeams();
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

      writeModelsJsonTo(join(workspace, ".jie"));
      writeSettingsJson(join(workspace, ".jie"));

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
