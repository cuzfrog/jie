import { JiePlatformError, type JiePlatform, type SkillInfo } from "../../platform";
import { SLASH_COMMAND_NAMES, SLASH_COMMANDS } from "./command-registry";
import { CommandHandlerImpl, type CommandHandler } from "./command-handler";
import { CommandResolverImpl } from "./command-resolver";
import { Actions, type StateStore, type TuiState } from "../state";
import { makeAgentUiState, makeTuiState } from "../test";

const ANTHROPIC_KEY = "sk-test-anthropic";

interface PlatformHandle {
  readonly platform: JiePlatform;
  readonly execute: ReturnType<typeof vi.fn>;
  readonly prompt: ReturnType<typeof vi.fn>;
}

function makePlatform(): PlatformHandle {
  const platform = vi.mocked<JiePlatform>({
    settings: {},
    subscribe: vi.fn(() => () => undefined),
    prompt: vi.fn(),
    interrupt: vi.fn(),
    dequeuePrompt: vi.fn(),
    requeuePrompt: vi.fn(),
    teams: vi.fn(() => []),
    execute: vi.fn(async () => null),
    shutdown: vi.fn(),
  });
  return { platform, execute: platform.execute, prompt: platform.prompt };
}

function stateWithTeam(teamId: string, agentFocused: boolean): TuiState {
  const agent = makeAgentUiState(`${teamId}:general-1`, { isLeader: true });
  return makeTuiState({
    teamId,
    leaderAgentId: agent.agentId,
    focusedAgentId: agentFocused ? agent.agentId : null,
    agents: new Map([[agent.agentId, agent]]),
  });
}

interface HandlerHandle {
  readonly handler: CommandHandler;
  readonly dispatch: ReturnType<typeof vi.fn>;
}

function makeHandler(platform: JiePlatform, state: TuiState = makeTuiState()): HandlerHandle {
  const stateStore = vi.mocked<StateStore>({
    getState: vi.fn(() => state),
    dispatch: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
  });
  return {
    handler: new CommandHandlerImpl(stateStore, platform, new CommandResolverImpl(platform, SLASH_COMMANDS)),
    dispatch: stateStore.dispatch,
  };
}

