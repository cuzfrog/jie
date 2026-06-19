import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeAuthStore, makeSettingsStore } from "@cuzfrog/jie-platform/config";
import { runPrint, type PrintDeps, type PrintArgs } from "./print.ts";

function makeDeps(homeDir: string): PrintDeps {
  return {
    authStore: makeAuthStore(homeDir),
    settingsStore: makeSettingsStore(homeDir),
    homeDir,
  };
}

function printArgs(partial: Partial<PrintArgs> = {}): PrintArgs {
  return {
    kind: "print",
    instruction: "hi",
    team: undefined,
    timeout: 5,
    json: false,
    apiKey: undefined,
    resume: undefined,
    continueLast: false,
    ...partial,
  };
}

function writeEmptyTeam(homeJieDir: string, id: string): void {
  // A team directory with a `TEAM.md` but no agent `.md` files.
  // The loader returns `{ roles: [], leaderRole: null }`.
  const dir = join(homeJieDir, "teams", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "TEAM.md"), "---\n---\n");
}

describe("print mode — guard rails", () => {
  let workspace: string;
  let homeDir: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-cli-print-"));
    homeDir = mkdtempSync(join(tmpdir(), "jie-cli-print-home-"));
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
  });

  test("--team <id> not installed exits 1 with team-not-found message", async () => {
    const writeErr = spyOn(console, "error").mockImplementation(() => {});
    const code = await runPrint(
      printArgs({ instruction: "hello", team: "ghost", timeout: 1 }),
      workspace,
      makeDeps(homeDir),
    );
    expect(code).toBe(1);
    const messages = writeErr.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("team 'ghost' not found"))).toBe(true);
    writeErr.mockRestore();
  });

  test("empty team (TEAM.md, no agent .md files) guard: exits 1 with no-agents message", async () => {
    writeEmptyTeam(join(homeDir, ".jie"), "empty");
    const writeErr = spyOn(console, "error").mockImplementation(() => {});
    const code = await runPrint(
      printArgs({ instruction: "hello", team: "empty", timeout: 1 }),
      workspace,
      makeDeps(homeDir),
    );
    expect(code).toBe(1);
    const messages = writeErr.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("no agents to run"))).toBe(true);
    writeErr.mockRestore();
  });
});
