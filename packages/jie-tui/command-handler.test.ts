import { JiePlatformError, type JiePlatform } from "@cuzfrog/jie-platform";
import { CommandHandlerImpl, SLASH_COMMAND_NAMES, type CommandHandler } from "./command-handler";
import { createContainer, InjectionMode } from "awilix";
import { Actions, registerStateModule, type StateStore, type TuiState } from "./state";
import { type TuiCradle } from "./container";

function makeStateStore(): StateStore {
  const container = createContainer<TuiCradle>({ injectionMode: InjectionMode.CLASSIC });
  registerStateModule(container);
  return container.cradle.stateStore;
}

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

interface HandlerHandle {
  handler: CommandHandler;
  getState: () => TuiState;
  dispatch: ReturnType<typeof vi.fn>;
}

function makeHandler(platform: JiePlatform): HandlerHandle {
  const baseStore = makeStateStore();
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
  return { handler: new CommandHandlerImpl(stateStore, platform), getState: () => current, dispatch };
}

describe("CommandHandlerImpl", () => {
  test("handle('/help') clears banners then sets a reply message", () => {
    const { platform } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/help");
    expect(dispatch).toHaveBeenCalledWith(Actions.clearBanners());
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("/clear")));
  });

  test("handle('/clear') dispatches clearTuiState", () => {
    const { platform } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/clear");
    expect(dispatch).toHaveBeenCalledWith(Actions.clearBanners());
    expect(dispatch).toHaveBeenCalledWith(Actions.clearTuiState());
  });

  test("handle('/exit') dispatches requestQuit", () => {
    const { platform } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/exit");
    expect(dispatch).toHaveBeenCalledWith(Actions.requestQuit());
  });

  test("handle('/nope') sets an error message", () => {
    const { platform } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/nope");
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/nope")));
  });

  test("handle clears banners before each invocation", () => {
    const { platform } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/help");
    expect(dispatch.mock.calls[0]?.[0]).toEqual(Actions.clearBanners());
  });
});

describe("CommandHandlerImpl — prompt routing", () => {
  function makeHandlerWithTeam(platform: JiePlatform): HandlerHandle {
    const handle = makeHandler(platform);
    handle.dispatch(Actions.switchTeam({
      id: "alpha",
      leaderKey: "general-1",
      history: [],
      agents: [{ teamId: "alpha", role: "general", agentKey: "general-1", isLeader: true, model: null }],
    }));
    return handle;
  }

  function makeHandlerWithState(platform: JiePlatform, state: TuiState): HandlerHandle {
    const dispatch = vi.fn();
    const stateStore: StateStore = {
      getState: () => state,
      dispatch: (action) => { dispatch(action); },
      subscribe: vi.fn(() => (): void => undefined),
    };
    return { handler: new CommandHandlerImpl(stateStore, platform), getState: () => state, dispatch };
  }

  test("plain prompt routes to the focused agent", () => {
    const { platform, prompt } = makePlatform();
    const { handler } = makeHandlerWithTeam(platform);
    handler.handle("hello world");
    expect(prompt).toHaveBeenCalledWith("alpha", "general-1", "hello world");
  });

  test("plain prompt with no team loaded sets an error banner instead of dropping silently", () => {
    const { platform, prompt } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("hello");
    expect(prompt).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("no team loaded")));
  });

  test("plain prompt falls back to the leader when no agent is focused", () => {
    const { platform, prompt } = makePlatform();
    const seeded = makeHandlerWithTeam(platform);
    const unfocused: TuiState = { ...seeded.getState(), focusedAgentId: null };
    const { handler } = makeHandlerWithState(platform, unfocused);
    handler.handle("hello");
    expect(prompt).toHaveBeenCalledWith("alpha", "general-1", "hello");
  });

  test("bash directive with no team loaded sets an error banner", () => {
    const { platform, prompt } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("!ls");
    expect(prompt).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("no team loaded")));
  });
});

