import type { JiePlatform } from "../jie-platform";
import type { CommandDispatcher } from "./command-defs";
import { intercepts, type TuiInterceptDeps } from "./intercepts";

interface PlatformMock {
  readonly platform: JiePlatform;
  readonly command: ReturnType<typeof vi.fn>;
  setDefaultTeam: (value: string | null) => void;
  setInstalledTeams: (value: ReadonlyArray<string>) => void;
}

function makePlatform(): PlatformMock {
  const command = vi.fn();
  const platform = {
    team: { id: "minimal", agents: [] },
    loadTeam: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    stop: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    subscribe: vi.fn(),
    prompt: vi.fn(),
    interrupt: vi.fn(),
    getDefaultTeam: vi.fn<() => string | null>(),
    getDefaultModel: vi.fn<() => { provider: string; modelId: string } | null>(),
    listInstalledTeams: vi.fn<() => ReadonlyArray<string>>(),
    getGitStatus: vi.fn(() => ({ branch: "", dirty: false, ahead: 0, behind: 0 })),
    command: command as unknown as CommandDispatcher,
  };
  platform.getDefaultTeam.mockReturnValue(null);
  platform.listInstalledTeams.mockReturnValue([]);
  return {
    platform: platform as unknown as JiePlatform,
    command,
    setDefaultTeam: (value: string | null) => { platform.getDefaultTeam.mockReturnValue(value); },
    setInstalledTeams: (value: ReadonlyArray<string>) => { platform.listInstalledTeams.mockReturnValue(value); },
  };
}

function makeDeps(platform: JiePlatform): TuiInterceptDeps {
  return {
    platform,
    onLoadTeamError: vi.fn(),
  };
}

const ANTHROPIC_KEY = "sk-test-anthropic";

describe("intercepts /login", () => {
  test("two args invokes command('login') and replies", async () => {
    const mock = makePlatform();
    mock.command.mockResolvedValue({ kind: "ok" });
    const deps = makeDeps(mock.platform);
    const fn = intercepts.get("login");
    expect(fn).toBeDefined();
    const outcome = await fn!(["anthropic", ANTHROPIC_KEY], deps);
    expect(mock.command).toHaveBeenCalledWith("login", { provider: "anthropic", apiKey: ANTHROPIC_KEY });
    expect(outcome).toEqual({ kind: "reply", text: "logged in to anthropic" });
  });

  test("wrong arity returns an error and does not call command", async () => {
    const mock = makePlatform();
    const deps = makeDeps(mock.platform);
    const fn = intercepts.get("login");
    const outcome = await fn!(["anthropic"], deps);
    expect(mock.command).not.toHaveBeenCalled();
    expect(outcome).toEqual({ kind: "error", text: "/login <provider> <apiKey>" });
  });

  test("command error surfaces as an error outcome", async () => {
    const mock = makePlatform();
    mock.command.mockResolvedValue({ kind: "error", message: "auth failed" });
    const deps = makeDeps(mock.platform);
    const fn = intercepts.get("login");
    const outcome = await fn!(["anthropic", ANTHROPIC_KEY], deps);
    expect(outcome).toEqual({ kind: "error", text: "/login failed: auth failed" });
  });
});

describe("intercepts /logout", () => {
  test("no args invokes logout with no provider and replies", async () => {
    const mock = makePlatform();
    mock.command.mockResolvedValue({ kind: "ok" });
    const deps = makeDeps(mock.platform);
    const fn = intercepts.get("logout");
    const outcome = await fn!([], deps);
    expect(mock.command).toHaveBeenCalledWith("logout", { provider: undefined });
    expect(outcome).toEqual({ kind: "reply", text: "logged out of all providers" });
  });

  test("with a provider invokes logout and replies", async () => {
    const mock = makePlatform();
    mock.command.mockResolvedValue({ kind: "ok" });
    const deps = makeDeps(mock.platform);
    const fn = intercepts.get("logout");
    const outcome = await fn!(["anthropic"], deps);
    expect(mock.command).toHaveBeenCalledWith("logout", { provider: "anthropic" });
    expect(outcome).toEqual({ kind: "reply", text: "logged out of anthropic" });
  });
});

