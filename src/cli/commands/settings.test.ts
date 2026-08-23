import { JiePlatformError, type Command, type CommandName, type CommandResult, type JiePlatform, type Settings, type TeamInfo } from "../../platform";
import { type Console } from "../../utils";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runModel, runTeam } from "./settings";
import { runTeamInstall } from "./team-install";

function makeConsoleMock(): Console {
  return {
    print: vi.fn(),
    error: vi.fn(),
    write: vi.fn(),
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
    dequeuePrompt: vi.fn(),
    requeuePrompt: vi.fn(),
    execute: dispatch,
    teams: () => [...teams.values()],
    shutdown: vi.fn(),
  };
  return { platform, execute: dispatch };
}

const tmpRoots: string[] = [];
function freshDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpRoots.push(dir);
  return dir;
}
afterEach(() => {
  for (const path of tmpRoots) rmSync(path, { recursive: true, force: true });
  tmpRoots.length = 0;
});

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

  test("--update dispatches refreshModels and prints success", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementationOnce(async () => ({ errors: [] }));
    const consoleMock = makeConsoleMock();
    const code = await runModel({ kind: "model", action: "update" }, platform, consoleMock);
    expect(code).toBe(0);
    expect(execute).toHaveBeenCalledWith({ name: "refreshModels" });
    expect(consoleMock.print).toHaveBeenCalledWith("model catalogs updated");
  });

  test("--update reports per-provider failures and exits non-zero", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementationOnce(async () => ({ errors: ["openai: timeout"] }));
    const consoleMock = makeConsoleMock();
    const code = await runModel({ kind: "model", action: "update" }, platform, consoleMock);
    expect(code).toBe(1);
    expect(consoleMock.error).toHaveBeenCalledWith("model catalog refresh failed: openai: timeout");
  });
});

describe("runTeam", () => {
  const homeJieDir = join(tmpdir(), "jie-test-home");

  test("dispatches setDefaultTeam when a team id is given", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementationOnce(async () => null);
    const consoleMock = makeConsoleMock();
    const code = await runTeam({ kind: "team", action: "setDefault", teamId: "dev" }, platform, homeJieDir, null, consoleMock);
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
    const code = await runTeam({ kind: "team", action: "setDefault", teamId: "ghost" }, platform, homeJieDir, null, consoleMock);
    expect(code).toBe(1);
    expect(consoleMock.error).toHaveBeenCalledWith(
      "team 'ghost' is not installed; checked .jie/teams/ghost/ and ~/.jie/teams/ghost/",
    );
  });

  test("prints defaultTeam and installed list for info action", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementationOnce(async () => ({
      defaultTeam: "dev",
      installed: [
        { id: "setup-assistant", agentCount: 1, location: "builtin" },
        { id: "alpha", agentCount: 2, location: "user" },
        { id: "beta", agentCount: 3, location: "project" },
      ],
      sharedAgents: [],
    }));
    const consoleMock = makeConsoleMock();
    const code = await runTeam({ kind: "team", action: "info" }, platform, homeJieDir, null, consoleMock);
    expect(code).toBe(0);
    expect(consoleMock.print).toHaveBeenCalledWith("defaultTeam: dev");
    expect(consoleMock.print).toHaveBeenCalledWith("installed: setup-assistant, alpha, beta");
  });

  test("prints defaultTeam: unset when none is set", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementationOnce(async () => ({
      defaultTeam: null,
      installed: [{ id: "setup-assistant", agentCount: 1, location: "builtin" }],
      sharedAgents: [],
    }));
    const consoleMock = makeConsoleMock();
    const code = await runTeam({ kind: "team", action: "info" }, platform, homeJieDir, null, consoleMock);
    expect(code).toBe(0);
    expect(consoleMock.print).toHaveBeenCalledWith("defaultTeam: unset");
  });

  test("list prints each team with location, agent count, and provenance", async () => {
    const source = freshDir("jie-list-src-");
    const teamDir = join(source, "alpha");
    mkdirSync(teamDir, { recursive: true });
    writeFileSync(join(teamDir, "TEAM.md"), "---\nleader: lead\n---\n", "utf-8");
    writeFileSync(join(teamDir, "lead.md"), "---\ntools:\n  - bash\n---\n", "utf-8");
    const homeJie = freshDir("jie-list-home-");
    await runTeamInstall({ kind: "team", action: "add", source, project: false, force: false }, homeJie, null, makeConsoleMock());

    const { platform, execute } = makePlatform();
    execute.mockImplementationOnce(async () => ({
      defaultTeam: "alpha",
      installed: [
        { id: "setup-assistant", agentCount: 1, location: "builtin" },
        { id: "alpha", agentCount: 2, location: "user" },
      ],
      sharedAgents: [{ id: "explorer", location: "user" }],
    }));
    const consoleMock = makeConsoleMock();
    const code = await runTeam({ kind: "team", action: "list" }, platform, homeJie, null, consoleMock);
    expect(code).toBe(0);
    expect(consoleMock.print).toHaveBeenCalledWith("Teams:");
    expect(consoleMock.print).toHaveBeenCalledWith(expect.stringMatching(/^\* alpha\s+\[user\]\s+2 agents\s+\(file: .*\)$/));
    expect(consoleMock.print).toHaveBeenCalledWith(expect.stringMatching(/^  setup-assistant\s+\[builtin\]\s+1 agent$/));
    expect(consoleMock.print).toHaveBeenCalledWith("Shared agents:");
    expect(consoleMock.print).toHaveBeenCalledWith("  explorer  [user]");
  });
});

