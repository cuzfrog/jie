import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

  test("load() throws INVALID_CONFIG when a field has the wrong shape", () => {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(join(homeJieDir, "settings.json"), `${JSON.stringify({ compaction: { reserveTokens: "8192" } })}\n`);
    const store = new SettingsStoreImpl(cwd, homeJieDir, null);
    expect(() => store.load()).toThrow(
      expect.objectContaining({ code: "INVALID_CONFIG", message: expect.stringMatching(/compaction\.reserveTokens must be a positive integer/) }),
    );
  });

  test("load() throws INVALID_CONFIG when a settings file fails to parse", () => {
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(join(homeJieDir, "settings.json"), "{ not json");
    const store = new SettingsStoreImpl(cwd, homeJieDir, null);
    expect(() => store.load()).toThrow(expect.objectContaining({ code: "INVALID_CONFIG", message: expect.stringContaining("settings.json") }));
  });

  test("setDefaultEffort throws INVALID_CONFIG on a corrupt settings file and leaves it untouched", () => {
    mkdirSync(homeJieDir, { recursive: true });
    const path = join(homeJieDir, "settings.json");
    writeFileSync(path, "{ not json");
    const store = new SettingsStoreImpl(cwd, homeJieDir, null);
    expect(() => store.setDefaultEffort("high")).toThrow(expect.objectContaining({ code: "INVALID_CONFIG" }));
    expect(readFileSync(path, "utf-8")).toBe("{ not json");
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

  test("setDefaultProvider writes to global when the project settings file is absent", () => {
    const projectJieDir = join(cwd, ".jie");
    const store = new SettingsStoreImpl(cwd, homeJieDir, projectJieDir);
    store.setDefaultProvider("anthropic", "claude-sonnet-4");
    expect(existsSync(join(projectJieDir, "settings.json"))).toBe(false);
    expect(JSON.parse(readFileSync(join(homeJieDir, "settings.json"), "utf-8"))).toEqual({
      defaultProvider: "anthropic",
      defaultModel: "claude-sonnet-4",
    });
  });

  test("setDefaultProvider writes to the project settings when they define defaultModel", () => {
    const projectJieDir = join(cwd, ".jie");
    mkdirSync(projectJieDir, { recursive: true });
    mkdirSync(homeJieDir, { recursive: true });
    writeFileSync(
      join(projectJieDir, "settings.json"),
      `${JSON.stringify({ defaultProvider: "openai", defaultModel: "gpt-4o", defaultEffort: "high" })}\n`,
    );
    writeFileSync(
      join(homeJieDir, "settings.json"),
      `${JSON.stringify({ defaultProvider: "anthropic", defaultModel: "claude-sonnet-4" })}\n`,
    );
    const store = new SettingsStoreImpl(cwd, homeJieDir, projectJieDir);
    store.setDefaultProvider("lm-studio", "qwen3.5-2b");
    expect(JSON.parse(readFileSync(join(projectJieDir, "settings.json"), "utf-8"))).toEqual({
      defaultProvider: "lm-studio",
      defaultModel: "qwen3.5-2b",
      defaultEffort: "high",
    });
    expect(JSON.parse(readFileSync(join(homeJieDir, "settings.json"), "utf-8"))).toEqual({
      defaultProvider: "anthropic",
      defaultModel: "claude-sonnet-4",
    });
  });

  test("setDefaultProvider writes to the project settings when they define only defaultProvider", () => {
    const projectJieDir = join(cwd, ".jie");
    mkdirSync(projectJieDir, { recursive: true });
    writeFileSync(join(projectJieDir, "settings.json"), `${JSON.stringify({ defaultProvider: "openai" })}\n`);
    const store = new SettingsStoreImpl(cwd, homeJieDir, projectJieDir);
    store.setDefaultProvider("lm-studio", "qwen3.5-2b");
    expect(JSON.parse(readFileSync(join(projectJieDir, "settings.json"), "utf-8"))).toEqual({
      defaultProvider: "lm-studio",
      defaultModel: "qwen3.5-2b",
    });
    expect(existsSync(join(homeJieDir, "settings.json"))).toBe(false);
  });

  test("setDefaultProvider writes to the project settings when they define only defaultModel", () => {
    const projectJieDir = join(cwd, ".jie");
    mkdirSync(projectJieDir, { recursive: true });
    writeFileSync(join(projectJieDir, "settings.json"), `${JSON.stringify({ defaultModel: "gpt-4o" })}\n`);
    const store = new SettingsStoreImpl(cwd, homeJieDir, projectJieDir);
    store.setDefaultProvider("lm-studio", "qwen3.5-2b");
    expect(JSON.parse(readFileSync(join(projectJieDir, "settings.json"), "utf-8"))).toEqual({
      defaultProvider: "lm-studio",
      defaultModel: "qwen3.5-2b",
    });
    expect(existsSync(join(homeJieDir, "settings.json"))).toBe(false);
  });

  test("setDefaultProvider writes to global when the project settings define neither model key", () => {
    const projectJieDir = join(cwd, ".jie");
    mkdirSync(projectJieDir, { recursive: true });
    writeFileSync(join(projectJieDir, "settings.json"), `${JSON.stringify({ defaultEffort: "high" })}\n`);
    const store = new SettingsStoreImpl(cwd, homeJieDir, projectJieDir);
    store.setDefaultProvider("anthropic", "claude-sonnet-4");
    expect(JSON.parse(readFileSync(join(projectJieDir, "settings.json"), "utf-8"))).toEqual({ defaultEffort: "high" });
    expect(JSON.parse(readFileSync(join(homeJieDir, "settings.json"), "utf-8"))).toEqual({
      defaultProvider: "anthropic",
      defaultModel: "claude-sonnet-4",
    });
  });

  test("setDefaultEffort writes defaultEffort to ~/.jie/settings.json", () => {
    const store = new SettingsStoreImpl(cwd, homeJieDir, null);
    store.setDefaultEffort("high");
    expect(JSON.parse(readFileSync(join(homeJieDir, "settings.json"), "utf-8"))).toEqual({ defaultEffort: "high" });
  });

  test("setDefaultEffort preserves existing settings fields", () => {
    const store = new SettingsStoreImpl(cwd, homeJieDir, null);
    store.setDefaultProvider("anthropic", "claude-sonnet-4");
    store.setDefaultEffort("max");
    expect(JSON.parse(readFileSync(join(homeJieDir, "settings.json"), "utf-8"))).toEqual({
      defaultProvider: "anthropic",
      defaultModel: "claude-sonnet-4",
      defaultEffort: "max",
    });
  });

  test("setDefaultTeam with scope 'project' writes to the project settings path", () => {
    const projectJieDir = join(cwd, ".jie");
    const store = new SettingsStoreImpl(cwd, homeJieDir, projectJieDir);
    store.setDefaultTeam("dev", "project");
    expect(JSON.parse(readFileSync(join(projectJieDir, "settings.json"), "utf-8"))).toEqual({ defaultTeam: "dev" });
  });

  test("setNotificationSoundEnabled writes notification.soundEnabled to ~/.jie/settings.json", () => {
    const store = new SettingsStoreImpl(cwd, homeJieDir, null);
    store.setNotificationSoundEnabled(false);
    expect(JSON.parse(readFileSync(join(homeJieDir, "settings.json"), "utf-8"))).toEqual({
      notification: { soundEnabled: false },
    });
  });

  test("setNotificationSoundEnabled preserves existing settings fields", () => {
    const store = new SettingsStoreImpl(cwd, homeJieDir, null);
    store.setDefaultProvider("anthropic", "claude-sonnet-4");
    store.setNotificationSoundEnabled(false);
    expect(JSON.parse(readFileSync(join(homeJieDir, "settings.json"), "utf-8"))).toEqual({
      defaultProvider: "anthropic",
      defaultModel: "claude-sonnet-4",
      notification: { soundEnabled: false },
    });
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

  test("setModelFilters writes modelFilters to ~/.jie/settings.json", () => {
    const store = new SettingsStoreImpl(cwd, homeJieDir, null);
    store.setModelFilters(["qwen", "gpt"]);
    expect(JSON.parse(readFileSync(join(homeJieDir, "settings.json"), "utf-8"))).toEqual({ modelFilters: ["qwen", "gpt"] });
  });

  test("setModelFilters preserves existing settings fields", () => {
    const store = new SettingsStoreImpl(cwd, homeJieDir, null);
    store.setDefaultProvider("anthropic", "claude-sonnet-4");
    store.setModelFilters(["qwen"]);
    expect(JSON.parse(readFileSync(join(homeJieDir, "settings.json"), "utf-8"))).toEqual({
      defaultProvider: "anthropic",
      defaultModel: "claude-sonnet-4",
      modelFilters: ["qwen"],
    });
  });

  test("setModelAlias writes to ~/.jie/settings.json", () => {
    const store = new SettingsStoreImpl(cwd, homeJieDir, null);
    store.setModelAlias("large", "anthropic/claude-sonnet-4");
    expect(JSON.parse(readFileSync(join(homeJieDir, "settings.json"), "utf-8"))).toEqual({
      modelAliases: { large: "anthropic/claude-sonnet-4" },
    });
  });

  test("setModelAlias preserves existing aliases and other settings", () => {
    const store = new SettingsStoreImpl(cwd, homeJieDir, null);
    store.setModelAlias("small", "openai/gpt-4o-mini");
    store.setModelAlias("large", "anthropic/claude-sonnet-4");
    expect(JSON.parse(readFileSync(join(homeJieDir, "settings.json"), "utf-8"))).toEqual({
      modelAliases: { small: "openai/gpt-4o-mini", large: "anthropic/claude-sonnet-4" },
    });
  });

  test("setModelAlias writes to the project settings when they define a model", () => {
    const projectJieDir = join(cwd, ".jie");
    mkdirSync(projectJieDir, { recursive: true });
    writeFileSync(
      join(projectJieDir, "settings.json"),
      `${JSON.stringify({ defaultProvider: "openai", defaultModel: "gpt-4o" })}\n`,
    );
    const store = new SettingsStoreImpl(cwd, homeJieDir, projectJieDir);
    store.setModelAlias("large", "anthropic/claude-sonnet-4");
    expect(JSON.parse(readFileSync(join(projectJieDir, "settings.json"), "utf-8"))).toEqual({
      defaultProvider: "openai",
      defaultModel: "gpt-4o",
      modelAliases: { large: "anthropic/claude-sonnet-4" },
    });
    expect(existsSync(join(homeJieDir, "settings.json"))).toBe(false);
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
