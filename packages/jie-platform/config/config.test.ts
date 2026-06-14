import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadAuthJson,
  loadMergedSettings,
  resolveStaleDefaultTeam,
} from "./index.ts";
import type { McpConfig, McpServerConfig } from "./types.ts";

describe("loadMergedSettings", () => {
  let homeDir: string;
  let projectRoot: string;
  let cwd: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "jie-home-"));
    projectRoot = mkdtempSync(join(tmpdir(), "jie-project-"));
    cwd = projectRoot;
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
    rmSync(projectRoot, { recursive: true, force: true });
  });

  test("walks up to find project .jie/ and merges with global", () => {
    mkdirSync(join(homeDir, ".jie"), { recursive: true });
    writeFileSync(
      join(homeDir, ".jie", "settings.json"),
      JSON.stringify({ defaultTeam: "global-team" }),
    );
    mkdirSync(join(projectRoot, ".jie"), { recursive: true });
    writeFileSync(
      join(projectRoot, ".jie", "settings.json"),
      JSON.stringify({ defaultTeam: "dev", unknown_field: 1 }),
    );

    const merged = loadMergedSettings(cwd, { homeDir });
    expect(merged.defaultTeam).toBe("dev");
    expect("unknown_field" in (merged as Record<string, unknown>)).toBe(false);
  });

  test("walks up from a subdirectory of the project", () => {
    mkdirSync(join(homeDir, ".jie"), { recursive: true });
    mkdirSync(join(projectRoot, ".jie"), { recursive: true });
    writeFileSync(
      join(projectRoot, ".jie", "settings.json"),
      JSON.stringify({ defaultTeam: "nested" }),
    );
    const subdir = join(projectRoot, "a", "b", "c");
    mkdirSync(subdir, { recursive: true });

    const merged = loadMergedSettings(subdir, { homeDir });
    expect(merged.defaultTeam).toBe("nested");
  });

  test("project values win over global for top-level scalars", () => {
    mkdirSync(join(homeDir, ".jie"), { recursive: true });
    writeFileSync(
      join(homeDir, ".jie", "settings.json"),
      JSON.stringify({ defaultProvider: "openai", defaultModel: "gpt-4" }),
    );
    mkdirSync(join(projectRoot, ".jie"), { recursive: true });
    writeFileSync(
      join(projectRoot, ".jie", "settings.json"),
      JSON.stringify({ defaultProvider: "anthropic" }),
    );

    const merged = loadMergedSettings(cwd, { homeDir });
    expect(merged.defaultProvider).toBe("anthropic");
    expect(merged.defaultModel).toBe("gpt-4");
  });

  test("returns empty object when neither file exists", () => {
    const merged = loadMergedSettings(cwd, { homeDir });
    expect(merged).toEqual({});
  });

  test("throws 'invalid defaultTeam' when charset is violated", () => {
    mkdirSync(join(projectRoot, ".jie"), { recursive: true });
    writeFileSync(
      join(projectRoot, ".jie", "settings.json"),
      JSON.stringify({ defaultTeam: "x y" }),
    );
    expect(() => loadMergedSettings(cwd, { homeDir })).toThrow(/invalid defaultTeam/);
  });

  test("throws 'must be a string' on shape errors", () => {
    mkdirSync(join(projectRoot, ".jie"), { recursive: true });
    writeFileSync(
      join(projectRoot, ".jie", "settings.json"),
      JSON.stringify({ defaultProvider: 42 }),
    );
    expect(() => loadMergedSettings(cwd, { homeDir })).toThrow(
      /defaultProvider must be a string/,
    );
  });

  test("throws on JSON parse error", () => {
    mkdirSync(join(projectRoot, ".jie"), { recursive: true });
    writeFileSync(join(projectRoot, ".jie", "settings.json"), "{ not json");
    expect(() => loadMergedSettings(cwd, { homeDir })).toThrow();
  });

  test("unknown defaultProvider is WARN-and-ignored; field is absent", () => {
    mkdirSync(join(projectRoot, ".jie"), { recursive: true });
    writeFileSync(
      join(projectRoot, ".jie", "settings.json"),
      JSON.stringify({ defaultProvider: "not-a-real-provider" }),
    );
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
    const merged = loadMergedSettings(cwd, { homeDir });
    expect(merged.defaultProvider).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("resolveStaleDefaultTeam", () => {
  let homeDir: string;
  let projectRoot: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "jie-home-"));
    projectRoot = mkdtempSync(join(tmpdir(), "jie-project-"));
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
    rmSync(projectRoot, { recursive: true, force: true });
  });

  test("returns first-installed team and writes back to project settings", () => {
    mkdirSync(join(projectRoot, ".jie", "teams", "real"), { recursive: true });
    writeFileSync(join(projectRoot, ".jie", "teams", "real", "TEAM.md"), "x");
    mkdirSync(join(projectRoot, ".jie"), { recursive: true });
    writeFileSync(
      join(projectRoot, ".jie", "settings.json"),
      JSON.stringify({ defaultTeam: "ghost" }),
    );
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

    const result = resolveStaleDefaultTeam(
      { defaultTeam: "ghost" },
      projectRoot,
      { homeDir },
    );
    expect(result).toBe("real");
    const written = JSON.parse(
      readFileSync(join(projectRoot, ".jie", "settings.json"), "utf-8"),
    );
    expect(written.defaultTeam).toBe("real");
    warnSpy.mockRestore();
  });

  test("returns null and removes defaultTeam when no user teams installed", () => {
    mkdirSync(join(projectRoot, ".jie"), { recursive: true });
    writeFileSync(
      join(projectRoot, ".jie", "settings.json"),
      JSON.stringify({ defaultTeam: "ghost", defaultProvider: "anthropic" }),
    );
    const warnSpy = spyOn(console, "warn").mockImplementation(() => {});

    const result = resolveStaleDefaultTeam(
      { defaultTeam: "ghost" },
      projectRoot,
      { homeDir },
    );
    expect(result).toBeNull();
    const written = JSON.parse(
      readFileSync(join(projectRoot, ".jie", "settings.json"), "utf-8"),
    );
    expect(written.defaultTeam).toBeUndefined();
    expect(written.defaultProvider).toBe("anthropic");
    warnSpy.mockRestore();
  });

  test("returns null when defaultTeam is not set", () => {
    const result = resolveStaleDefaultTeam({}, projectRoot, { homeDir });
    expect(result).toBeNull();
  });

  test("returns null when defaultTeam resolves to an installed team", () => {
    mkdirSync(join(projectRoot, ".jie", "teams", "alive"), { recursive: true });
    writeFileSync(join(projectRoot, ".jie", "teams", "alive", "TEAM.md"), "x");
    mkdirSync(join(projectRoot, ".jie"), { recursive: true });
    writeFileSync(
      join(projectRoot, ".jie", "settings.json"),
      JSON.stringify({ defaultTeam: "alive" }),
    );
    const result = resolveStaleDefaultTeam(
      { defaultTeam: "alive" },
      projectRoot,
      { homeDir },
    );
    expect(result).toBeNull();
  });

  test("picks alphabetically first across project + global, deduped", () => {
    mkdirSync(join(projectRoot, ".jie", "teams", "zeta"), { recursive: true });
    writeFileSync(join(projectRoot, ".jie", "teams", "zeta", "TEAM.md"), "x");
    mkdirSync(join(homeDir, ".jie", "teams", "alpha"), { recursive: true });
    writeFileSync(join(homeDir, ".jie", "teams", "alpha", "TEAM.md"), "x");
    mkdirSync(join(projectRoot, ".jie"), { recursive: true });
    writeFileSync(
      join(projectRoot, ".jie", "settings.json"),
      JSON.stringify({ defaultTeam: "ghost" }),
    );

    const result = resolveStaleDefaultTeam(
      { defaultTeam: "ghost" },
      projectRoot,
      { homeDir },
    );
    expect(result).toBe("alpha");
  });
});

