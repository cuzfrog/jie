import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeAuthStore, makeSettingsStore } from "./index.ts";

function projectJieOf(root: string): string {
  return join(root, ".jie");
}

describe("SettingsStore.load", () => {
  let homeJieDir: string;
  let projectRoot: string;
  let cwd: string;

  beforeEach(() => {
    const homeDir = mkdtempSync(join(tmpdir(), "jie-home-"));
    homeJieDir = join(homeDir, ".jie");
    projectRoot = mkdtempSync(join(tmpdir(), "jie-project-"));
    cwd = projectRoot;
  });

  afterEach(() => {
    rmSync(homeJieDir, { recursive: true, force: true });
    rmSync(projectRoot, { recursive: true, force: true });
  });

  test("walks up to find project .jie/ and merges with global", () => {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(
      join(homeJieDir, "settings.json"),
      JSON.stringify({ defaultTeam: "global-team" }),
    );
    mkdirSync(join(projectRoot, ".jie"), { recursive: true });
    writeFileSync(
      join(projectRoot, ".jie", "settings.json"),
      JSON.stringify({ defaultTeam: "dev", unknown_field: 1 }),
    );

    const merged = makeSettingsStore(cwd, homeJieDir, projectJieOf(projectRoot)).load();
    expect(merged.defaultTeam).toBe("dev");
    expect("unknown_field" in (merged as unknown as Record<string, unknown>)).toBe(false);
  });

  test("walks up from a subdirectory of the project", () => {
    mkdirSync(homeJieDir, { recursive: true });
    mkdirSync(join(projectRoot, ".jie"), { recursive: true });
    writeFileSync(
      join(projectRoot, ".jie", "settings.json"),
      JSON.stringify({ defaultTeam: "nested" }),
    );
    const subdir = join(projectRoot, "a", "b", "c");
    mkdirSync(subdir, { recursive: true });

    const merged = makeSettingsStore(subdir, homeJieDir, projectJieOf(projectRoot)).load();
    expect(merged.defaultTeam).toBe("nested");
  });

  test("project values win over global for top-level scalars", () => {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(
      join(homeJieDir, "settings.json"),
      JSON.stringify({ defaultProvider: "openai", defaultModel: "gpt-4" }),
    );
    mkdirSync(join(projectRoot, ".jie"), { recursive: true });
    writeFileSync(
      join(projectRoot, ".jie", "settings.json"),
      JSON.stringify({ defaultProvider: "anthropic" }),
    );

    const merged = makeSettingsStore(cwd, homeJieDir, projectJieOf(projectRoot)).load();
    expect(merged.defaultProvider).toBe("anthropic");
    expect(merged.defaultModel).toBe("gpt-4");
  });

  test("returns empty object when neither file exists", () => {
    const merged = makeSettingsStore(cwd, homeJieDir, projectJieOf(projectRoot)).load();
    expect(merged).toEqual({});
  });

  test("unknown defaultProvider is accepted (custom providers are valid via models.json)", () => {
    mkdirSync(join(projectRoot, ".jie"), { recursive: true });
    writeFileSync(
      join(projectRoot, ".jie", "settings.json"),
      JSON.stringify({ defaultProvider: "lm-studio", defaultModel: "qwen3.5-2b" }),
    );
    const merged = makeSettingsStore(cwd, homeJieDir, projectJieOf(projectRoot)).load();
    expect(merged.defaultProvider).toBe("lm-studio");
    expect(merged.defaultModel).toBe("qwen3.5-2b");
  });
});

describe("AuthStore.load", () => {
  let homeJieDir: string;
  let homeDir: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "jie-home-"));
    homeJieDir = join(homeDir, ".jie");
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  test("returns {} when ~/.jie/auth.json does not exist", () => {
    expect(makeAuthStore(homeJieDir).load()).toEqual({});
  });

  test("returns the typed shape for an api_key entry", () => {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(
      join(homeJieDir, "auth.json"),
      JSON.stringify({ anthropic: { type: "api_key", key: "sk-test" } }),
    );
    const auth = makeAuthStore(homeJieDir).load();
    expect(auth.anthropic).toEqual({ type: "api_key", key: "sk-test" });
  });
});