describe("CommandHandlerImpl", () => {
  test("handle('/help') clears banners then dispatches showHelp", () => {
    const { platform } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/help");
    expect(dispatch).toHaveBeenCalledWith(Actions.clearBanners());
    expect(dispatch).toHaveBeenCalledWith(Actions.showHelp());
    expect(dispatch).not.toHaveBeenCalledWith(Actions.setTransientMessage(expect.anything()));
  });

  test("handle('/clear') dispatches clearTuiState", () => {
    const { platform } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/clear");
    expect(dispatch).toHaveBeenCalledWith(Actions.clearBanners());
    expect(dispatch).toHaveBeenCalledWith(Actions.clearTuiState());
  });

  test("handle('/new') dispatches clearTuiState as an alias of /clear", () => {
    const { platform } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/new");
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
  test("plain prompt routes to the focused agent", () => {
    const { platform, prompt } = makePlatform();
    const { handler } = makeHandler(platform, stateWithTeam("alpha", true));
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
    const { handler } = makeHandler(platform, stateWithTeam("alpha", false));
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

describe("CommandHandlerImpl — skill invocation", () => {
  const sayHello: SkillInfo = { name: "say-hello", description: "greets", argumentHint: null };

  function stateWithSkill(teamId: string, agentFocused: boolean): TuiState {
    const agent = makeAgentUiState(`${teamId}:general-1`, { isLeader: true, skills: [sayHello] });
    return makeTuiState({
      teamId,
      leaderAgentId: agent.agentId,
      focusedAgentId: agentFocused ? agent.agentId : null,
      agents: new Map([[agent.agentId, agent]]),
    });
  }

  test("routes a skill the target agent has, passing the text through verbatim", () => {
    const { platform, prompt } = makePlatform();
    const { handler } = makeHandler(platform, stateWithSkill("alpha", true));
    handler.handle("/skill:say-hello Cause");
    expect(prompt).toHaveBeenCalledWith("alpha", "general-1", "/skill:say-hello Cause");
  });

  test("falls back to the leader when no agent is focused", () => {
    const { platform, prompt } = makePlatform();
    const { handler } = makeHandler(platform, stateWithSkill("alpha", false));
    handler.handle("/skill:say-hello");
    expect(prompt).toHaveBeenCalledWith("alpha", "general-1", "/skill:say-hello");
  });

  test("rejects a skill the target agent does not have", () => {
    const { platform, prompt } = makePlatform();
    const { handler, dispatch } = makeHandler(platform, stateWithSkill("alpha", true));
    handler.handle("/skill:deploy now");
    expect(prompt).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("deploy")));
  });

  test("rejects a skill invocation when no team is loaded", () => {
    const { platform, prompt } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/skill:say-hello");
    expect(prompt).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("no team loaded")));
  });

  test("rejects a missing skill name", () => {
    const { platform, prompt } = makePlatform();
    const { handler, dispatch } = makeHandler(platform, stateWithSkill("alpha", true));
    handler.handle("/skill:");
    expect(prompt).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/skill:<name>")));
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
  test("/logout with no args sets a usage error and does not call execute", () => {
    const { platform, execute } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/logout");
    expect(execute).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/logout <provider>|*")));
  });

  test("/logout <provider> dispatches logout with that provider", () => {
    const { platform, execute } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/logout anthropic");
    expect(execute).toHaveBeenCalledWith({ name: "logout", provider: "anthropic" });
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("logged out of anthropic")));
  });

  test("/logout * logs out of all providers", () => {
    const { platform, execute } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/logout *");
    expect(execute).toHaveBeenCalledWith({ name: "logout", provider: "*" });
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("logged out of all providers")));
  });
});

