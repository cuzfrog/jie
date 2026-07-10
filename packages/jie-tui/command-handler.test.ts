import { JiePlatformError, type JiePlatform } from "@cuzfrog/jie-platform";
import {
  createTuiCommandHandler,
  type CommandHandlerDeps,
  type CommandHandler,
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
    const handler: CommandHandler = createTuiCommandHandler(deps);
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

  test("/team <id> dispatches team load and replies 'loading team'", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementationOnce(async () => ({
      id: "alpha",
      leaderKey: "general-1",
      agents: [{ teamId: "alpha", role: "general", agentKey: "general-1", isLeader: true }],
    }));
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/team alpha");
    await new Promise((r) => setImmediate(r));
    expect(execute).toHaveBeenCalledWith({ name: "team", teamId: "alpha" });
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("loading team 'alpha'")));
  });

  test("/team <id> first-time load dispatches switchTeam (UI concern) with the full identity", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementationOnce(async () => ({
      id: "alpha",
      leaderKey: "general-1",
      agents: [{ teamId: "alpha", role: "general", agentKey: "general-1", isLeader: true }],
    }));
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/team alpha");
    await new Promise((r) => setImmediate(r));
    expect(dispatch.mock.calls.some(([a]) => a.type === "[bus] receive event from event bus")).toBe(false);
    const switchCalls = dispatch.mock.calls.filter(([a]) => a.type === "[ui] switch team");
    expect(switchCalls).toHaveLength(1);
    expect(switchCalls[0]![0]).toEqual(Actions.switchTeam({
      id: "alpha",
      leaderKey: "general-1",
      agents: [{ teamId: "alpha", role: "general", agentKey: "general-1", isLeader: true }],
    }));
  });

  test("/team <currentId> (cache hit) still dispatches switchTeam so the UI rebuilds", async () => {
    const { platform, execute } = makePlatform();
    const identity = {
      id: "alpha",
      leaderKey: "general-1",
      agents: [{ teamId: "alpha", role: "general", agentKey: "general-1", isLeader: true }],
    } as const;
    execute.mockImplementation(async () => identity);
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/team alpha");
    await new Promise((r) => setImmediate(r));
    handler.handle("/team alpha");
    await new Promise((r) => setImmediate(r));
    expect(execute).toHaveBeenCalledTimes(2);
    const switchCalls = dispatch.mock.calls.filter(([a]) => a.type === "[ui] switch team");
    expect(switchCalls).toHaveLength(2);
    expect(switchCalls[0]![0]).toEqual(Actions.switchTeam(identity));
    expect(switchCalls[1]![0]).toEqual(Actions.switchTeam(identity));
  });

  test("/team <id> surfaces the platform error's message verbatim", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async () => {
      throw new JiePlatformError("TEAM_NOT_FOUND", { detail: "team 'ghost' not found" });
    });
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/team ghost");
    await new Promise((r) => setImmediate(r));
    expect(execute).toHaveBeenCalledWith({ name: "team", teamId: "ghost" });
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("ghost")));
  });
});
