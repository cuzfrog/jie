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
import { makeSettingsStore } from "../settings-store.ts";
import { makeTeamsRepo } from "../teams.ts";
import { runModel, runTeam } from "./settings.ts";

describe("runModel", () => {
  let homeDir: string;
  let cwd: string;
  let settings: ReturnType<typeof makeSettingsStore>;
  let teams: ReturnType<typeof makeTeamsRepo>;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "jie-cli-model-"));
    cwd = mkdtempSync(join(tmpdir(), "jie-cli-model-cwd-"));
    settings = makeSettingsStore(homeDir);
    teams = makeTeamsRepo(homeDir);
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  });

  test("writes global settings when no project .jie/ is found", async () => {
    const code = await runModel(
      { kind: "model", provider: "anthropic", modelId: "claude-opus-4" },
      cwd,
      settings,
      teams,
    );
    expect(code).toBe(0);
    const path = join(homeDir, ".jie", "settings.json");
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf-8"))).toEqual({
      defaultProvider: "anthropic",
      defaultModel: "claude-opus-4",
    });
  });

  test("writes project settings when .jie/ exists walking up from cwd", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "jie-cli-model-proj-"));
    const nested = join(projectRoot, "a", "b");
    try {
      mkdirSync(join(projectRoot, ".jie"), { recursive: true });
      mkdirSync(nested, { recursive: true });
      const code = await runModel(
        { kind: "model", provider: "anthropic", modelId: "claude-opus-4" },
        nested,
        settings,
        teams,
      );
      expect(code).toBe(0);
      const path = join(projectRoot, ".jie", "settings.json");
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
        cwd,
        settings,
        teams,
      );
      expect(code).toBe(0);
      expect(errs.join("\n")).toContain("unknown provider: ghost-provider");
      const path = join(homeDir, ".jie", "settings.json");
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
  let settings: ReturnType<typeof makeSettingsStore>;
  let teams: ReturnType<typeof makeTeamsRepo>;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "jie-cli-team-"));
    cwd = mkdtempSync(join(tmpdir(), "jie-cli-team-cwd-"));
    settings = makeSettingsStore(homeDir);
    teams = makeTeamsRepo(homeDir);
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
      cwd,
      settings,
      teams,
    );
    expect(code).toBe(0);
    expect(JSON.parse(readFileSync(join(homeDir, ".jie", "settings.json"), "utf-8"))).toEqual({
      defaultTeam: "dev",
    });
  });

  test("team dev (installed in project) writes defaultTeam to project settings", async () => {
    mkdirSync(join(cwd, ".jie", "teams", "dev"), { recursive: true });
    writeFileSync(join(cwd, ".jie", "teams", "dev", "TEAM.md"), "");
    const code = await runTeam(
      { kind: "team", teamId: "dev", unset: false },
      cwd,
      settings,
      teams,
    );
    expect(code).toBe(0);
    expect(JSON.parse(readFileSync(join(cwd, ".jie", "settings.json"), "utf-8"))).toEqual({
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
        cwd,
        settings,
        teams,
      );
      expect(code).toBe(1);
      expect(errs.join("\n")).toContain("is not installed");
    } finally {
      console.error = orig;
    }
  });

  test("team with malformed id -> exit 1", async () => {
    const errs: string[] = [];
    const orig = console.error;
    console.error = (...args: unknown[]) => {
      errs.push(args.map(String).join(" "));
    };
    try {
      const code = await runTeam(
        { kind: "team", teamId: "bad id with spaces", unset: false },
        cwd,
        settings,
        teams,
      );
      expect(code).toBe(1);
      expect(errs.join("\n")).toContain("invalid team id");
    } finally {
      console.error = orig;
    }
  });

  test("team --unset removes defaultTeam from global settings", async () => {
    mkdirSync(join(homeDir, ".jie"), { recursive: true });
    writeFileSync(
      join(homeDir, ".jie", "settings.json"),
      JSON.stringify({ defaultProvider: "p", defaultModel: "m", defaultTeam: "dev" }),
    );
    const code = await runTeam(
      { kind: "team", unset: true },
      cwd,
      settings,
      teams,
    );
    expect(code).toBe(0);
    expect(JSON.parse(readFileSync(join(homeDir, ".jie", "settings.json"), "utf-8"))).toEqual({
      defaultProvider: "p",
      defaultModel: "m",
    });
  });

  test("team --unset removes defaultTeam from project settings", async () => {
    mkdirSync(join(cwd, ".jie"), { recursive: true });
    writeFileSync(
      join(cwd, ".jie", "settings.json"),
      JSON.stringify({ defaultProvider: "p", defaultModel: "m", defaultTeam: "dev" }),
    );
    const code = await runTeam(
      { kind: "team", unset: true },
      cwd,
      settings,
      teams,
    );
    expect(code).toBe(0);
    expect(JSON.parse(readFileSync(join(cwd, ".jie", "settings.json"), "utf-8"))).toEqual({
      defaultProvider: "p",
      defaultModel: "m",
    });
  });

  test("team (no arg) prints defaultTeam and installed list", async () => {
    mkdirSync(join(homeDir, ".jie", "teams", "dev"), { recursive: true });
    writeFileSync(join(homeDir, ".jie", "teams", "dev", "TEAM.md"), "");
    mkdirSync(join(homeDir, ".jie"), { recursive: true });
    writeFileSync(
      join(homeDir, ".jie", "settings.json"),
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
        cwd,
        settings,
        teams,
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
        cwd,
        settings,
        teams,
      );
      expect(code).toBe(0);
      const out = logs.join("\n");
      expect(out).toContain("defaultTeam: unset");
    } finally {
      console.log = orig;
    }
  });
});