describe("loadAuthJson", () => {
  let homeDir: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "jie-home-"));
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  test("returns {} when ~/.jie/auth.json does not exist", () => {
    expect(loadAuthJson({ homeDir })).toEqual({});
  });

  test("returns the typed shape for an api_key entry", () => {
    mkdirSync(join(homeDir, ".jie"), { recursive: true });
    writeFileSync(
      join(homeDir, ".jie", "auth.json"),
      JSON.stringify({ anthropic: { type: "api_key", key: "sk-test" } }),
    );
    const auth = loadAuthJson({ homeDir });
    expect(auth.anthropic).toEqual({ type: "api_key", key: "sk-test" });
  });
});

describe("McpServerConfig", () => {
  test("stdio and http variants compile", () => {
    const stdio: McpServerConfig = { transport: "stdio", command: "bin", args: ["a"] };
    const http: McpServerConfig = { transport: "http", url: "https://x" };
    const withAuth: McpServerConfig = {
      transport: "http",
      url: "https://x",
      auth: { token_env: "TOKEN" },
    };
    const cfg: McpConfig = { servers: { s1: stdio, s2: http, s3: withAuth } };
    expect(cfg.servers.s1?.transport).toBe("stdio");
    expect(cfg.servers.s2?.url).toBe("https://x");
    expect(cfg.servers.s3?.auth?.token_env).toBe("TOKEN");
  });

  test("a stdio entry without command compiles (runtime validation deferred to Day 2 MCP client)", () => {
    const stdio: McpServerConfig = { transport: "stdio" };
    expect(stdio.transport).toBe("stdio");
  });
});