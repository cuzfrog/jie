import { afterEach, beforeEach, describe, expect, test } from "bun:test";
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
import { makeSettingsStore } from "@cuzfrog/jie-platform/config";
import { createTeamRegistry, type TeamRegistry } from "@cuzfrog/jie-platform/team";
import { runModel, runTeam } from "./settings.ts";

describe("runModel", () => {
  let homeDir: string;
  let cwd: string;
  let homeJieDir: string;
  let settings: ReturnType<typeof makeSettingsStore>;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "jie-cli-model-"));
    cwd = mkdtempSync(join(tmpdir(), "jie-cli-model-cwd-"));
    homeJieDir = join(homeDir, ".jie");
    settings = makeSettingsStore(cwd, homeJieDir, null);
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  });

  test("writes global settings when no project .jie/ is found", async () => {
    const code = await runModel(
      { kind: "model", provider: "anthropic", modelId: "claude-opus-4" },
      null,
      settings,
    );
    expect(code).toBe(0);
    const path = join(homeJieDir, "settings.json");
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf-8"))).toEqual({
      defaultProvider: "anthropic",
      defaultModel: "claude-opus-4",
    });
  });

  test("writes project settings when projectJieDir is provided", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "jie-cli-model-proj-"));
    const projectJieDir = join(projectRoot, ".jie");
    const nested = join(projectRoot, "a", "b");
    try {
      mkdirSync(projectJieDir, { recursive: true });
      mkdirSync(nested, { recursive: true });
      const nestedSettings = makeSettingsStore(nested, homeJieDir, projectJieDir);
      const code = await runModel(
        { kind: "model", provider: "anthropic", modelId: "claude-opus-4" },
        projectJieDir,
        nestedSettings,
      );
      expect(code).toBe(0);
      const path = join(projectJieDir, "settings.json");
      expect(existsSync(path)).toBe(true);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test("warns to stderr for unknown providers but still writes the setting", async () => {
    const errs: string[] = [];
    const orig = console.error;
    console.error = (...args: unknown[]) => {
      errs.push(args.map(String).join(" "));
    };
    try {
      const code = await runModel(
        { kind: "model", provider: "ghost-provider", modelId: "ghost-model" },
        null,
        settings,
      );
      expect(code).toBe(0);
      expect(errs.join("\n")).toContain("unknown provider: ghost-provider");
      const path = join(homeJieDir, "settings.json");
      expect(JSON.parse(readFileSync(path, "utf-8"))).toEqual({
        defaultProvider: "ghost-provider",
        defaultModel: "ghost-model",
      });
    } finally {
      console.error = orig;
    }
  });
});