describe("runTeamInstall", () => {
  test("add installs a file source into the global teams dir and reports the location", async () => {
    const source = freshDir("jie-add-src-");
    const teamDir = join(source, "dev");
    mkdirSync(teamDir, { recursive: true });
    writeFileSync(join(teamDir, "TEAM.md"), "---\nleader: lead\n---\n", "utf-8");
    writeFileSync(join(teamDir, "lead.md"), "---\ntools:\n  - bash\n---\n", "utf-8");
    const homeJie = freshDir("jie-home-");
    const consoleMock = makeConsoleMock();

    const code = await runTeamInstall(
      { kind: "team", action: "add", source, project: false, force: false },
      homeJie,
      null,
      consoleMock,
    );

    expect(code).toBe(0);
    expect(consoleMock.print).toHaveBeenCalledWith("installed team: dev");
    expect(consoleMock.print).toHaveBeenCalledWith(`location: ${homeJie}`);
  });

  test("add --project errors when no project .jie directory is found", async () => {
    const consoleMock = makeConsoleMock();
    const code = await runTeamInstall(
      { kind: "team", action: "add", source: "./dev", project: true, force: false },
      freshDir("jie-home-"),
      null,
      consoleMock,
    );
    expect(code).toBe(1);
    expect(consoleMock.error).toHaveBeenCalledWith("no project .jie directory found; run from within a project or omit --project");
  });

  test("add rejects an invalid team manifest and reports the error", async () => {
    const source = freshDir("jie-invalid-src-");
    const teamDir = join(source, "dev");
    mkdirSync(teamDir, { recursive: true });
    writeFileSync(join(teamDir, "TEAM.md"), "---\nleader: lead\n---\n", "utf-8");
    const homeJie = freshDir("jie-home-");
    const consoleMock = makeConsoleMock();

    const code = await runTeamInstall(
      { kind: "team", action: "add", source, project: false, force: false },
      homeJie,
      null,
      consoleMock,
    );

    expect(code).toBe(1);
    expect(consoleMock.error).toHaveBeenCalledWith(expect.stringContaining("'lead'"));
    expect(existsSync(join(homeJie, "teams", "dev"))).toBe(false);
  });

  test("remove deletes an installed team from the global teams dir", async () => {
    const source = freshDir("jie-rm-src-");
    const teamDir = join(source, "dev");
    mkdirSync(teamDir, { recursive: true });
    writeFileSync(join(teamDir, "TEAM.md"), "---\nleader: lead\n---\n", "utf-8");
    writeFileSync(join(teamDir, "lead.md"), "---\ntools:\n  - bash\n---\n", "utf-8");
    const homeJie = freshDir("jie-home-");
    await runTeamInstall(
      { kind: "team", action: "add", source, project: false, force: false },
      homeJie,
      null,
      makeConsoleMock(),
    );
    const consoleMock = makeConsoleMock();

    const code = await runTeamInstall(
      { kind: "team", action: "remove", teamId: "dev", project: false },
      homeJie,
      null,
      consoleMock,
    );

    expect(code).toBe(0);
    expect(consoleMock.print).toHaveBeenCalledWith(`removed team 'dev' from ${homeJie}`);
  });
});
