import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SettingsStoreImpl } from "./settings-store";

describe("SettingsStoreImpl", () => {
  let homeDir: string;
  let homeJieDir: string;
  let cwd: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "jie-cli-settings-"));
    homeJieDir = join(homeDir, ".jie");
    cwd = mkdtempSync(join(tmpdir(), "jie-cli-settings-cwd-"));
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  });

  test("load() returns {} when no settings files exist", () => {
    const store = new SettingsStoreImpl(cwd, homeJieDir, null);
    expect(store.load()).toEqual({});
  });

  test("setDefaultProvider writes to ~/.jie/settings.json", () => {
    const store = new SettingsStoreImpl(cwd, homeJieDir, null);
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
    const store = new SettingsStoreImpl(cwd, homeJieDir, projectJieDir);
    store.setDefaultProvider("anthropic", "claude-sonnet-4");
    expect(existsSync(join(projectJieDir, "settings.json"))).toBe(false);
    expect(JSON.parse(readFileSync(join(homeJieDir, "settings.json"), "utf-8"))).toEqual({
      defaultProvider: "anthropic",
      defaultModel: "claude-sonnet-4",
    });
  });

  test("setDefaultTeam with scope 'project' writes to the project settings path", () => {
    const projectJieDir = join(cwd, ".jie");
    const store = new SettingsStoreImpl(cwd, homeJieDir, projectJieDir);
    store.setDefaultTeam("dev", "project");
    expect(JSON.parse(readFileSync(join(projectJieDir, "settings.json"), "utf-8"))).toEqual({ defaultTeam: "dev" });
  });

  test("setDefaultTeam with scope 'project' falls back to cwd/.jie when projectJieDir is null", () => {
    const store = new SettingsStoreImpl(cwd, homeJieDir, null);
    store.setDefaultTeam("dev", "project");
    expect(JSON.parse(readFileSync(join(cwd, ".jie", "settings.json"), "utf-8"))).toEqual({ defaultTeam: "dev" });
  });

  test("setDefaultTeam with scope 'global' writes to the home settings path", () => {
    const store = new SettingsStoreImpl(cwd, homeJieDir, null);
    store.setDefaultTeam("dev", "global");
    expect(JSON.parse(readFileSync(join(homeJieDir, "settings.json"), "utf-8"))).toEqual({ defaultTeam: "dev" });
  });

  test("setDefaultTeam with scope 'project' writes to the projectJieDir, not cwd", () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "jie-cli-proj-"));
    const projectJieDir = join(projectRoot, ".jie");
    const nested = join(projectRoot, "a", "b");
    try {
      mkdirSync(nested, { recursive: true });
      const store = new SettingsStoreImpl(nested, homeJieDir, projectJieDir);
      store.setDefaultTeam("dev", "project");
      expect(existsSync(join(projectJieDir, "settings.json"))).toBe(true);
      expect(existsSync(join(nested, ".jie", "settings.json"))).toBe(false);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