describe("CommandHandlerImpl — /model", () => {
  test("/model <provider>/<modelId> parses and dispatches setDefaultModel", () => {
    const { platform, execute } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/model openai/gpt-4o");
    expect(execute).toHaveBeenCalledWith({ name: "setDefaultModel", provider: "openai", id: "gpt-4o" });
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

describe("CommandHandlerImpl — /model-filter", () => {
  type ModelRow = { readonly provider: string; readonly id: string; readonly name: string; readonly available: boolean };

  function mockFilterBackend(execute: ReturnType<typeof vi.fn>, filters: ReadonlyArray<string>, models: ReadonlyArray<ModelRow>): void {
    execute.mockImplementation(async (cmd: { name: string; pattern?: string; existingFilters?: ReadonlyArray<string> }) => {
      if (cmd.name === "getModelFilters") return filters;
      if (cmd.name === "setModelFilters") return null;
      if (cmd.name === "validateModelFilter") {
        const pattern = cmd.pattern ?? "";
        const existing = cmd.existingFilters ?? [];
        if (existing.includes(pattern)) return null;
        const combined = [...existing, pattern];
        const available = models.filter((model) => model.available);
        if (available.length === 0) return null;
        const target = (model: { provider: string; id: string }) => `${model.provider}/${model.id}`.toLowerCase();
        if (available.some((model) => combined.some((filter) => target(model).includes(filter.toLowerCase())))) return null;
        const basis = existing.length === 0 ? "it matches none" : `combined with existing filters (${existing.join(", ")}) it matches none`;
        return `/model-filter: pattern '${pattern}' rejected — ${basis} of the ${available.length} available models`;
      }
      return null;
    });
  }

  test("/model-filter with no args sets a usage error and does not call execute", () => {
    const { platform, execute } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/model-filter");
    expect(execute).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/model-filter <add|remove|list> <pattern>")));
  });

  test("/model-filter add without a pattern sets a usage error", () => {
    const { platform, execute } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/model-filter add");
    expect(execute).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/model-filter <add|remove|list> <pattern>")));
  });

  test("/model-filter with an unknown action sets a usage error", () => {
    const { platform, execute } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/model-filter toggle qwen");
    expect(execute).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/model-filter <add|remove|list> <pattern>")));
  });

  test("/model-filter list prints the stored filters as a transient message", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementationOnce(async () => ["gpt", "qwen"]);
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/model-filter list");
    await new Promise((r) => setImmediate(r));
    expect(execute).toHaveBeenCalledWith({ name: "getModelFilters" });
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage("model filters: gpt · qwen"));
  });

  test("/model-filter list reports when no filter is stored", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementationOnce(async () => []);
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/model-filter list");
    await new Promise((r) => setImmediate(r));
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage("no model filters set"));
  });

  test("/model-filter list with an extra argument sets a usage error and does not call execute", () => {
    const { platform, execute } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/model-filter list qwen");
    expect(execute).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/model-filter <add|remove|list> <pattern>")));
  });

  test("/model-filter add <pattern> appends the pattern to the stored filters", async () => {
    const { platform, execute } = makePlatform();
    mockFilterBackend(execute, ["gpt"], [{ provider: "openai", id: "gpt-5", name: "GPT-5", available: true }]);
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/model-filter add qwen");
    await new Promise((r) => setImmediate(r));
    expect(execute).toHaveBeenCalledWith({ name: "getModelFilters" });
    expect(execute).toHaveBeenCalledWith({ name: "setModelFilters", filters: ["gpt", "qwen"] });
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("model filter added: qwen")));
  });

  test("/model-filter add <pattern> does not duplicate an existing pattern", async () => {
    const { platform, execute } = makePlatform();
    mockFilterBackend(execute, ["qwen"], [{ provider: "alibaba", id: "qwen3-coder", name: "Qwen3 Coder", available: true }]);
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/model-filter add qwen");
    await new Promise((r) => setImmediate(r));
    expect(execute).toHaveBeenCalledWith({ name: "setModelFilters", filters: ["qwen"] });
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("model filter added: qwen")));
  });

  test("/model-filter add rejects a pattern that leaves no available model", async () => {
    const { platform, execute } = makePlatform();
    mockFilterBackend(execute, ["gpt"], [{ provider: "anthropic", id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", available: true }]);
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/model-filter add xyz");
    await new Promise((r) => setImmediate(r));
    expect(execute).not.toHaveBeenCalledWith({ name: "setModelFilters", filters: expect.anything() });
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(
      "/model-filter: pattern 'xyz' rejected — combined with existing filters (gpt) it matches none of the 1 available models"));
  });

  test("/model-filter add rejection omits the existing-filters clause when none is stored", async () => {
    const { platform, execute } = makePlatform();
    mockFilterBackend(execute, [], [{ provider: "openai", id: "gpt-5", name: "GPT-5", available: true }]);
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/model-filter add xyz");
    await new Promise((r) => setImmediate(r));
    expect(execute).not.toHaveBeenCalledWith({ name: "setModelFilters", filters: expect.anything() });
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(
      "/model-filter: pattern 'xyz' rejected — it matches none of the 1 available models"));
  });

  test("/model-filter add validates against available models only", async () => {
    const { platform, execute } = makePlatform();
    mockFilterBackend(execute, [], [{ provider: "openai", id: "gpt-5", name: "GPT-5", available: false }]);
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/model-filter add gpt");
    await new Promise((r) => setImmediate(r));
    expect(execute).toHaveBeenCalledWith({ name: "setModelFilters", filters: ["gpt"] });
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("model filter added: gpt")));
  });

  test("/model-filter remove <pattern> drops the pattern from the stored filters", async () => {
    const { platform, execute } = makePlatform();
    mockFilterBackend(execute, ["gpt", "qwen"], []);
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/model-filter remove qwen");
    await new Promise((r) => setImmediate(r));
    expect(execute).toHaveBeenCalledWith({ name: "setModelFilters", filters: ["gpt"] });
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("model filter removed: qwen")));
  });

  test("/model-filter remove of an unset pattern sets an error and does not write", async () => {
    const { platform, execute } = makePlatform();
    mockFilterBackend(execute, ["gpt"], []);
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/model-filter remove qwen");
    await new Promise((r) => setImmediate(r));
    expect(execute).not.toHaveBeenCalledWith({ name: "setModelFilters", filters: expect.anything() });
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("pattern 'qwen' is not set")));
  });

  test("/model-filter surfaces platform errors as error messages", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async () => { throw new Error("disk full"); });
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/model-filter add qwen");
    await new Promise((r) => setImmediate(r));
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/model-filter failed")));
  });
});

