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
  let homeDir: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "jie-cli-settings-"));
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  test("load() returns {} when no settings files exist", () => {
    const store = makeSettingsStore(homeDir);
    expect(store.load("/nonexistent")).toEqual({});
  });

  test("write(global) writes to ~/.jie/settings.json", () => {
    const store = makeSettingsStore(homeDir);
    const cwd = mkdtempSync(join(tmpdir(), "jie-cli-cwd-"));
    try {
      store.write(
        { defaultProvider: "anthropic", defaultModel: "claude-sonnet-4" },
        "global",
        cwd,
      );
      const path = join(homeDir, ".jie", "settings.json");
      expect(existsSync(path)).toBe(true);
      expect(JSON.parse(readFileSync(path, "utf-8"))).toEqual({
        defaultProvider: "anthropic",
        defaultModel: "claude-sonnet-4",
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("write(project) writes to {cwd}/.jie/settings.json when no project root above", () => {
    const store = makeSettingsStore(homeDir);
    const cwd = mkdtempSync(join(tmpdir(), "jie-cli-cwd-"));
    try {
      store.write({ defaultTeam: "dev" }, "project", cwd);
      const path = join(cwd, ".jie", "settings.json");
      expect(existsSync(path)).toBe(true);
      expect(JSON.parse(readFileSync(path, "utf-8"))).toEqual({ defaultTeam: "dev" });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("write(project) writes under the discovered project root, not cwd", () => {
    const store = makeSettingsStore(homeDir);
    const projectRoot = mkdtempSync(join(tmpdir(), "jie-cli-proj-"));
    const nested = join(projectRoot, "a", "b");
    try {
      mkdirSync(join(projectRoot, ".jie"), { recursive: true });
      mkdirSync(nested, { recursive: true });
      store.write({ defaultTeam: "dev" }, "project", nested);
      const path = join(projectRoot, ".jie", "settings.json");
      expect(existsSync(path)).toBe(true);
      expect(nested === projectRoot).toBe(false);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test("unsetDefaultTeam removes defaultTeam from project settings", () => {
    const store = makeSettingsStore(homeDir);
    const cwd = mkdtempSync(join(tmpdir(), "jie-cli-cwd-"));
    try {
      mkdirSync(join(cwd, ".jie"), { recursive: true });
      writeFileSync(
        join(cwd, ".jie", "settings.json"),
        JSON.stringify({ defaultProvider: "p", defaultModel: "m", defaultTeam: "dev" }),
      );
      store.unsetDefaultTeam(cwd);
      const after = JSON.parse(
        readFileSync(join(cwd, ".jie", "settings.json"), "utf-8"),
      );
      expect(after).toEqual({ defaultProvider: "p", defaultModel: "m" });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  test("unsetDefaultTeam removes defaultTeam from global settings when no project root", () => {
    const store = makeSettingsStore(homeDir);
    const cwd = mkdtempSync(join(tmpdir(), "jie-cli-cwd-"));
    try {
      mkdirSync(join(homeDir, ".jie"), { recursive: true });
      writeFileSync(
        join(homeDir, ".jie", "settings.json"),
        JSON.stringify({ defaultProvider: "p", defaultModel: "m", defaultTeam: "dev" }),
      );
      store.unsetDefaultTeam(cwd);
      const after = JSON.parse(
        readFileSync(join(homeDir, ".jie", "settings.json"), "utf-8"),
      );
      expect(after).toEqual({ defaultProvider: "p", defaultModel: "m" });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
