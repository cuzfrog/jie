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
import { makeSettingsStore } from "./settings-store";

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
    const store = makeSettingsStore(cwd, homeJieDir, null, () => null);
    expect(store.load()).toEqual({});
  });

  test("setDefaultProvider writes to ~/.jie/settings.json", () => {
    const store = makeSettingsStore(cwd, homeJieDir, null, () => null);
    store.setDefaultProvider("anthropic", "claude-sonnet-4");
    const path = join(homeJieDir, "settings.json");
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf-8"))).toEqual({
      defaultProvider: "anthropic",
      defaultModel: "claude-sonnet-4",
    });
  });

  test("setDefaultProvider always writes to global, even when projectJieDir is set", () => {
    const projectJieDir = join(cwd, ".jie");
    mkdirSync(projectJieDir, { recursive: true });
    const store = makeSettingsStore(cwd, homeJieDir, projectJieDir, () => null);
    store.setDefaultProvider("anthropic", "claude-sonnet-4");
    expect(existsSync(join(projectJieDir, "settings.json"))).toBe(false);
    expect(JSON.parse(readFileSync(join(homeJieDir, "settings.json"), "utf-8"))).toEqual({
      defaultProvider: "anthropic",
      defaultModel: "claude-sonnet-4",
    });
  });

  test("setDefaultProvider does not invoke the team resolver", () => {
    const resolve = vi.fn(() => "user" as const);
    const store = makeSettingsStore(cwd, homeJieDir, null, resolve);
    store.setDefaultProvider("anthropic", "claude-sonnet-4");
    expect(resolve).not.toHaveBeenCalled();
  });

  test("setDefaultTeam writes to project file when resolver returns 'project'", () => {
    const projectJieDir = join(cwd, ".jie");
    mkdirSync(projectJieDir, { recursive: true });
    const store = makeSettingsStore(cwd, homeJieDir, projectJieDir, () => "project");
    store.setDefaultTeam("dev");
    expect(JSON.parse(readFileSync(join(projectJieDir, "settings.json"), "utf-8"))).toEqual({
      defaultTeam: "dev",
    });
  });

  test("setDefaultTeam writes to global file when resolver returns 'user'", () => {
    const store = makeSettingsStore(cwd, homeJieDir, null, () => "user");
    store.setDefaultTeam("dev");
    expect(JSON.parse(readFileSync(join(homeJieDir, "settings.json"), "utf-8"))).toEqual({
      defaultTeam: "dev",
    });
  });

  test("setDefaultTeam writes to global file when resolver returns 'builtin'", () => {
    const store = makeSettingsStore(cwd, homeJieDir, null, () => "builtin");
    store.setDefaultTeam("minimal");
    expect(JSON.parse(readFileSync(join(homeJieDir, "settings.json"), "utf-8"))).toEqual({
      defaultTeam: "minimal",
    });
  });

  test("setDefaultTeam throws TEAM_NOT_FOUND when resolver returns null", () => {
    const store = makeSettingsStore(cwd, homeJieDir, null, () => null);
    expect(() => store.setDefaultTeam("ghost")).toThrow(/TEAM_NOT_FOUND|not found/);
    expect(existsSync(join(homeJieDir, "settings.json"))).toBe(false);
  });

  test("setDefaultTeam writes to the projectJieDir, not cwd", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "jie-cli-proj-"));
    const projectJieDir = join(projectRoot, ".jie");
    const nested = join(projectRoot, "a", "b");
    try {
      mkdirSync(projectJieDir, { recursive: true });
      mkdirSync(nested, { recursive: true });
      const store = makeSettingsStore(nested, homeJieDir, projectJieDir, () => "project");
      store.setDefaultTeam("dev");
      expect(existsSync(join(projectJieDir, "settings.json"))).toBe(true);
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
    const store = makeSettingsStore(cwd, homeJieDir, projectJieDir, () => null);
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
    const store = makeSettingsStore(cwd, homeJieDir, null, () => null);
    store.unsetDefaultTeam();
    const after = JSON.parse(
      readFileSync(join(homeJieDir, "settings.json"), "utf-8"),
    );
    expect(after).toEqual({ defaultProvider: "p", defaultModel: "m" });
  });

  test("unsetDefaultTeam clears defaultTeam from both project and global files", () => {
    const projectJieDir = join(cwd, ".jie");
    mkdirSync(projectJieDir, { recursive: true });
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(
      join(projectJieDir, "settings.json"),
      JSON.stringify({ defaultProvider: "p", defaultModel: "m", defaultTeam: "proj-team" }),
    );
    writeFileSync(
      join(homeJieDir, "settings.json"),
      JSON.stringify({ defaultProvider: "p", defaultModel: "m", defaultTeam: "user-team" }),
    );
    const store = makeSettingsStore(cwd, homeJieDir, projectJieDir, () => null);
    store.unsetDefaultTeam();
    expect(JSON.parse(readFileSync(join(projectJieDir, "settings.json"), "utf-8"))).toEqual({
      defaultProvider: "p",
      defaultModel: "m",
    });
    expect(JSON.parse(readFileSync(join(homeJieDir, "settings.json"), "utf-8"))).toEqual({
      defaultProvider: "p",
      defaultModel: "m",
    });
  });

  test("unsetDefaultTeam is idempotent when no settings files exist", () => {
    const store = makeSettingsStore(cwd, homeJieDir, null, () => null);
    expect(() => store.unsetDefaultTeam()).not.toThrow();
  });
});