describe("CommandHandlerImpl — /effort", () => {
  test("/effort <level> dispatches setDefaultEffort and replies", () => {
    const { platform, execute } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/effort high");
    expect(execute).toHaveBeenCalledWith({ name: "setDefaultEffort", effort: "high" });
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("effort set to high")));
  });

  test("/effort with an unknown level sets an error and does not dispatch", () => {
    const { platform, execute } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/effort extreme");
    expect(execute).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/effort: invalid 'extreme'")));
  });

  test("/effort (no args) queries the current default and shows it as a transient message", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementationOnce(async () => "max");
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/effort");
    await new Promise((r) => setImmediate(r));
    expect(execute).toHaveBeenCalledWith({ name: "getDefaultEffort" });
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("default effort: max")));
  });

  test("/effort surfaces platform errors as error messages", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async () => { throw new Error("disk full"); });
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/effort high");
    await new Promise((r) => setImmediate(r));
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/effort failed")));
  });
});

describe("CommandHandlerImpl — /reload", () => {
  const soloIdentity = {
    id: "default-solo",
    leaderKey: "general-1",
    sessionName: null,
    currentSessionId: null,
    kanbanCards: [],
    history: [],
    agents: [{ teamId: "default-solo", role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null }],
  };

  test("/reload while any agent is busy sets an error banner and does not call execute", () => {
    const { platform, execute } = makePlatform();
    const busyAgent = makeAgentUiState("alpha:general-1", { isLeader: true, status: "busy" });
    const state = makeTuiState({ teamId: "alpha", leaderAgentId: busyAgent.agentId, agents: new Map([[busyAgent.agentId, busyAgent]]) });
    const { handler, dispatch } = makeHandler(platform, state);
    handler.handle("/reload");
    expect(execute).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("wait for the current response to finish")));
  });

  test("/reload dispatches the reload command and replies", () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementationOnce(async () => [soloIdentity]);
    const { handler, dispatch } = makeHandler(platform, stateWithTeam("default-solo", true));
    handler.handle("/reload");
    expect(execute).toHaveBeenCalledWith({ name: "reload" });
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("reloaded settings, manifests, and context files")));
  });

  test("/reload rehydrates the active team via switchTeam with its reloaded identity", async () => {
    const { platform, execute } = makePlatform();
    const alphaIdentity = { ...soloIdentity, id: "alpha", agents: [{ ...soloIdentity.agents[0]!, teamId: "alpha" }] };
    execute.mockImplementationOnce(async () => [soloIdentity, alphaIdentity]);
    const { handler, dispatch } = makeHandler(platform, stateWithTeam("alpha", true));
    handler.handle("/reload");
    await new Promise((r) => setImmediate(r));
    expect(dispatch).toHaveBeenCalledWith(Actions.switchTeam(alphaIdentity));
  });

  test("/reload with no team loaded replies without dispatching switchTeam", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementationOnce(async () => []);
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/reload");
    await new Promise((r) => setImmediate(r));
    expect(execute).toHaveBeenCalledWith({ name: "reload" });
    const switchCalls = dispatch.mock.calls.filter(([a]) => a.type === "[ui] switch team");
    expect(switchCalls).toHaveLength(0);
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("reloaded settings, manifests, and context files")));
  });

  test("/reload surfaces platform errors as an error banner", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async () => { throw new Error("manifest broken"); });
    const { handler, dispatch } = makeHandler(platform, stateWithTeam("default-solo", true));
    handler.handle("/reload");
    await new Promise((r) => setImmediate(r));
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/reload failed")));
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
      sessionName: null,
      currentSessionId: null,
      kanbanCards: [],
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
      sessionName: null,
      currentSessionId: null,
      kanbanCards: [],
      history: [],
      agents: [{ teamId: "alpha", role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null }],
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
      sessionName: null,
      currentSessionId: null,
      kanbanCards: [],
      history: [],
      agents: [{ teamId: "alpha", role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null }],
    }));
  });

  test("/team <currentId> (cache hit) still dispatches switchTeam so the UI rebuilds", async () => {
    const { platform, execute } = makePlatform();
    const identity = {
      id: "alpha",
      leaderKey: "general-1",
      sessionName: null,
      currentSessionId: null,
      kanbanCards: [],
      history: [],
      agents: [{ teamId: "alpha", role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null }],
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
  test("/resume (no args) sets a usage error and does not call execute", () => {
    const { platform, execute } = makePlatform();
    const { handler, dispatch } = makeHandler(platform, stateWithTeam("default-solo", true));
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
      id: "default-solo",
      leaderKey: "general-1",
      sessionName: null,
      currentSessionId: null,
      kanbanCards: [],
      history: [],
      agents: [{ teamId: "default-solo", role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null }],
    };
    execute.mockImplementationOnce(async () => identity);
    const { handler, dispatch } = makeHandler(platform, stateWithTeam("default-solo", true));
    handler.handle("/resume s1");
    expect(execute).toHaveBeenCalledWith({ name: "resumeSession", teamId: "default-solo", sessionId: "s1" });
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("resuming session 's1'")));
  });

  test("/resume <sessionId> dispatches switchTeam with the resumed identity", async () => {
    const { platform, execute } = makePlatform();
    const identity = {
      id: "default-solo",
      leaderKey: "general-1",
      sessionName: null,
      currentSessionId: null,
      kanbanCards: [],
      history: [],
      agents: [{ teamId: "default-solo", role: "general", agentKey: "general-1", isLeader: true, tools: [], subscribe: [], skills: [], model: null }],
    };
    execute.mockImplementationOnce(async () => identity);
    const { handler, dispatch } = makeHandler(platform, stateWithTeam("default-solo", true));
    handler.handle("/resume s1");
    await new Promise((r) => setImmediate(r));
    expect(dispatch).toHaveBeenCalledWith(Actions.switchTeam(identity));
  });

  test("/resume surfaces platform errors as an error banner", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async () => {
      throw new Error("sqlite locked");
    });
    const { handler, dispatch } = makeHandler(platform, stateWithTeam("default-solo", true));
    handler.handle("/resume s1");
    await new Promise((r) => setImmediate(r));
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/resume failed")));
  });
});

