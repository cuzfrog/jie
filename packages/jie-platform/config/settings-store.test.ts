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
    const store = makeSettingsStore(cwd, homeJieDir);
    expect(store.load()).toEqual({});
  });

  test("write(global) writes to ~/.jie/settings.json", () => {
    const store = makeSettingsStore(cwd, homeJieDir);
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
    const store = makeSettingsStore(cwd, homeJieDir);
    store.write({ defaultTeam: "dev" }, "project");
    const path = join(cwd, ".jie", "settings.json");
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf-8"))).toEqual({ defaultTeam: "dev" });
  });

  test("write(project) writes under the discovered project root, not cwd", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "jie-cli-proj-"));
    const nested = join(projectRoot, "a", "b");
    try {
      mkdirSync(join(projectRoot, ".jie"), { recursive: true });
      mkdirSync(nested, { recursive: true });
      const store = makeSettingsStore(nested, homeJieDir);
      store.write({ defaultTeam: "dev" }, "project");
      const path = join(projectRoot, ".jie", "settings.json");
      expect(existsSync(path)).toBe(true);
      expect(nested === projectRoot).toBe(false);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test("unsetDefaultTeam removes defaultTeam from project settings", () => {
    const store = makeSettingsStore(cwd, homeJieDir);
    mkdirSync(join(cwd, ".jie"), { recursive: true });
    writeFileSync(
      join(cwd, ".jie", "settings.json"),
      JSON.stringify({ defaultProvider: "p", defaultModel: "m", defaultTeam: "dev" }),
    );
    store.unsetDefaultTeam();
    const after = JSON.parse(
      readFileSync(join(cwd, ".jie", "settings.json"), "utf-8"),
    );
    expect(after).toEqual({ defaultProvider: "p", defaultModel: "m" });
  });

  test("unsetDefaultTeam removes defaultTeam from global settings when no project root", () => {
    const store = makeSettingsStore(cwd, homeJieDir);
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(
      join(homeJieDir, "settings.json"),
      JSON.stringify({ defaultProvider: "p", defaultModel: "m", defaultTeam: "dev" }),
    );
    store.unsetDefaultTeam();
    const after = JSON.parse(
      readFileSync(join(homeJieDir, "settings.json"), "utf-8"),
    );
    expect(after).toEqual({ defaultProvider: "p", defaultModel: "m" });
  });
});
