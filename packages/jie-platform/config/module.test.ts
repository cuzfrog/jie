import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { asValue, createContainer, InjectionMode, type AwilixContainer } from "awilix";
import type { PlatformCradle } from "../container";
import type { TeamManager } from "../team";
import { registerConfigModule } from "./module";

const teamManager = vi.mocked<TeamManager>({
  load: vi.fn(),
  resumeSession: vi.fn(),
  listInstalled: vi.fn(),
  listLoaded: vi.fn(),
  locate: vi.fn(),
  agents: vi.fn(),
  listSessions: vi.fn(),
  stop: vi.fn(),
});

function bootedContainer(cwd: string, homeJieDir: string, projectJieDir: string | null): AwilixContainer<PlatformCradle> {
  const container = createContainer<PlatformCradle>({ injectionMode: InjectionMode.CLASSIC });
  container.register({
    cwd: asValue(cwd),
    homeJieDir: asValue(homeJieDir),
    projectJieDir: asValue(projectJieDir),
    inMemory: asValue(true),
    teamManager: asValue(teamManager),
  });
  registerConfigModule(container);
  return container;
}

describe("registerConfigModule", () => {
  let homeDir: string;
  let homeJieDir: string;
  let cwd: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), "jie-config-module-home-"));
    homeJieDir = join(homeDir, ".jie");
    cwd = mkdtempSync(join(tmpdir(), "jie-config-module-cwd-"));
    teamManager.locate.mockReturnValue("user");
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  });

  test("authStore round-trips auth.json through the cradle", () => {
    const container = bootedContainer(cwd, homeJieDir, null);
    container.cradle.authStore.saveAuthConfig({ anthropic: { type: "api_key", key: "sk-a" } });
    expect(container.cradle.authStore.load()).toEqual({ anthropic: { type: "api_key", key: "sk-a" } });
  });

  test("modelRegistry resolves built-in providers", () => {
    const container = bootedContainer(cwd, homeJieDir, null);
    expect(container.cradle.modelRegistry.providers()).toContain("anthropic");
  });

  test("settingsStore.setDefaultProvider writes the global settings file", () => {
    const container = bootedContainer(cwd, homeJieDir, null);
    container.cradle.settingsStore.setDefaultProvider("anthropic", "claude-sonnet-4");
    expect(JSON.parse(readFileSync(join(homeJieDir, "settings.json"), "utf-8"))).toEqual({
      defaultProvider: "anthropic",
      defaultModel: "claude-sonnet-4",
    });
  });

  test("settingsStore.setDefaultTeam routes through the teamLocator cycle", () => {
    const container = bootedContainer(cwd, homeJieDir, null);
    container.cradle.settingsStore.setDefaultTeam("dev");
    expect(teamManager.locate).toHaveBeenCalledWith("dev");
    expect(JSON.parse(readFileSync(join(homeJieDir, "settings.json"), "utf-8"))).toEqual({ defaultTeam: "dev" });
  });

  test("registers singletons", () => {
    const container = bootedContainer(cwd, homeJieDir, null);
    expect(container.cradle.authStore).toBe(container.resolve("authStore"));
    expect(container.cradle.modelRegistry).toBe(container.resolve("modelRegistry"));
    expect(container.cradle.settingsStore).toBe(container.resolve("settingsStore"));
  });
});