describe("CommandHandlerImpl — /rename", () => {
  test("/rename (no args) sets a usage error and does not call execute", () => {
    const { platform, execute } = makePlatform();
    const { handler, dispatch } = makeHandler(platform, stateWithTeam("default-solo", true));
    handler.handle("/rename");
    expect(execute).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/rename <name>")));
  });

  test("/rename <name> with no team loaded sets an error and does not call execute", () => {
    const { platform, execute } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/rename my session");
    expect(execute).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("no team loaded")));
  });

  test("/rename joins multi-word args and dispatches renameSession for the loaded team", () => {
    const { platform, execute } = makePlatform();
    const { handler, dispatch } = makeHandler(platform, stateWithTeam("default-solo", true));
    handler.handle("/rename my cool session");
    expect(execute).toHaveBeenCalledWith({ name: "renameSession", teamId: "default-solo", sessionName: "my cool session" });
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("session renamed to my cool session")));
  });

  test("/rename dispatches setSessionName once the rename succeeds", async () => {
    const { platform } = makePlatform();
    const { handler, dispatch } = makeHandler(platform, stateWithTeam("default-solo", true));
    handler.handle("/rename my cool session");
    await new Promise((r) => setImmediate(r));
    expect(dispatch).toHaveBeenCalledWith(Actions.setSessionName("my cool session"));
  });

  test("/rename does not dispatch setSessionName when the platform rejects", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async () => {
      throw new Error("sqlite locked");
    });
    const { handler, dispatch } = makeHandler(platform, stateWithTeam("default-solo", true));
    handler.handle("/rename x");
    await new Promise((r) => setImmediate(r));
    expect(dispatch).not.toHaveBeenCalledWith(Actions.setSessionName(expect.anything()));
  });

  test("/rename surfaces platform errors as an error banner", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async () => {
      throw new Error("sqlite locked");
    });
    const { handler, dispatch } = makeHandler(platform, stateWithTeam("default-solo", true));
    handler.handle("/rename x");
    await new Promise((r) => setImmediate(r));
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/rename failed")));
  });
});

