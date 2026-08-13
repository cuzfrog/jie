import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main } from "../../../src/cli";
import { FIXTURE, writeModelsJsonTo } from "../_fixture.ts";
import { MockClient } from "../../mock-llm-backend/client.ts";
import { loadMockExpectations } from "../../mock-llm-backend";
import expectations from "./assisted-developer.llm.ts";

const TASK = "Add a greet() function that returns 'hello' in greet.ts, then write a test for it";

interface PrintArgv {
  instruction: string;
  team?: string;
  timeout?: number;
}

function printArgv(p: PrintArgv): string[] {
  const argv: string[] = ["-p", p.instruction];
  if (p.team !== undefined) argv.push("--team", p.team);
  if (p.timeout !== undefined) argv.push("--timeout", String(p.timeout));
  return argv;
}

function seedAssistedDeveloperTeam(workspace: string): void {
  const srcDir = join(import.meta.dir, "../../../src/manifest/teams/jie-assisted-developer");
  const destDir = join(workspace, ".jie", "teams", "jie-assisted-developer");
  mkdirSync(destDir, { recursive: true });
  for (const file of ["TEAM.md", "developer.md", "architect.md", "peer.md"]) {
    let text = readFileSync(join(srcDir, file), "utf-8");
    if (file === "architect.md") text = text.replace(/^  - mcp:code-lens:\*\n/m, "");
    writeFileSync(join(destDir, file), text);
  }
}

describe("jie-assisted-developer team — happy path", () => {
  let workspace: string;
  let prevHome: string | undefined;
  let writeOut: ReturnType<typeof vi.spyOn<typeof process.stdout, "write">> | undefined;
  let writeErr: ReturnType<typeof vi.spyOn<typeof console, "error">> | undefined;

  beforeAll(async () => {
    await loadMockExpectations(expectations);
  });

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-assisted-"));
    prevHome = process.env.HOME;
    process.env.HOME = workspace;
    writeModelsJsonTo(join(workspace, ".jie"));
    const settings = {
      defaultProvider: FIXTURE.provider,
      defaultModel: FIXTURE.modelId,
      memory: { enabled: false },
    };
    writeFileSync(join(workspace, ".jie", "settings.json"), JSON.stringify(settings, null, 2));
    seedAssistedDeveloperTeam(workspace);
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

  function expectExit(actual: number, expected: 0 | 1): void {
    if (actual === expected) return;
    const stderr = writeErr?.mock.calls.map((c) => String(c[0] ?? "")).join("") ?? "";
    throw new Error(`expected exit ${expected}, got ${actual}.\n${stderr === "" ? "(no stderr)" : `stderr: ${stderr}`}`);
  }

  test("developer consults architect, implements, and gets peer review", async () => {
    const code = await main(
      printArgv({ instruction: TASK, team: "jie-assisted-developer", timeout: 60 }),
      workspace,
    );
    expectExit(code, 0);

    const greet = readFileSync(join(workspace, "greet.ts"), "utf-8");
    expect(greet).toContain("export function greet()");
    expect(greet).toContain('"hello"');

    const test = readFileSync(join(workspace, "greet.test.ts"), "utf-8");
    expect(test).toContain("./greet");
    expect(test).toContain('toBe("hello")');

    expect(captureStdout()).toContain("Done:");
    await new MockClient().assertConsumedAll(expectations);
  });
});
