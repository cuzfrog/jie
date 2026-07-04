import type { AuthStore, Scope, Settings, SettingsStore, ModelRegistry } from "../config";
import type { TeamRegistry } from "../team";
import type { CommandDeps } from "./command-defs";
import { runApiKey, runLogin, runLogout, runModel, runTeam } from "./command";

const settingsStore = vi.mocked<SettingsStore>({
  load: vi.fn(),
  write: vi.fn(),
  unsetDefaultTeam: vi.fn(),
});

const authStore = vi.mocked<AuthStore>({
  load: vi.fn(),
  saveAuthConfig: vi.fn(),
  setProvider: vi.fn(),
  removeProvider: vi.fn(),
  clear: vi.fn(),
});

const modelRegistry = vi.mocked<ModelRegistry>({
  providers: vi.fn(() => []),
  resolve: vi.fn(),
  listModels: vi.fn(() => []),
  getApiKey: vi.fn(),
});

const teamRegistry = vi.mocked<TeamRegistry>({
  parseTeamManifest: vi.fn(),
  isInstalled: vi.fn(() => false),
  listInstalled: vi.fn(() => []),
  locate: vi.fn<() => "project" | "user" | "missing">(() => "project"),
});

function makeDeps(defaultScope: Scope = "global"): CommandDeps {
  return {
    authStore,
    settingsStore,
    teamRegistry,
    modelRegistry,
    defaultScope,
    settingsLoad: () => settingsStore.load(),
  };
}

const DEFAULT_SETTINGS: Settings = {};

describe("runLogin", () => {
  beforeEach(() => {
    settingsStore.load.mockReset();
    authStore.load.mockReset();
    authStore.setProvider.mockReset();
    authStore.saveAuthConfig.mockReset();
  });

  test("writes the provider key via authStore", async () => {
    authStore.load.mockReturnValue({});
    authStore.setProvider.mockReturnValue({ anthropic: { type: "api_key", key: "sk-test" } });
    const result = await runLogin({ provider: "anthropic", apiKey: "sk-test" }, makeDeps());
    expect(result.kind).toBe("ok");
    expect(authStore.setProvider).toHaveBeenCalledWith({}, "anthropic", "sk-test");
    expect(authStore.saveAuthConfig).toHaveBeenCalledWith({ anthropic: { type: "api_key", key: "sk-test" } });
  });
});

describe("runLogout", () => {
  beforeEach(() => {
    settingsStore.load.mockReset();
    authStore.load.mockReset();
    authStore.clear.mockReset();
    authStore.removeProvider.mockReset();
    authStore.saveAuthConfig.mockReset();
  });

  test("with no provider clears all providers", async () => {
    authStore.clear.mockReturnValue({});
    const result = await runLogout({}, makeDeps());
    expect(result.kind).toBe("ok");
    expect(authStore.clear).toHaveBeenCalled();
    expect(authStore.saveAuthConfig).toHaveBeenCalledWith({});
    expect(authStore.removeProvider).not.toHaveBeenCalled();
  });

  test("with a provider removes only that provider", async () => {
    authStore.load.mockReturnValue({ anthropic: { type: "api_key", key: "sk-test" } });
    authStore.removeProvider.mockReturnValue({});
    const result = await runLogout({ provider: "anthropic" }, makeDeps());
    expect(result.kind).toBe("ok");
    expect(authStore.removeProvider).toHaveBeenCalledWith(expect.anything(), "anthropic");
    expect(authStore.saveAuthConfig).toHaveBeenCalledWith({});
    expect(authStore.clear).not.toHaveBeenCalled();
  });
});

describe("runApiKey", () => {
  beforeEach(() => {
    settingsStore.load.mockReset();
    authStore.load.mockReset();
    authStore.setProvider.mockReset();
    authStore.saveAuthConfig.mockReset();
  });

  test("returns error when no provider resolved", async () => {
    settingsStore.load.mockReturnValue({});
    const result = await runApiKey({ apiKey: "sk-test" }, makeDeps());
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toContain("no provider resolved");
    }
  });

  test("writes api key for the resolved provider", async () => {
    settingsStore.load.mockReturnValue({ defaultProvider: "anthropic" });
    authStore.load.mockReturnValue({});
    authStore.setProvider.mockReturnValue({ anthropic: { type: "api_key", key: "sk-test" } });
    const result = await runApiKey({ apiKey: "sk-test" }, makeDeps());
    expect(result.kind).toBe("ok");
    expect(authStore.setProvider).toHaveBeenCalledWith({}, "anthropic", "sk-test");
  });
});

describe("runModel", () => {
  beforeEach(() => {
    settingsStore.load.mockReset();
    settingsStore.write.mockReset();
  });

  test("writes the new model when provider is known", async () => {
    modelRegistry.providers.mockReturnValue(["anthropic", "openai"]);
    settingsStore.load.mockReturnValue({});
    const result = await runModel({ provider: "anthropic", modelId: "claude-sonnet-4-5" }, makeDeps());
    expect(result.kind).toBe("ok");
    expect(settingsStore.write).toHaveBeenCalledWith(
      { defaultProvider: "anthropic", defaultModel: "claude-sonnet-4-5" },
      "global",
    );
  });

  test("returns error for unknown provider", async () => {
    modelRegistry.providers.mockReturnValue(["anthropic"]);
    const result = await runModel({ provider: "no-such-provider", modelId: "x" }, makeDeps());
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toContain("unknown provider");
    }
    expect(settingsStore.write).not.toHaveBeenCalled();
  });

  test("uses project scope when defaultScope is project", async () => {
    modelRegistry.providers.mockReturnValue(["anthropic"]);
    settingsStore.load.mockReturnValue({});
    const result = await runModel({ provider: "anthropic", modelId: "x" }, makeDeps("project"));
    expect(result.kind).toBe("ok");
    expect(settingsStore.write).toHaveBeenCalledWith(expect.anything(), "project");
  });
});

describe("runTeam", () => {
  beforeEach(() => {
    settingsStore.load.mockReset();
    settingsStore.write.mockReset();
    settingsStore.unsetDefaultTeam.mockReset();
    teamRegistry.isInstalled.mockReset();
    teamRegistry.locate.mockReset();
  });

  test("with no args returns ok without writing", async () => {
    const result = await runTeam({ unset: false }, makeDeps());
    expect(result.kind).toBe("ok");
    expect(settingsStore.write).not.toHaveBeenCalled();
    expect(settingsStore.unsetDefaultTeam).not.toHaveBeenCalled();
  });

  test("--unset calls settingsStore.unsetDefaultTeam", async () => {
    const result = await runTeam({ unset: true }, makeDeps());
    expect(result.kind).toBe("ok");
    expect(settingsStore.unsetDefaultTeam).toHaveBeenCalledTimes(1);
  });

  test("with an unknown id returns error", async () => {
    teamRegistry.isInstalled.mockReturnValue(false);
    const result = await runTeam({ teamId: "ghost", unset: false }, makeDeps());
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toContain("ghost");
    }
    expect(settingsStore.write).not.toHaveBeenCalled();
  });

  test("with an installed id writes the default team", async () => {
    teamRegistry.isInstalled.mockReturnValue(true);
    teamRegistry.locate.mockReturnValue("project");
    settingsStore.load.mockReturnValue({});
    const result = await runTeam({ teamId: "alpha", unset: false }, makeDeps());
    expect(result.kind).toBe("ok");
    expect(settingsStore.write).toHaveBeenCalledWith({ defaultTeam: "alpha" }, "project");
  });
});

void DEFAULT_SETTINGS;