describe("CommandHandlerImpl — /kanban", () => {
  test("/kanban cycles the kanban view without touching the platform", () => {
    const { platform, execute } = makePlatform();
    const { handler, dispatch } = makeHandler(platform, stateWithTeam("my-team", true));
    handler.handle("/kanban");
    expect(dispatch).toHaveBeenCalledWith(Actions.cycleKanbanView());
    expect(execute).not.toHaveBeenCalled();
  });

  test("/kanban without a team dispatches the cycle like ctrl+k, which no-ops in the reducer", () => {
    const { platform, execute } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/kanban");
    expect(dispatch).toHaveBeenCalledWith(Actions.cycleKanbanView());
    expect(execute).not.toHaveBeenCalled();
  });

  test("/kanban add executes kanbanAdd and publishes the returned board", async () => {
    const { platform, execute } = makePlatform();
    const board = [{ id: "#1", content: "write spec", status: "pending" as const }];
    execute.mockResolvedValueOnce({ board, card: board[0] });
    const { handler, dispatch } = makeHandler(platform, stateWithTeam("my-team", true));
    handler.handle("/kanban add write spec");
    expect(execute).toHaveBeenCalledWith({ name: "kanbanAdd", teamId: "my-team", description: "write spec" });
    await new Promise((r) => setImmediate(r));
    expect(dispatch).toHaveBeenCalledWith(Actions.setKanbanBoard(board));
  });

  test("/kanban add --title <title> <description> carries the title", () => {
    const { platform, execute } = makePlatform();
    execute.mockResolvedValueOnce({ board: [], card: { id: "#1", content: "t", status: "pending" } });
    const { handler } = makeHandler(platform, stateWithTeam("my-team", true));
    handler.handle("/kanban add --title refactor write the report");
    expect(execute).toHaveBeenCalledWith({ name: "kanbanAdd", teamId: "my-team", title: "refactor", description: "write the report" });
  });

  test("/kanban add --ephemeral <description> creates a session-scoped card", () => {
    const { platform, execute } = makePlatform();
    execute.mockResolvedValueOnce({ board: [], card: { id: "#1", content: "t", status: "pending" } });
    const { handler } = makeHandler(platform, stateWithTeam("my-team", true));
    handler.handle("/kanban add --ephemeral write the report");
    expect(execute).toHaveBeenCalledWith({ name: "kanbanAdd", teamId: "my-team", description: "write the report", scope: "session" });
  });

  test("/kanban add with no description reports usage", () => {
    const { platform, execute } = makePlatform();
    const { handler, dispatch } = makeHandler(platform, stateWithTeam("my-team", true));
    handler.handle("/kanban add");
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage("/kanban add [--ephemeral] [--title <title>] <description>"));
    expect(execute).not.toHaveBeenCalled();
  });

  test("/kanban add --title with no title reports usage", () => {
    const { platform, execute } = makePlatform();
    const { handler, dispatch } = makeHandler(platform, stateWithTeam("my-team", true));
    handler.handle("/kanban add --title");
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("--title")));
    expect(execute).not.toHaveBeenCalled();
  });

  test("/kanban remove executes kanbanRemove and publishes the board", async () => {
    const { platform, execute } = makePlatform();
    execute.mockResolvedValueOnce({ board: [] });
    const { handler, dispatch } = makeHandler(platform, stateWithTeam("my-team", true));
    handler.handle("/kanban remove #1");
    expect(execute).toHaveBeenCalledWith({ name: "kanbanRemove", teamId: "my-team", cardId: "#1" });
    await new Promise((r) => setImmediate(r));
    expect(dispatch).toHaveBeenCalledWith(Actions.setKanbanBoard([]));
  });

  test("/kanban remove without a card id reports usage", () => {
    const { platform, execute } = makePlatform();
    const { handler, dispatch } = makeHandler(platform, stateWithTeam("my-team", true));
    handler.handle("/kanban remove");
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage("/kanban remove <cardId>"));
    expect(execute).not.toHaveBeenCalled();
  });

  test("/kanban complete executes kanbanSetStatus completed and publishes the board", async () => {
    const { platform, execute } = makePlatform();
    execute.mockResolvedValueOnce({ board: [] });
    const { handler, dispatch } = makeHandler(platform, stateWithTeam("my-team", true));
    handler.handle("/kanban complete #1");
    expect(execute).toHaveBeenCalledWith({ name: "kanbanSetStatus", teamId: "my-team", cardId: "#1", status: "completed" });
    await new Promise((r) => setImmediate(r));
    expect(dispatch).toHaveBeenCalledWith(Actions.setKanbanBoard([]));
  });

  test("/kanban review executes kanbanSetStatus in_review and publishes the board", async () => {
    const { platform, execute } = makePlatform();
    execute.mockResolvedValueOnce({ board: [] });
    const { handler, dispatch } = makeHandler(platform, stateWithTeam("my-team", true));
    handler.handle("/kanban review #1");
    expect(execute).toHaveBeenCalledWith({ name: "kanbanSetStatus", teamId: "my-team", cardId: "#1", status: "in_review" });
    await new Promise((r) => setImmediate(r));
    expect(dispatch).toHaveBeenCalledWith(Actions.setKanbanBoard([]));
  });

  test("/kanban handoff executes kanbanHandoff and publishes the source board", async () => {
    const { platform, execute } = makePlatform();
    execute.mockResolvedValueOnce({ board: [], card: { id: "#7", content: "handed off", status: "pending" } });
    const { handler, dispatch } = makeHandler(platform, stateWithTeam("my-team", true));
    handler.handle("/kanban handoff #1 target-team");
    expect(execute).toHaveBeenCalledWith({ name: "kanbanHandoff", teamId: "my-team", cardId: "#1", targetTeamId: "target-team" });
    await new Promise((r) => setImmediate(r));
    expect(dispatch).toHaveBeenCalledWith(Actions.setKanbanBoard([]));
  });

  test("/kanban handoff accepts a cross-team source reference", () => {
    const { platform, execute } = makePlatform();
    const { handler } = makeHandler(platform, stateWithTeam("my-team", true));
    handler.handle("/kanban handoff other-team/#5 target-team");
    expect(execute).toHaveBeenCalledWith({ name: "kanbanHandoff", teamId: "my-team", cardId: "other-team/#5", targetTeamId: "target-team" });
  });

  test("/kanban handoff without a target team reports usage", () => {
    const { platform } = makePlatform();
    const { handler, dispatch } = makeHandler(platform, stateWithTeam("my-team", true));
    handler.handle("/kanban handoff #1");
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage("/kanban handoff [<teamId>/]<cardId> <targetTeamId>"));
  });

  test("an unknown /kanban subcommand reports an error", () => {
    const { platform } = makePlatform();
    const { handler, dispatch } = makeHandler(platform, stateWithTeam("my-team", true));
    handler.handle("/kanban bogus");
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("unknown subcommand")));
  });

  test("a failed /kanban add surfaces the platform error as a banner", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async () => {
      throw new Error("boom");
    });
    const { handler, dispatch } = makeHandler(platform, stateWithTeam("my-team", true));
    handler.handle("/kanban add write spec");
    await new Promise((r) => setImmediate(r));
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/kanban add failed")));
  });
});

