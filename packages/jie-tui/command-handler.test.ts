import { JiePlatformError, type JiePlatform } from "@cuzfrog/jie-platform";
import {
  createTuiCommandHandler,
  type CommandHandlerDeps,
  type TuiCommandHandler,
} from "./command-handler";
import { Actions, createStateStore, type StateStore, type TuiState } from "./state";

const ANTHROPIC_KEY = "sk-test-anthropic";

function makePlatform(): { platform: JiePlatform; execute: ReturnType<typeof vi.fn> } {
  const execute = vi.fn(async (cmd: { name: string } & Record<string, unknown>) => {
    switch (cmd.name) {
      case "getDefaultModel":
        return null;
      case "team":
        return { kind: "info" as const, defaultTeam: "alpha", installed: ["minimal", "alpha", "beta"] };
      default:
        return null;
    }
  });
  const platform = {
    team: { id: "minimal", agents: [] },
    stop: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    subscribe: vi.fn(),
    prompt: vi.fn(),
    interrupt: vi.fn(),
    execute,
  };
  return { platform: platform as unknown as JiePlatform, execute };
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

  test("handle('/team') reports the current default and installed list", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementationOnce(async () => ({
      defaultTeam: "alpha",
      installed: ["minimal", "alpha", "beta"],
    }));
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/team");
    await new Promise((r) => setImmediate(r));
    expect(execute).toHaveBeenCalledWith({ name: "getTeamInfo" });
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
  test("/login <provider> <apiKey> dispatches login command and replies", () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async () => undefined);
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/login anthropic " + ANTHROPIC_KEY);
    expect(execute).toHaveBeenCalledWith({ name: "login", provider: "anthropic", apiKey: ANTHROPIC_KEY });
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("logged in to anthropic")));
  });

  test("/login with wrong arity sets an error message and does not dispatch", () => {
    const { platform, execute } = makePlatform();
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/login anthropic");
    expect(execute).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/login <provider> <apiKey>")));
  });

  test("/login surfaces platform errors as error messages", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async () => { throw new Error("auth failed"); });
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/login anthropic " + ANTHROPIC_KEY);
    await new Promise((r) => setImmediate(r));
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/login failed")));
  });
});

describe("createTuiCommandHandler — /logout", () => {
  test("/logout with no args dispatches logout with provider undefined", () => {
    const { platform, execute } = makePlatform();
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/logout");
    expect(execute).toHaveBeenCalledWith({ name: "logout", provider: undefined });
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("logged out of all providers")));
  });

  test("/logout <provider> dispatches logout with that provider", () => {
    const { platform, execute } = makePlatform();
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/logout anthropic");
    expect(execute).toHaveBeenCalledWith({ name: "logout", provider: "anthropic" });
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("logged out of anthropic")));
  });
});

describe("createTuiCommandHandler — /model", () => {
  test("/model <provider>/<modelId> parses and dispatches setDefaultModel", () => {
    const { platform, execute } = makePlatform();
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/model openai/gpt-4o");
    expect(execute).toHaveBeenCalledWith({ name: "setDefaultModel", provider: "openai", modelId: "gpt-4o" });
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("default model set to openai/gpt-4o")));
  });

  test("/model without slash sets an error", () => {
    const { platform, execute } = makePlatform();
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/model just-a-string");
    expect(execute).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("invalid")));
  });

  test("/model surfaces platform errors as error messages", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async () => {
      throw new JiePlatformError("UNKNOWN_PROVIDER", { detail: "no-such-provider" });
    });
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/model no-such-provider/gpt-4o");
    await new Promise((r) => setImmediate(r));
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/model failed")));
  });

  test("/model with wrong arity sets an error", () => {
    const { platform, execute } = makePlatform();
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/model");
    expect(execute).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/model <provider>/<modelId>")));
  });
});

describe("createTuiCommandHandler — /team", () => {
  test("/team --unset dispatches unsetDefaultTeam and replies", () => {
    const { platform, execute } = makePlatform();
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/team --unset");
    expect(execute).toHaveBeenCalledWith({ name: "unsetDefaultTeam" });
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("default team unset")));
  });

  test("/team (no args) replies with defaultTeam and installed list", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementationOnce(async () => ({
      defaultTeam: "alpha",
      installed: ["minimal", "alpha", "beta"],
    }));
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/team");
    await new Promise((r) => setImmediate(r));
    expect(execute).toHaveBeenCalledWith({ name: "getTeamInfo" });
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringMatching(/alpha/)));
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringMatching(/minimal.*alpha.*beta/)));
  });

  test("/team (no args) reports 'unset' when no defaultTeam is configured", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementationOnce(async () => ({
      defaultTeam: null,
      installed: ["minimal"],
    }));
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/team");
    await new Promise((r) => setImmediate(r));
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("unset")));
  });

  test("/team <id> dispatches team switch and replies 'loaded team'", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async () => undefined);
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/team alpha");
    await new Promise((r) => setImmediate(r));
    expect(execute).toHaveBeenCalledWith({ name: "switchTeam", teamId: "alpha" });
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("loaded team 'alpha'")));
  });

  test("/team <id> surfaces TEAM_NOT_FOUND as 'not found' message", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async () => {
      throw new JiePlatformError("TEAM_NOT_FOUND", { detail: "team 'ghost' not found" });
    });
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/team ghost");
    await new Promise((r) => setImmediate(r));
    expect(execute).toHaveBeenCalledWith({ name: "switchTeam", teamId: "ghost" });
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage("team 'ghost' not found"));
  });
});
