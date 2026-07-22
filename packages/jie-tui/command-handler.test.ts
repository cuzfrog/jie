import { JiePlatformError, type JiePlatform } from "@cuzfrog/jie-platform";
import {
  createTuiCommandHandler,
  SLASH_COMMAND_NAMES,
  type CommandHandlerDeps,
  type CommandHandler,
} from "./command-handler";
import { Actions, createStateStore, type StateStore, type TuiState } from "./state";

const ANTHROPIC_KEY = "sk-test-anthropic";

function makePlatform(): { platform: JiePlatform; execute: ReturnType<typeof vi.fn>; prompt: ReturnType<typeof vi.fn> } {
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
  const prompt = vi.fn();
  const platform = {
    team: { id: "minimal", agents: [] },
    stop: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    subscribe: vi.fn(),
    prompt,
    interrupt: vi.fn(),
    execute,
  };
  return { platform: platform as unknown as JiePlatform, execute, prompt };
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

describe("createTuiCommandHandler — prompt routing", () => {
  function makeDepsWithTeam(platform: JiePlatform): DepsHandle {
    const handle = makeDeps(platform);
    handle.dispatch(Actions.switchTeam({
      id: "alpha",
      leaderKey: "general-1",
      history: [],
      agents: [{ teamId: "alpha", role: "general", agentKey: "general-1", isLeader: true, model: null }],
    }));
    return handle;
  }

  function makeDepsWithState(platform: JiePlatform, state: TuiState): DepsHandle {
    const dispatch = vi.fn();
    const stateStore: StateStore = {
      getState: () => state,
      dispatch: (action) => { dispatch(action); },
      subscribe: vi.fn(() => (): void => undefined),
    };
    return { deps: { stateStore, platform }, getState: () => state, dispatch };
  }

  test("plain prompt routes to the focused agent", () => {
    const { platform, prompt } = makePlatform();
    const { deps } = makeDepsWithTeam(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("hello world");
    expect(prompt).toHaveBeenCalledWith("alpha", "general-1", "hello world");
  });

  test("plain prompt with no team loaded sets an error banner instead of dropping silently", () => {
    const { platform, prompt } = makePlatform();
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("hello");
    expect(prompt).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("no team loaded")));
  });

  test("plain prompt falls back to the leader when no agent is focused", () => {
    const { platform, prompt } = makePlatform();
    const seeded = makeDepsWithTeam(platform);
    const unfocused: TuiState = { ...seeded.getState(), focusedAgentId: null };
    const { deps } = makeDepsWithState(platform, unfocused);
    const handler = createTuiCommandHandler(deps);
    handler.handle("hello");
    expect(prompt).toHaveBeenCalledWith("alpha", "general-1", "hello");
  });

  test("bash directive with no team loaded sets an error banner", () => {
    const { platform, prompt } = makePlatform();
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("!ls");
    expect(prompt).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("no team loaded")));
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
    expect(execute).toHaveBeenCalledWith({ name: "setDefaultModel", provider: "openai", id: "gpt-4o", effort: "off", contextWindow: null });
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
  test("/team (no args) sets a usage error and does not call execute", () => {
    const { platform, execute } = makePlatform();
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/team");
    expect(execute).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/team <teamId>")));
  });

  test("/team <id> dispatches team load and replies 'loading team'", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementationOnce(async () => ({
      id: "alpha",
      leaderKey: "general-1",
      history: [],
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
      history: [],
      agents: [{ teamId: "alpha", role: "general", agentKey: "general-1", isLeader: true, model: null }],
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
      history: [],
      agents: [{ teamId: "alpha", role: "general", agentKey: "general-1", isLeader: true, model: null }],
    }));
  });

  test("/team <currentId> (cache hit) still dispatches switchTeam so the UI rebuilds", async () => {
    const { platform, execute } = makePlatform();
    const identity = {
      id: "alpha",
      leaderKey: "general-1",
      history: [],
      agents: [{ teamId: "alpha", role: "general", agentKey: "general-1", isLeader: true, model: null }],
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

describe("createTuiCommandHandler — /resume", () => {
  function makeDepsWithTeamId(platform: JiePlatform, teamId: string): DepsHandle {
    const handle = makeDeps(platform);
    handle.dispatch(Actions.switchTeam({
      id: teamId,
      leaderKey: "general-1",
      history: [],
      agents: [{ teamId, role: "general", agentKey: "general-1", isLeader: true, model: null }],
    }));
    return handle;
  }

  test("/resume (no args) sets a usage error and does not call execute", () => {
    const { platform, execute } = makePlatform();
    const { deps, dispatch } = makeDepsWithTeamId(platform, "minimal");
    const handler = createTuiCommandHandler(deps);
    handler.handle("/resume");
    expect(execute).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/resume <sessionId>")));
  });

  test("/resume <sessionId> with no team loaded sets an error and does not call execute", () => {
    const { platform, execute } = makePlatform();
    const { deps, dispatch } = makeDeps(platform);
    const handler = createTuiCommandHandler(deps);
    handler.handle("/resume s1");
    expect(execute).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("no team loaded")));
  });

  test("/resume <sessionId> dispatches resumeSession for the loaded team and replies", () => {
    const { platform, execute } = makePlatform();
    const identity = {
      id: "minimal",
      leaderKey: "general-1",
      history: [],
      agents: [{ teamId: "minimal", role: "general", agentKey: "general-1", isLeader: true, model: null }],
    };
    execute.mockImplementationOnce(async () => identity);
    const { deps, dispatch } = makeDepsWithTeamId(platform, "minimal");
    const handler = createTuiCommandHandler(deps);
    handler.handle("/resume s1");
    expect(execute).toHaveBeenCalledWith({ name: "resumeSession", teamId: "minimal", sessionId: "s1" });
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("resuming session 's1'")));
  });

  test("/resume <sessionId> dispatches switchTeam with the resumed identity", async () => {
    const { platform, execute } = makePlatform();
    const identity = {
      id: "minimal",
      leaderKey: "general-1",
      history: [],
      agents: [{ teamId: "minimal", role: "general", agentKey: "general-1", isLeader: true, model: null }],
    };
    execute.mockImplementationOnce(async () => identity);
    const { deps, dispatch } = makeDepsWithTeamId(platform, "minimal");
    const handler = createTuiCommandHandler(deps);
    handler.handle("/resume s1");
    await new Promise((r) => setImmediate(r));
    expect(dispatch).toHaveBeenCalledWith(Actions.switchTeam(identity));
  });

  test("/resume surfaces platform errors as an error banner", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async () => {
      throw new Error("sqlite locked");
    });
    const { deps, dispatch } = makeDepsWithTeamId(platform, "minimal");
    const handler = createTuiCommandHandler(deps);
    handler.handle("/resume s1");
    await new Promise((r) => setImmediate(r));
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/resume failed")));
  });
});

describe("SLASH_COMMAND_NAMES", () => {
  test("is the union of the commands and intercepts registries, in registration order", () => {
    expect(SLASH_COMMAND_NAMES).toEqual([
      "help",
      "clear",
      "exit",
      "login",
      "logout",
      "model",
      "team",
      "resume",
    ]);
  });
});