describe("CommandHandlerImpl — /notification", () => {
  test("/notification sound enable dispatches setNotificationSoundEnabled and a transient message", async () => {
    const { platform, execute } = makePlatform();
    execute.mockResolvedValueOnce(null);
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/notification sound enable");
    expect(execute).toHaveBeenCalledWith({ name: "setNotificationSoundEnabled", enabled: true });
    await new Promise((r) => setImmediate(r));
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage("sound notifications enabled"));
  });

  test("/notification sound disable dispatches setNotificationSoundEnabled and a transient message", async () => {
    const { platform, execute } = makePlatform();
    execute.mockResolvedValueOnce(null);
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/notification sound disable");
    expect(execute).toHaveBeenCalledWith({ name: "setNotificationSoundEnabled", enabled: false });
    await new Promise((r) => setImmediate(r));
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage("sound notifications disabled"));
  });

  test("/notification with no subcommand reports usage", () => {
    const { platform } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/notification");
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage("/notification sound enable|disable"));
  });

  test("/notification sound without a value reports usage", () => {
    const { platform } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/notification sound");
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage("/notification sound enable|disable"));
  });

  test("/notification sound with an unknown value reports usage", () => {
    const { platform } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/notification sound loud");
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage("/notification sound enable|disable"));
  });

  test("a failed /notification sound surfaces the platform error as a banner", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async () => {
      throw new Error("boom");
    });
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/notification sound enable");
    await new Promise((r) => setImmediate(r));
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/notification sound failed")));
  });
});

