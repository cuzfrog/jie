
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createEventBus } from "@cuzfrog/jie-platform/core";
import {
  ModelRegistry,
  makeAuthStore,
  makeSettingsStore,
} from "@cuzfrog/jie-platform/config";
import { createStorage, createMemoryManager } from "@cuzfrog/jie-platform/storage";
import { createTeamRegistry } from "@cuzfrog/jie-platform/team";
import { createToolRegistry } from "@cuzfrog/jie-platform/tools";
import { createApp, type AppArgs, type AppDeps } from "./app.ts";

function makeDeps(workspace: string, homeJieDir: string): AppDeps {
  const storage = createStorage({ type: "sqlite", filePath: ":memory:" });
  return {
    authStore: makeAuthStore(dirname(homeJieDir)),
    settingsStore: makeSettingsStore(workspace, homeJieDir),
    bus: createEventBus(),
    storage,
    teamRegistry: createTeamRegistry({ workspace, homeJieDir }),
    modelRegistry: ModelRegistry.load(workspace, { homeDir: dirname(homeJieDir) }),
    toolRegistry: createToolRegistry(),
    memoryManager: createMemoryManager(storage),
  };
}

function appArgs(partial: Partial<AppArgs> = {}): AppArgs {
  return {
    kind: "print",
    cwd: "/tmp/workspace",
    homeJieDir: "/tmp/home/.jie",
    teamId: undefined,
    apiKey: undefined,
    resume: undefined,
    continueLast: false,
    ...partial,
  };
}

function writeEmptyTeam(homeJieDir: string, id: string): void {

  const dir = join(homeJieDir, "teams", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "TEAM.md"), "---\n---\n");
}

describe("createApp — guard rails", () => {
  let workspace: string;
  let homeDir: string;
  let homeJieDir: string;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), "jie-cli-app-"));
    homeDir = mkdtempSync(join(tmpdir(), "jie-cli-app-home-"));
    homeJieDir = join(homeDir, ".jie");
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(homeDir, { recursive: true, force: true });
  });

  test("--api-key without defaultProvider: returns error code 1, no auth.json written", async () => {
    const writeErr = spyOn(console, "error").mockImplementation(() => {});
    const result = await createApp(
      appArgs({ cwd: workspace, homeJieDir, apiKey: "sk-test" }),
      makeDeps(workspace, homeJieDir),
    );
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.code).toBe(1);
    }
    const messages = writeErr.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("no provider resolved"))).toBe(true);
    writeErr.mockRestore();
  });

  test("--team <id> not installed: returns error code 1 with team-not-found message", async () => {
    const writeErr = spyOn(console, "error").mockImplementation(() => {});
    const result = await createApp(
      appArgs({ cwd: workspace, homeJieDir, teamId: "ghost" }),
      makeDeps(workspace, homeJieDir),
    );
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.code).toBe(1);
    }
    const messages = writeErr.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("team 'ghost' not found"))).toBe(true);
    writeErr.mockRestore();
  });

  test("empty team (TEAM.md, no agent .md files) guard: returns error code 1 with no-agents message", async () => {
    writeEmptyTeam(homeJieDir, "empty");
    const writeErr = spyOn(console, "error").mockImplementation(() => {});
    const result = await createApp(
      appArgs({ cwd: workspace, homeJieDir, teamId: "empty" }),
      makeDeps(workspace, homeJieDir),
    );
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.code).toBe(1);
    }
    const messages = writeErr.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("no agents to run"))).toBe(true);
    writeErr.mockRestore();
  });
});
