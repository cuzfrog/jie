import { JiePlatformError, type Command, type CommandName, type CommandResult, type Console, type JiePlatform, type Settings, type TeamInfo } from "@cuzfrog/jie-platform";
import { runModel, runTeam } from "./settings";

function makeConsoleMock(): Console {
  return {
    print: vi.fn(),
    error: vi.fn(),
  };
}

function makePlatform(): { platform: JiePlatform; execute: ReturnType<typeof vi.fn> } {
  const dispatch = vi.fn(async <T extends CommandName>(_command: Command<T>): Promise<CommandResult<T>> => {
    return null as CommandResult<T>;
  });
  const settings: Settings = {};
  const teams = new Map<string, TeamInfo>();
  const platform: JiePlatform = {
    settings,
    subscribe: vi.fn(() => () => undefined),
    prompt: vi.fn(),
    interrupt: vi.fn(),
    execute: dispatch,
    teams: () => [...teams.values()],
  };
  return { platform, execute: dispatch };
}

describe("runModel", () => {
  test("dispatches setDefaultModel and prints success", async () => {
    const { platform, execute } = makePlatform();
    const consoleMock = makeConsoleMock();
    const code = await runModel(
      { kind: "model", provider: "anthropic", modelId: "claude-opus-4" },
      platform,
      consoleMock,
    );
    expect(code).toBe(0);
    expect(execute).toHaveBeenCalledWith({
      name: "setDefaultModel",
      provider: "anthropic",
      id: "claude-opus-4",
      effort: "off",
      contextWindow: null,
    });
    expect(consoleMock.print).toHaveBeenCalledWith("default model set to anthropic/claude-opus-4");
  });

  test("rejects when execute throws UNKNOWN_PROVIDER", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementationOnce(async () => {
      throw new JiePlatformError("UNKNOWN_PROVIDER", { detail: "ghost-provider" });
    });
    const consoleMock = makeConsoleMock();
    const code = await runModel(
      { kind: "model", provider: "ghost-provider", modelId: "ghost-model" },
      platform,
      consoleMock,
    );
    expect(code).toBe(1);
    expect(consoleMock.error).toHaveBeenCalledWith("unknown provider: ghost-provider");
  });

  test("rethrows unexpected errors", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementationOnce(async () => {
      throw new Error("disk full");
    });
    expect(
      runModel({ kind: "model", provider: "anthropic", modelId: "x" }, platform, makeConsoleMock()),
    ).rejects.toThrow(/disk full/);
  });
});

describe("runTeam", () => {
  test("dispatches setDefaultTeam when teamId is given", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementationOnce(async () => null);
    const consoleMock = makeConsoleMock();
    const code = await runTeam({ kind: "team", teamId: "dev" }, platform, consoleMock);
    expect(code).toBe(0);
    expect(execute).toHaveBeenCalledWith({ name: "setDefaultTeam", teamId: "dev" });
    expect(consoleMock.print).toHaveBeenCalledWith("default team set to 'dev'");
  });

  test("rejects when execute throws TEAM_NOT_FOUND", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementationOnce(async () => {
      throw new JiePlatformError("TEAM_NOT_FOUND", { detail: "team 'ghost' not found" });
    });
    const consoleMock = makeConsoleMock();
    const code = await runTeam({ kind: "team", teamId: "ghost" }, platform, consoleMock);
    expect(code).toBe(1);
    expect(consoleMock.error).toHaveBeenCalledWith(
      "team 'ghost' is not installed; checked .jie/teams/ghost/ and ~/.jie/teams/ghost/",
    );
  });

  test("prints defaultTeam and installed list when no arg", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementationOnce(async () => ({
      defaultTeam: "dev",
      installed: ["minimal", "alpha", "beta"],
    }));
    const consoleMock = makeConsoleMock();
    const code = await runTeam({ kind: "team" }, platform, consoleMock);
    expect(code).toBe(0);
    expect(consoleMock.print).toHaveBeenCalledWith("defaultTeam: dev");
    expect(consoleMock.print).toHaveBeenCalledWith("installed: minimal, alpha, beta");
  });

  test("prints defaultTeam: unset when none is set", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementationOnce(async () => ({
      defaultTeam: null,
      installed: ["minimal"],
    }));
    const consoleMock = makeConsoleMock();
    const code = await runTeam({ kind: "team" }, platform, consoleMock);
    expect(code).toBe(0);
    expect(consoleMock.print).toHaveBeenCalledWith("defaultTeam: unset");
  });
});
