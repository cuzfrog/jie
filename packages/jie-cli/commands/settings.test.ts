import type { SettingsStore } from "@cuzfrog/jie-platform/config";
import type { TeamRegistry } from "@cuzfrog/jie-platform/team";
import { runModel, runTeam } from "./settings";

const settings = vi.mocked<SettingsStore>({
  load: vi.fn(),
  write: vi.fn(),
  unsetDefaultTeam: vi.fn(),
});

const teamRegistry = vi.mocked<TeamRegistry>({
  loadTeam: vi.fn(),
  isInstalled: vi.fn(),
  listInstalled: vi.fn(),
  locate: vi.fn(),
});

describe("runModel", () => {
  beforeEach(() => {
    settings.load.mockReturnValue({});
  });

  test("writes global settings when no project .jie/ is found", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => { });
    const code = await runModel(
      { kind: "model", provider: "anthropic", modelId: "claude-opus-4" },
      null,
      settings,
    );
    expect(code).toBe(0);
    expect(settings.write).toHaveBeenCalledWith(
      { defaultProvider: "anthropic", defaultModel: "claude-opus-4" },
      "global",
    );
    expect(logSpy.mock.calls.map((c) => String(c[0])).join("|")).toContain(
      "default model set to anthropic/claude-opus-4",
    );
    logSpy.mockRestore();
  });

  test("writes project settings when projectJieDir is provided", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => { });
    const code = await runModel(
      { kind: "model", provider: "anthropic", modelId: "claude-opus-4" },
      "/some/project/.jie",
      settings,
    );
    expect(code).toBe(0);
    expect(settings.write).toHaveBeenCalledWith(
      { defaultProvider: "anthropic", defaultModel: "claude-opus-4" },
      "project",
    );
    logSpy.mockRestore();
  });

  test("warns to stderr for unknown providers but still writes the setting", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => { });
    const code = await runModel(
      { kind: "model", provider: "ghost-provider", modelId: "ghost-model" },
      null,
      settings,
    );
    expect(code).toBe(0);
    expect(errSpy.mock.calls.map((c) => String(c[0])).join("|")).toContain(
      "unknown provider: ghost-provider",
    );
    expect(settings.write).toHaveBeenCalledWith(
      { defaultProvider: "ghost-provider", defaultModel: "ghost-model" },
      "global",
    );
    errSpy.mockRestore();
  });
});

describe("runTeam", () => {
  beforeEach(() => {
    settings.load.mockReturnValue({});
    teamRegistry.isInstalled.mockReturnValue(false);
    teamRegistry.locate.mockReturnValue("user");
    teamRegistry.listInstalled.mockReturnValue([]);
  });

  test("team dev (installed globally) writes defaultTeam to global settings", async () => {
    teamRegistry.isInstalled.mockReturnValueOnce(true);
    teamRegistry.locate.mockReturnValueOnce("user");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => { });
    const code = await runTeam(
      { kind: "team", teamId: "dev", unset: false },
      settings,
      teamRegistry,
    );
    expect(code).toBe(0);
    expect(settings.write).toHaveBeenCalledWith(
      { defaultTeam: "dev" },
      "global",
    );
    expect(logSpy.mock.calls.map((c) => String(c[0])).join("|")).toContain(
      "default team set to dev",
    );
    logSpy.mockRestore();
  });

  test("team dev (installed in project) writes defaultTeam to project settings", async () => {
    teamRegistry.isInstalled.mockReturnValueOnce(true);
    teamRegistry.locate.mockReturnValueOnce("project");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => { });
    const code = await runTeam(
      { kind: "team", teamId: "dev", unset: false },
      settings,
      teamRegistry,
    );
    expect(code).toBe(0);
    expect(settings.write).toHaveBeenCalledWith(
      { defaultTeam: "dev" },
      "project",
    );
    logSpy.mockRestore();
  });

  test("team ghost (not installed) -> exit 1", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => { });
    const code = await runTeam(
      { kind: "team", teamId: "ghost", unset: false },
      settings,
      teamRegistry,
    );
    expect(code).toBe(1);
    expect(errSpy.mock.calls.map((c) => String(c[0])).join("|")).toContain(
      "is not installed",
    );
    errSpy.mockRestore();
  });

  test("team --unset removes defaultTeam from global settings", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => { });
    const code = await runTeam(
      { kind: "team", unset: true },
      settings,
      teamRegistry,
    );
    expect(code).toBe(0);
    expect(settings.unsetDefaultTeam).toHaveBeenCalled();
    expect(settings.write).not.toHaveBeenCalled();
    expect(logSpy.mock.calls.map((c) => String(c[0])).join("|")).toContain(
      "default team unset",
    );
    logSpy.mockRestore();
  });

  test("team (no arg) prints defaultTeam and installed list", async () => {
    settings.load.mockReturnValueOnce({ defaultProvider: "p", defaultModel: "m", defaultTeam: "dev" });
    teamRegistry.listInstalled.mockReturnValueOnce(["dev"]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => { });
    const code = await runTeam(
      { kind: "team", unset: false },
      settings,
      teamRegistry,
    );
    expect(code).toBe(0);
    const out = logSpy.mock.calls.map((c) => String(c[0])).join("|");
    expect(out).toContain("defaultTeam: dev");
    expect(out).toContain("installed:");
    expect(out).toContain("dev");
    logSpy.mockRestore();
  });

  test("team (no arg) prints defaultTeam: unset when no defaultTeam is set", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => { });
    const code = await runTeam(
      { kind: "team", unset: false },
      settings,
      teamRegistry,
    );
    expect(code).toBe(0);
    expect(logSpy.mock.calls.map((c) => String(c[0])).join("|")).toContain(
      "defaultTeam: unset",
    );
    logSpy.mockRestore();
  });
});