describe("runTeam", () => {
  let homeDir: string;
  let cwd: string;
  let homeJieDir: string;
  let settings: ReturnType<typeof makeSettingsStore>;
  let teamRegistry: TeamRegistry;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "jie-cli-team-"));
    cwd = mkdtempSync(join(tmpdir(), "jie-cli-team-cwd-"));
    homeJieDir = join(homeDir, ".jie");
    settings = makeSettingsStore(cwd, homeJieDir, null);

    teamRegistry = createTeamRegistry({
      homeJieDir,
      projectJieDir: null,
    });
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  });

  test("team dev (installed globally) writes defaultTeam to global settings", async () => {
    mkdirSync(join(homeDir, ".jie", "teams", "dev"), { recursive: true });
    writeFileSync(join(homeDir, ".jie", "teams", "dev", "TEAM.md"), "");
    const code = await runTeam(
      { kind: "team", teamId: "dev", unset: false },
      settings,
      teamRegistry,
    );
    expect(code).toBe(0);
    expect(JSON.parse(readFileSync(join(homeDir, ".jie", "settings.json"), "utf-8"))).toEqual({
      defaultTeam: "dev",
    });
  });

  test("team dev (installed in project) writes defaultTeam to project settings", async () => {
    const projectJieDir = join(cwd, ".jie");
    mkdirSync(join(projectJieDir, "teams", "dev"), { recursive: true });
    writeFileSync(join(projectJieDir, "teams", "dev", "TEAM.md"), "");
    const projectSettings = makeSettingsStore(cwd, homeJieDir, projectJieDir);
    const projectRegistry = createTeamRegistry({ homeJieDir, projectJieDir });
    const code = await runTeam(
      { kind: "team", teamId: "dev", unset: false },
      projectSettings,
      projectRegistry,
    );
    expect(code).toBe(0);
    expect(JSON.parse(readFileSync(join(projectJieDir, "settings.json"), "utf-8"))).toEqual({
      defaultTeam: "dev",
    });
  });

  test("team ghost (not installed) -> exit 1", async () => {
    const errs: string[] = [];
    const orig = console.error;
    console.error = (...args: unknown[]) => {
      errs.push(args.map(String).join(" "));
    };
    try {
      const code = await runTeam(
        { kind: "team", teamId: "ghost", unset: false },
        settings,
        teamRegistry,
      );
      expect(code).toBe(1);
      expect(errs.join("\n")).toContain("is not installed");
    } finally {
      console.error = orig;
    }
  });

  test("team with malformed id -> exit 1 (charset validation moved to parse time)", async () => {

    const errs: string[] = [];
    const orig = console.error;
    console.error = (...args: unknown[]) => {
      errs.push(args.map(String).join(" "));
    };
    try {
      const code = await runTeam(
        { kind: "team", teamId: "bad id with spaces", unset: false },
        settings,
        teamRegistry,
      );
      expect(code).toBe(1);
      expect(errs.join("\n")).toContain("is not installed");
    } finally {
      console.error = orig;
    }
  });

  test("team --unset removes defaultTeam from global settings", async () => {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(
      join(homeJieDir, "settings.json"),
      JSON.stringify({ defaultProvider: "p", defaultModel: "m", defaultTeam: "dev" }),
    );
    const code = await runTeam(
      { kind: "team", unset: true },
      settings,
      teamRegistry,
    );
    expect(code).toBe(0);
    expect(JSON.parse(readFileSync(join(homeJieDir, "settings.json"), "utf-8"))).toEqual({
      defaultProvider: "p",
      defaultModel: "m",
    });
  });

  test("team --unset removes defaultTeam from project settings", async () => {
    const projectJieDir = join(cwd, ".jie");
    mkdirSync(projectJieDir, { recursive: true });
    writeFileSync(
      join(projectJieDir, "settings.json"),
      JSON.stringify({ defaultProvider: "p", defaultModel: "m", defaultTeam: "dev" }),
    );
    const projectSettings = makeSettingsStore(cwd, homeJieDir, projectJieDir);
    const projectRegistry = createTeamRegistry({ homeJieDir, projectJieDir });
    const code = await runTeam(
      { kind: "team", unset: true },
      projectSettings,
      projectRegistry,
    );
    expect(code).toBe(0);
    expect(JSON.parse(readFileSync(join(projectJieDir, "settings.json"), "utf-8"))).toEqual({
      defaultProvider: "p",
      defaultModel: "m",
    });
  });

  test("team (no arg) prints defaultTeam and installed list", async () => {
    mkdirSync(join(homeDir, ".jie", "teams", "dev"), { recursive: true });
    writeFileSync(join(homeDir, ".jie", "teams", "dev", "TEAM.md"), "");
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(
      join(homeJieDir, "settings.json"),
      JSON.stringify({ defaultProvider: "p", defaultModel: "m", defaultTeam: "dev" }),
    );
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    try {
      const code = await runTeam(
        { kind: "team", unset: false },
        settings,
        teamRegistry,
      );
      expect(code).toBe(0);
      const out = logs.join("\n");
      expect(out).toContain("defaultTeam: dev");
      expect(out).toContain("installed:");
      expect(out).toContain("dev");
    } finally {
      console.log = orig;
    }
  });

  test("team (no arg) prints defaultTeam: unset when no defaultTeam is set", async () => {
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    };
    try {
      const code = await runTeam(
        { kind: "team", unset: false },
        settings,
        teamRegistry,
      );
      expect(code).toBe(0);
      const out = logs.join("\n");
      expect(out).toContain("defaultTeam: unset");
    } finally {
      console.log = orig;
    }
  });
});
