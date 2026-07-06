import { JiePlatformError, type JiePlatform, type Settings, type TeamIdentity } from "@cuzfrog/jie-platform";
import { runModel, runTeam } from "./settings";

function makePlatform(): { platform: JiePlatform; execute: ReturnType<typeof vi.fn> } {
  const execute = vi.fn(async () => null);
  const settings: Settings = {};
  const teams = new Map<string, TeamIdentity>();
  const platform = {
    teams,
    settings,
    stop: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    subscribe: vi.fn(),
    prompt: vi.fn(),
    interrupt: vi.fn(),
    execute,
  };
  return { platform: platform as unknown as JiePlatform, execute };
}

describe("runModel", () => {
  test("dispatches setDefaultModel and prints success", async () => {
    const { platform, execute } = makePlatform();
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => { });
    const code = await runModel(
      { kind: "model", provider: "anthropic", modelId: "claude-opus-4" },
      platform,
    );
    expect(code).toBe(0);
    expect(execute).toHaveBeenCalledWith({
      name: "setDefaultModel",
      provider: "anthropic",
      modelId: "claude-opus-4",
    });
    logSpy.mockRestore();
  });

  test("rejects when execute throws UNKNOWN_PROVIDER", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementationOnce(async () => {
      throw new JiePlatformError("UNKNOWN_PROVIDER", { detail: "ghost-provider" });
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => { });
    const code = await runModel(
      { kind: "model", provider: "ghost-provider", modelId: "ghost-model" },
      platform,
    );
    expect(code).toBe(1);
    expect(errSpy.mock.calls.map((c) => String(c[0])).join("|")).toContain("unknown provider: ghost-provider");
    errSpy.mockRestore();
  });

  test("rethrows unexpected errors", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementationOnce(async () => {
      throw new Error("disk full");
    });
    await expect(
      runModel({ kind: "model", provider: "anthropic", modelId: "x" }, platform),
    ).rejects.toThrow(/disk full/);
  });
});

describe("runTeam", () => {
  test("dispatches setDefaultTeam when teamId is given", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementationOnce(async () => null);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => { });
    const code = await runTeam({ kind: "team", teamId: "dev" }, platform);
    expect(code).toBe(0);
    expect(execute).toHaveBeenCalledWith({ name: "setDefaultTeam", teamId: "dev" });
    logSpy.mockRestore();
  });

  test("rejects when execute throws TEAM_NOT_FOUND", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementationOnce(async () => {
      throw new JiePlatformError("TEAM_NOT_FOUND", { detail: "team 'ghost' not found" });
    });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => { });
    const code = await runTeam({ kind: "team", teamId: "ghost" }, platform);
    expect(code).toBe(1);
    expect(errSpy.mock.calls.map((c) => String(c[0])).join("|")).toContain("is not installed");
    errSpy.mockRestore();
  });

  test("prints defaultTeam and installed list when no arg", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementationOnce(async () => ({
      defaultTeam: "dev",
      installed: ["minimal", "alpha", "beta"],
    }));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => { });
    const code = await runTeam({ kind: "team" }, platform);
    expect(code).toBe(0);
    const out = logSpy.mock.calls.map((c) => String(c[0])).join("|");
    expect(out).toContain("defaultTeam: dev");
    expect(out).toContain("installed:");
    logSpy.mockRestore();
  });

  test("prints defaultTeam: unset when none is set", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementationOnce(async () => ({
      defaultTeam: null,
      installed: ["minimal"],
    }));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => { });
    const code = await runTeam({ kind: "team" }, platform);
    expect(code).toBe(0);
    expect(logSpy.mock.calls.map((c) => String(c[0])).join("|")).toContain("defaultTeam: unset");
    logSpy.mockRestore();
  });
});