describe("intercepts /model", () => {
  test("valid <provider>/<modelId> invokes command and replies", async () => {
    const mock = makePlatform();
    mock.command.mockResolvedValue({ kind: "ok" });
    const deps = makeDeps(mock.platform);
    const fn = intercepts.get("model");
    const outcome = await fn!(["openai/gpt-4o"], deps);
    expect(mock.command).toHaveBeenCalledWith("model", { provider: "openai", modelId: "gpt-4o" });
    expect(outcome).toEqual({ kind: "reply", text: "default model set to openai/gpt-4o" });
  });

  test("missing slash returns an error", async () => {
    const mock = makePlatform();
    const deps = makeDeps(mock.platform);
    const fn = intercepts.get("model");
    const outcome = await fn!(["just-a-string"], deps);
    expect(mock.command).not.toHaveBeenCalled();
    expect(outcome?.kind).toBe("error");
  });

  test("wrong arity returns an error", async () => {
    const mock = makePlatform();
    const deps = makeDeps(mock.platform);
    const fn = intercepts.get("model");
    const outcome = await fn!([], deps);
    expect(mock.command).not.toHaveBeenCalled();
    expect(outcome).toEqual({ kind: "error", text: "/model <provider>/<modelId>" });
  });
});

describe("intercepts /team", () => {
  test("--unset invokes command and replies", async () => {
    const mock = makePlatform();
    mock.command.mockResolvedValue({ kind: "ok" });
    const deps = makeDeps(mock.platform);
    const fn = intercepts.get("team");
    const outcome = await fn!(["--unset"], deps);
    expect(mock.command).toHaveBeenCalledWith("team", { teamId: undefined, unset: true });
    expect(outcome).toEqual({ kind: "reply", text: "default team unset; takes effect on next `jie` invocation" });
  });

  test("no args replies with default team and installed list", async () => {
    const mock = makePlatform();
    mock.setDefaultTeam("alpha");
    mock.setInstalledTeams(["minimal", "alpha", "beta"]);
    const deps = makeDeps(mock.platform);
    const fn = intercepts.get("team");
    const outcome = await fn!([], deps);
    expect(mock.command).not.toHaveBeenCalled();
    expect(outcome).toEqual({ kind: "reply", text: "defaultTeam: alpha | installed: minimal, alpha, beta" });
  });

  test("with an id invokes command and replies with switching message", async () => {
    const mock = makePlatform();
    mock.command.mockResolvedValue({ kind: "ok" });
    const deps = makeDeps(mock.platform);
    const fn = intercepts.get("team");
    const outcome = await fn!(["alpha"], deps);
    expect(mock.command).toHaveBeenCalledWith("team", { teamId: "alpha", unset: false });
    expect(outcome).toEqual({ kind: "reply", text: "switching to team 'alpha'…" });
  });

  test("team not found error triggers onLoadTeamError callback", async () => {
    const mock = makePlatform();
    mock.command.mockRejectedValue(Object.assign(new Error("Team not found"), { code: "TEAM_NOT_FOUND" }));
    const onLoadTeamError = vi.fn();
    const deps: TuiInterceptDeps = { platform: mock.platform, onLoadTeamError };
    const fn = intercepts.get("team");
    const outcome = await fn!(["ghost"], deps);
    expect(mock.command).toHaveBeenCalledWith("team", { teamId: "ghost", unset: false });
    expect(outcome).toEqual({ kind: "reply", text: "switching to team 'ghost'…" });
    await new Promise<void>((r) => { setImmediate(r); });
    expect(onLoadTeamError).toHaveBeenCalledWith("ghost", "team 'ghost' not found");
  });
});