describe("CommandHandlerImpl — /login", () => {
  test("/login <provider> <apiKey> dispatches login command and replies", () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async () => undefined);
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/login anthropic " + ANTHROPIC_KEY);
    expect(execute).toHaveBeenCalledWith({ name: "login", provider: "anthropic", apiKey: ANTHROPIC_KEY });
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("logged in to anthropic")));
  });

  test("/login with wrong arity sets an error message and does not dispatch", () => {
    const { platform, execute } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/login anthropic");
    expect(execute).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/login <provider> <apiKey>")));
  });

  test("/login surfaces platform errors as error messages", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async () => { throw new Error("auth failed"); });
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/login anthropic " + ANTHROPIC_KEY);
    await new Promise((r) => setImmediate(r));
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/login failed")));
  });
});

describe("CommandHandlerImpl — /logout", () => {
  test("/logout with no args dispatches logout with provider undefined", () => {
    const { platform, execute } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/logout");
    expect(execute).toHaveBeenCalledWith({ name: "logout", provider: undefined });
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("logged out of all providers")));
  });

  test("/logout <provider> dispatches logout with that provider", () => {
    const { platform, execute } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/logout anthropic");
    expect(execute).toHaveBeenCalledWith({ name: "logout", provider: "anthropic" });
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("logged out of anthropic")));
  });
});

describe("CommandHandlerImpl — /model", () => {
  test("/model <provider>/<modelId> parses and dispatches setDefaultModel", () => {
    const { platform, execute } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/model openai/gpt-4o");
    expect(execute).toHaveBeenCalledWith({ name: "setDefaultModel", provider: "openai", id: "gpt-4o", effort: "off", contextWindow: null });
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("default model set to openai/gpt-4o")));
  });

  test("/model without slash sets an error", () => {
    const { platform, execute } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/model just-a-string");
    expect(execute).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("invalid")));
  });

  test("/model surfaces platform errors as error messages", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async () => {
      throw new JiePlatformError("UNKNOWN_PROVIDER", { detail: "no-such-provider" });
    });
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/model no-such-provider/gpt-4o");
    await new Promise((r) => setImmediate(r));
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/model failed")));
  });

  test("/model with wrong arity sets an error", () => {
    const { platform, execute } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/model");
    expect(execute).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/model <provider>/<modelId>")));
  });
});

describe("CommandHandlerImpl — /team", () => {
  test("/team (no args) sets a usage error and does not call execute", () => {
    const { platform, execute } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
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
    const { handler, dispatch } = makeHandler(platform);
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
    const { handler, dispatch } = makeHandler(platform);
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
    const { handler, dispatch } = makeHandler(platform);
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
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/team ghost");
    await new Promise((r) => setImmediate(r));
    expect(execute).toHaveBeenCalledWith({ name: "team", teamId: "ghost" });
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("ghost")));
  });
});

describe("CommandHandlerImpl — /resume", () => {
  function makeHandlerWithTeamId(platform: JiePlatform, teamId: string): HandlerHandle {
    const handle = makeHandler(platform);
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
    const { handler, dispatch } = makeHandlerWithTeamId(platform, "minimal");
    handler.handle("/resume");
    expect(execute).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/resume <sessionId>")));
  });

  test("/resume <sessionId> with no team loaded sets an error and does not call execute", () => {
    const { platform, execute } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
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
    const { handler, dispatch } = makeHandlerWithTeamId(platform, "minimal");
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
    const { handler, dispatch } = makeHandlerWithTeamId(platform, "minimal");
    handler.handle("/resume s1");
    await new Promise((r) => setImmediate(r));
    expect(dispatch).toHaveBeenCalledWith(Actions.switchTeam(identity));
  });

  test("/resume surfaces platform errors as an error banner", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async () => {
      throw new Error("sqlite locked");
    });
    const { handler, dispatch } = makeHandlerWithTeamId(platform, "minimal");
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