describe("CommandHandlerImpl — /compact", () => {
  test("/compact dispatches the compact command for the focused agent", async () => {
    const { platform, execute } = makePlatform();
    const { handler, dispatch } = makeHandler(platform, stateWithTeam("my-team", true));
    handler.handle("/compact");
    await new Promise((r) => setImmediate(r));
    expect(execute).toHaveBeenCalledWith({ name: "compact", teamId: "my-team", agentKey: "general-1" });
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("compacting")));
  });

  test("/compact with no team loaded sets an error", () => {
    const { platform, execute } = makePlatform();
    const { handler, dispatch } = makeHandler(platform);
    handler.handle("/compact");
    expect(execute).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/compact: no focused agent")));
  });

  test("/compact while the focused agent is busy sets an error", () => {
    const { platform, execute } = makePlatform();
    const busyAgent = makeAgentUiState("my-team:general-1", { isLeader: true, status: "busy" });
    const state = makeTuiState({ teamId: "my-team", leaderAgentId: busyAgent.agentId, focusedAgentId: busyAgent.agentId, agents: new Map([[busyAgent.agentId, busyAgent]]) });
    const { handler, dispatch } = makeHandler(platform, state);
    handler.handle("/compact");
    expect(execute).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage("wait for the current response to finish before compacting"));
  });

  test("a failed /compact surfaces the platform error as a banner", async () => {
    const { platform, execute } = makePlatform();
    execute.mockImplementation(async () => { throw new Error("compactor offline"); });
    const { handler, dispatch } = makeHandler(platform, stateWithTeam("my-team", true));
    handler.handle("/compact");
    await new Promise((r) => setImmediate(r));
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/compact failed")));
  });
});

describe("SLASH_COMMAND_NAMES", () => {
  test("is the union of the commands and intercepts registries, in registration order", () => {
    expect(SLASH_COMMAND_NAMES).toEqual([
      "help",
      "clear",
      "new",
      "exit",
      "login",
      "logout",
      "model",
      "model-filter",
      "effort",
      "compact",
      "reload",
      "team",
      "resume",
      "rename",
      "kanban",
      "notification",
    ]);
  });
});


