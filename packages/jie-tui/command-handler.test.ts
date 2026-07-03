import {
  createTuiCommandHandler,
  type CommandHandlerDeps,
  type TuiCommandHandler,
} from "./command-handler";
import { Actions, createStateStore, type StateStore, type TuiState } from "./state";
import type { JiePlatform } from "@cuzfrog/jie-platform";

const ANTHROPIC_KEY = "sk-test-anthropic";

function makePlatform(): {
  platform: JiePlatform;
  login: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
  setDefaultModel: ReturnType<typeof vi.fn>;
  unsetDefaultTeam: ReturnType<typeof vi.fn>;
  getDefaultTeam: ReturnType<typeof vi.fn>;
  getDefaultModel: ReturnType<typeof vi.fn>;
  listInstalledTeams: ReturnType<typeof vi.fn>;
  loadTeam: ReturnType<typeof vi.fn>;
} {
  const login = vi.fn();
  const logout = vi.fn();
  const setDefaultModel = vi.fn();
  const unsetDefaultTeam = vi.fn();
  const getDefaultTeam = vi.fn(() => null as string | null);
  const getDefaultModel = vi.fn(() => null as { provider: string; modelId: string } | null);
  const listInstalledTeams = vi.fn(() => [] as ReadonlyArray<string>);
  const loadTeam = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const platform = {
    team: { id: "minimal", agents: [] },
    loadTeam,
    stop: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    subscribe: vi.fn(),
    userPrompt: vi.fn(),
    interrupt: vi.fn(),
    login,
    logout,
    setDefaultModel,
    unsetDefaultTeam,
    getDefaultTeam,
    getDefaultModel,
    listInstalledTeams,
    getGitStatus: vi.fn(() => ({ branch: "", dirty: false, ahead: 0, behind: 0 })),
  };
  return { platform: platform as unknown as JiePlatform, login, logout, setDefaultModel, unsetDefaultTeam, getDefaultTeam, getDefaultModel, listInstalledTeams, loadTeam };
}

interface DepsHandle {
  deps: CommandHandlerDeps;
  getState: () => TuiState;
  dispatch: ReturnType<typeof vi.fn>;
}

function makeDeps(platform: JiePlatform): DepsHandle {
  const baseStore = createStateStore();
  let current: TuiState = baseStore.getState();
  const dispatch = vi.fn((action: Parameters<StateStore["dispatch"]>[0]) => {
    baseStore.dispatch(action);
    current = baseStore.getState();
  });
  const stateStore: StateStore = {
    getState: () => current,
    dispatch: (action) => { dispatch(action); },
    subscribe: vi.fn(() => (): void => undefined),
    getFocusedAgent: () => {
      if (current.focusedAgentId === null) return null;
      return current.agents.get(current.focusedAgentId) ?? null;
    },
    isBusy: () => {
      for (const agent of current.agents.values()) {
        if (agent.status === "busy") return true;
      }
      return false;
    },
  };
  const deps: CommandHandlerDeps = {
    stateStore,
    platform,
  };
  return { deps, getState: () => current, dispatch };
}

describe("createTuiCommandHandler", () => {
  test("handle('/help') clears banners then sets a reply message", () => {
    const { platform } = makePlatform();
    const { deps, dispatch } = makeDeps(platform);
    const handler: TuiCommandHandler = createTuiCommandHandler(deps);
    handler.handle("/help");
    expect(dispatch).toHaveBeenCalledWith(Actions.clearBanners());
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("/clear")));
  });

  test("handle('/clear') dispatches clearTuiState", () => {
    const { platform } = makePlatform();
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/clear");
    expect(dispatch).toHaveBeenCalledWith(Actions.clearBanners());
    expect(dispatch).toHaveBeenCalledWith(Actions.clearTuiState());
  });

  test("handle('/exit') dispatches requestQuit", () => {
    const { platform } = makePlatform();
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/exit");
    expect(dispatch).toHaveBeenCalledWith(Actions.requestQuit());
  });

  test("handle('/team') reports the current default and installed list", () => {
    const { platform, getDefaultTeam, listInstalledTeams } = makePlatform();
    getDefaultTeam.mockReturnValue("alpha");
    listInstalledTeams.mockReturnValue(["minimal", "alpha", "beta"]);
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/team");
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringMatching(/alpha/)));
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringMatching(/minimal.*alpha.*beta/)));
  });

  test("handle('/nope') sets an error message", () => {
    const { platform } = makePlatform();
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/nope");
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/nope")));
  });

  test("handle clears banners before each invocation", () => {
    const { platform } = makePlatform();
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/help");
    expect(dispatch.mock.calls[0]?.[0]).toEqual(Actions.clearBanners());
  });
});

