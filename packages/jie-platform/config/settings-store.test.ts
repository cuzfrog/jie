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
import { makeSettingsStore } from "./settings-store.ts";

describe("SettingsStore", () => {
  let homeJieDir: string;
  let cwd: string;

  beforeEach(() => {
    const homeDir = mkdtempSync(join(tmpdir(), "jie-cli-settings-"));
    homeJieDir = join(homeDir, ".jie");
    cwd = mkdtempSync(join(tmpdir(), "jie-cli-settings-cwd-"));
  });

  afterEach(() => {
    rmSync(homeJieDir, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  });

  test("load() returns {} when no settings files exist", () => {
    const store = makeSettingsStore(cwd, homeJieDir, null);
    expect(store.load()).toEqual({});
  });

  test("write(global) writes to ~/.jie/settings.json", () => {
    const store = makeSettingsStore(cwd, homeJieDir, null);
    store.write(
      { defaultProvider: "anthropic", defaultModel: "claude-sonnet-4" },
      "global",
    );
    const path = join(homeJieDir, "settings.json");
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf-8"))).toEqual({
      defaultProvider: "anthropic",
      defaultModel: "claude-sonnet-4",
    });
  });

  test("write(project) writes to {cwd}/.jie/settings.json when no project root above", () => {
    const store = makeSettingsStore(cwd, homeJieDir, null);
    store.write({ defaultTeam: "dev" }, "project");
    const path = join(cwd, ".jie", "settings.json");
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf-8"))).toEqual({ defaultTeam: "dev" });
  });

  test("write(project) writes to the projectJieDir, not cwd", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "jie-cli-proj-"));
    const projectJieDir = join(projectRoot, ".jie");
    const nested = join(projectRoot, "a", "b");
    try {
      mkdirSync(projectJieDir, { recursive: true });
      mkdirSync(nested, { recursive: true });
      const store = makeSettingsStore(nested, homeJieDir, projectJieDir);
      store.write({ defaultTeam: "dev" }, "project");
      const path = join(projectJieDir, "settings.json");
      expect(existsSync(path)).toBe(true);
      expect(nested === projectRoot).toBe(false);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test("unsetDefaultTeam removes defaultTeam from project settings", () => {
    const projectJieDir = join(cwd, ".jie");
    mkdirSync(projectJieDir, { recursive: true });
    writeFileSync(
      join(projectJieDir, "settings.json"),
      JSON.stringify({ defaultProvider: "p", defaultModel: "m", defaultTeam: "dev" }),
    );
    const store = makeSettingsStore(cwd, homeJieDir, projectJieDir);
    store.unsetDefaultTeam();
    const after = JSON.parse(
      readFileSync(join(projectJieDir, "settings.json"), "utf-8"),
    );
    expect(after).toEqual({ defaultProvider: "p", defaultModel: "m" });
  });

  test("unsetDefaultTeam removes defaultTeam from global settings when no project root", () => {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(
      join(homeJieDir, "settings.json"),
      JSON.stringify({ defaultProvider: "p", defaultModel: "m", defaultTeam: "dev" }),
    );
    const store = makeSettingsStore(cwd, homeJieDir, null);
    store.unsetDefaultTeam();
    const after = JSON.parse(
      readFileSync(join(homeJieDir, "settings.json"), "utf-8"),
    );
    expect(after).toEqual({ defaultProvider: "p", defaultModel: "m" });
  });
});