describe("createTuiCommandHandler — /login", () => {
  test("/login <provider> <apiKey> writes provider to authStore and replies", () => {
    const { platform, login } = makePlatform();
    login.mockImplementation(() => undefined);
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/login anthropic " + ANTHROPIC_KEY);
    expect(login).toHaveBeenCalledWith("anthropic", ANTHROPIC_KEY);
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("logged in to anthropic")));
  });

  test("/login with wrong arity sets an error message and does not write", () => {
    const { platform, login } = makePlatform();
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/login anthropic");
    expect(login).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/login <provider> <apiKey>")));
  });

  test("/login surfaces platform errors as error messages", () => {
    const { platform, login } = makePlatform();
    login.mockImplementation(() => { throw new Error("auth failed"); });
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/login anthropic " + ANTHROPIC_KEY);
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/login failed")));
  });
});

describe("createTuiCommandHandler — /logout", () => {
  test("/logout with no args calls platform.logout() with no provider and replies", () => {
    const { platform, logout } = makePlatform();
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/logout");
    expect(logout).toHaveBeenCalledWith(undefined);
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("logged out of all providers")));
  });

  test("/logout <provider> removes one provider and replies", () => {
    const { platform, logout } = makePlatform();
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/logout anthropic");
    expect(logout).toHaveBeenCalledWith("anthropic");
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("logged out of anthropic")));
  });
});

describe("createTuiCommandHandler — /model", () => {
  test("/model <provider>/<modelId> validates and writes to settings", () => {
    const { platform, setDefaultModel } = makePlatform();
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/model openai/gpt-4o");
    expect(setDefaultModel).toHaveBeenCalledWith("openai", "gpt-4o");
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("default model set to openai/gpt-4o")));
  });

  test("/model without slash sets an error", () => {
    const { platform, setDefaultModel } = makePlatform();
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/model just-a-string");
    expect(setDefaultModel).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("invalid")));
  });

  test("/model surfaces UNKNOWN_PROVIDER from the platform", () => {
    const { platform, setDefaultModel } = makePlatform();
    setDefaultModel.mockImplementation(() => { throw new Error("Unknown provider: no-such-provider"); });
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/model no-such-provider/gpt-4o");
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/model failed")));
  });

  test("/model with wrong arity sets an error", () => {
    const { platform, setDefaultModel } = makePlatform();
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/model");
    expect(setDefaultModel).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/model <provider>/<modelId>")));
  });
});

describe("createTuiCommandHandler — /team", () => {
  test("/team --unset calls platform.unsetDefaultTeam and replies", () => {
    const { platform, unsetDefaultTeam } = makePlatform();
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/team --unset");
    expect(unsetDefaultTeam).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("default team unset")));
  });

  test("/team (no args) replies with defaultTeam and installed list", () => {
    const { platform, getDefaultTeam, listInstalledTeams } = makePlatform();
    getDefaultTeam.mockReturnValue("alpha");
    listInstalledTeams.mockReturnValue(["minimal", "alpha", "beta"]);
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/team");
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringMatching(/alpha/)));
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringMatching(/minimal.*alpha.*beta/)));
  });

  test("/team (no args) reports 'unset' when no defaultTeam is configured", () => {
    const { platform, getDefaultTeam, listInstalledTeams } = makePlatform();
    getDefaultTeam.mockReturnValue(null);
    listInstalledTeams.mockReturnValue(["minimal"]);
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/team");
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("unset")));
  });

  test("/team <id> dispatches loadTeam and replies", async () => {
    const { platform, loadTeam } = makePlatform();
    loadTeam.mockResolvedValue(undefined);
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/team alpha");
    await new Promise((r) => setImmediate(r));
    expect(loadTeam).toHaveBeenCalledWith("alpha");
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("switching to team 'alpha'")));
  });

  test("/team <id> surfaces TEAM_NOT_FOUND as a generic 'not found' message", async () => {
    const { platform, loadTeam } = makePlatform();
    const error = Object.assign(new Error("Team not found: ghost"), { code: "TEAM_NOT_FOUND" });
    loadTeam.mockRejectedValue(error);
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/team ghost");
    await new Promise((r) => setImmediate(r));
    expect(loadTeam).toHaveBeenCalledWith("ghost");
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage("team 'ghost' not found"));
  });
});