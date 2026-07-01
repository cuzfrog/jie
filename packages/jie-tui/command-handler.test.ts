import {
  createTuiCommandHandler,
  runCommand,
  type CommandHandlerDeps,
  type TuiCommandHandler,
} from "./command-handler";
import { Actions, ActionTypes, INITIAL_TUI_STATE, type Action, type TuiState } from "./state";
import type { AuthStore, Settings, SettingsStore, Scope } from "@cuzfrog/jie-platform/config";
import type { TeamRegistry } from "@cuzfrog/jie-platform/team";

const authStore = vi.mocked<AuthStore>({
  load: vi.fn(),
  write: vi.fn(),
  setProvider: vi.fn(),
  removeProvider: vi.fn(),
  clear: vi.fn(),
});

const settingsStore = vi.mocked<SettingsStore>({
  load: vi.fn(),
  write: vi.fn(),
  unsetDefaultTeam: vi.fn(),
});

const teamRegistry = vi.mocked<TeamRegistry>({
  loadTeam: vi.fn(),
  isInstalled: vi.fn(),
  listInstalled: vi.fn(),
  locate: vi.fn(),
});

const loadTeam = vi.fn<() => Promise<void>>(() => Promise.resolve());

const ANTHROPIC_KEY = "sk-test-anthropic";
const SETTINGS_DEFAULT: Settings = {
  defaultProvider: "anthropic",
  defaultModel: "claude-sonnet-4-5",
};

describe("runCommand", () => {
  test("/help returns reply with the help banner", () => {
    const out = runCommand("/help");
    expect(out.kind).toBe("reply");
    if (out.kind === "reply") {
      expect(out.text).toContain("/clear");
      expect(out.text).toContain("/team");
    }
  });

  test("/clear returns clearState outcome", () => {
    expect(runCommand("/clear").kind).toBe("clearState");
  });

  test("/exit returns stop outcome", () => {
    expect(runCommand("/exit").kind).toBe("stop");
  });

  test("/team with no argument returns reply prompting for an id", () => {
    const out = runCommand("/team");
    expect(out.kind).toBe("reply");
    if (out.kind === "reply") expect(out.text).toContain("/team <id>");
  });

  test("/team --unset returns reply about not-wired state", () => {
    const out = runCommand("/team --unset");
    expect(out.kind).toBe("reply");
    if (out.kind === "reply") expect(out.text).toContain("--unset");
  });

  test("/team foo returns reply about a team not being installed", () => {
    const out = runCommand("/team foo");
    expect(out.kind).toBe("reply");
    if (out.kind === "reply") {
      expect(out.text).toContain("foo");
      expect(out.text).toContain("not installed");
    }
  });

  test("/login returns reply pointing users at the CLI subcommand", () => {
    const out = runCommand("/login");
    expect(out.kind).toBe("reply");
    if (out.kind === "reply") expect(out.text).toContain("jie login");
  });

  test("/logout returns reply pointing users at the CLI subcommand", () => {
    const out = runCommand("/logout");
    expect(out.kind).toBe("reply");
    if (out.kind === "reply") expect(out.text).toContain("jie logout");
  });

  test("/model returns reply pointing users at the CLI subcommand", () => {
    const out = runCommand("/model");
    expect(out.kind).toBe("reply");
    if (out.kind === "reply") expect(out.text).toContain("jie model");
  });

  test("unknown slash command returns error outcome", () => {
    const out = runCommand("/nope");
    expect(out.kind).toBe("error");
    if (out.kind === "error") expect(out.text).toContain("/nope");
  });

  test("trailing whitespace does not break command parsing", () => {
    expect(runCommand("/help   ").kind).toBe("reply");
  });
});

interface DepsHandle {
  deps: CommandHandlerDeps;
  getState: () => TuiState;
  dispatch: ReturnType<typeof vi.fn>;
  requestQuit: ReturnType<typeof vi.fn>;
}

function makeDeps(): DepsHandle {
  let state: TuiState = { ...INITIAL_TUI_STATE, agents: new Map(INITIAL_TUI_STATE.agents) };
  const dispatch = vi.fn((action: Action) => {
    if (action.type === ActionTypes.SET_TRANSIENT_MESSAGE) state = { ...state, transientMessage: action.payload.text };
    else if (action.type === ActionTypes.SET_ERROR_MESSAGE) state = { ...state, errorBanner: action.payload.text };
    else if (action.type === ActionTypes.CLEAR_TRANSIENT_MESSAGE) state = { ...state, transientMessage: null };
    else if (action.type === ActionTypes.CLEAR_ERROR_MESSAGE) state = { ...state, errorBanner: null };
    else if (action.type === ActionTypes.CLEAR_TUI_STATE) state = INITIAL_TUI_STATE;
  });
  const requestQuit = vi.fn();
  const deps: CommandHandlerDeps = {
    getState: () => state,
    dispatch,
    requestQuit,
  };
  return { deps, getState: () => state, dispatch, requestQuit };
}

describe("createTuiCommandHandler", () => {
  test("handle('/help') clears transient then sets a reply message", () => {
    const { deps, dispatch } = makeDeps();
    const handler: TuiCommandHandler = createTuiCommandHandler(deps);
    handler.handle("/help");
    expect(dispatch).toHaveBeenCalledWith(Actions.clearTransientMessage());
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("/clear")));
  });

  test("handle('/clear') dispatches clearTuiState", () => {
    const { deps, dispatch } = makeDeps();
    const handler = createTuiCommandHandler(deps);
    handler.handle("/clear");
    expect(dispatch).toHaveBeenCalledWith(Actions.clearTransientMessage());
    expect(dispatch).toHaveBeenCalledWith(Actions.clearTuiState());
  });

  test("handle('/exit') calls requestQuit", () => {
    const { deps, requestQuit } = makeDeps();
    const handler = createTuiCommandHandler(deps);
    handler.handle("/exit");
    expect(requestQuit).toHaveBeenCalledTimes(1);
  });

  test("handle('/team') sets a reply message prompting for an id", () => {
    const { deps, dispatch } = makeDeps();
    const handler = createTuiCommandHandler(deps);
    handler.handle("/team");
    expect(dispatch).toHaveBeenCalledWith(Actions.setTransientMessage(expect.stringContaining("/team <id>")));
  });

  test("handle('/nope') sets an error message", () => {
    const { deps, dispatch } = makeDeps();
    const handler = createTuiCommandHandler(deps);
    handler.handle("/nope");
    expect(dispatch).toHaveBeenCalledWith(Actions.setErrorMessage(expect.stringContaining("/nope")));
  });

  test("handle clears transient before each invocation", () => {
    const { deps, dispatch } = makeDeps();
    const handler = createTuiCommandHandler(deps);
    handler.handle("/help");
    expect(dispatch.mock.calls[0]?.[0]).toEqual(Actions.clearTransientMessage());
  });
});

interface DiskWriteHarness {
  deps: CommandHandlerDeps;
  dispatch: ReturnType<typeof vi.fn>;
}

function makeDiskWriteHarness(): DiskWriteHarness {
  let state: TuiState = { ...INITIAL_TUI_STATE, agents: new Map(INITIAL_TUI_STATE.agents) };
  const dispatch = vi.fn((action: Action) => {
    if (action.type === ActionTypes.SET_TRANSIENT_MESSAGE) state = { ...state, transientMessage: action.payload.text };
    else if (action.type === ActionTypes.SET_ERROR_MESSAGE) state = { ...state, errorBanner: action.payload.text };
    else if (action.type === ActionTypes.CLEAR_TRANSIENT_MESSAGE) state = { ...state, transientMessage: null };
    else if (action.type === ActionTypes.CLEAR_ERROR_MESSAGE) state = { ...state, errorBanner: null };
    else if (action.type === ActionTypes.CLEAR_TUI_STATE) state = INITIAL_TUI_STATE;
  });
  const deps: CommandHandlerDeps = {
    getState: () => state,
    dispatch,
    requestQuit: vi.fn(),
    teamRegistry,
    loadTeam,
    authStore,
    settingsStore,
    settingsScope: "global" as Scope,
  };
  return { deps, dispatch };
}

describe("createTuiCommandHandler — /login", () => {
  beforeEach(() => {
    authStore.load.mockReturnValue({});
  });

  test("/login <provider> <apiKey> writes provider to authStore and replies", () => {
    authStore.setProvider.mockReturnValue({ anthropic: { type: "api_key", key: ANTHROPIC_KEY } });
    const { deps, dispatch } = makeDiskWriteHarness();
    const handler = createTuiCommandHandler(deps);
    handler.handle("/login anthropic sk-test-anthropic");

    expect(authStore.setProvider).toHaveBeenCalledWith(
      expect.anything(),
      "anthropic",
      ANTHROPIC_KEY,
    );
    expect(authStore.write).toHaveBeenCalledWith({ anthropic: { type: "api_key", key: ANTHROPIC_KEY } });
    expect(dispatch).toHaveBeenCalledWith(
      Actions.setTransientMessage(expect.stringContaining("logged in to anthropic")),
    );
  });

  test("/login with wrong arity sets an error message and does not write", () => {
    const { deps, dispatch } = makeDiskWriteHarness();
    const handler = createTuiCommandHandler(deps);
    handler.handle("/login anthropic");

    expect(authStore.write).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(
      Actions.setErrorMessage(expect.stringContaining("/login <provider> <apiKey>")),
    );
  });
});

describe("createTuiCommandHandler — /logout", () => {
  test("/logout with no args clears all providers and replies", () => {
    authStore.clear.mockReturnValue({});
    const { deps, dispatch } = makeDiskWriteHarness();
    const handler = createTuiCommandHandler(deps);
    handler.handle("/logout");

    expect(authStore.clear).toHaveBeenCalled();
    expect(authStore.write).toHaveBeenCalledWith({});
    expect(dispatch).toHaveBeenCalledWith(
      Actions.setTransientMessage(expect.stringContaining("logged out of all providers")),
    );
  });

  test("/logout <provider> removes one provider and replies", () => {
    authStore.removeProvider.mockReturnValue({});
    const { deps, dispatch } = makeDiskWriteHarness();
    const handler = createTuiCommandHandler(deps);
    handler.handle("/logout anthropic");

    expect(authStore.removeProvider).toHaveBeenCalledWith(expect.anything(), "anthropic");
    expect(authStore.write).toHaveBeenCalledWith({});
    expect(dispatch).toHaveBeenCalledWith(
      Actions.setTransientMessage(expect.stringContaining("logged out of anthropic")),
    );
  });
});

describe("createTuiCommandHandler — /model", () => {
  beforeEach(() => {
    settingsStore.load.mockReturnValue(SETTINGS_DEFAULT);
  });

  test("/model <provider>/<modelId> validates and writes to settings", () => {
    const { deps, dispatch } = makeDiskWriteHarness();
    const handler = createTuiCommandHandler(deps);
    handler.handle("/model openai/gpt-4o");

    expect(settingsStore.write).toHaveBeenCalledWith(
      { defaultProvider: "openai", defaultModel: "gpt-4o" },
      "global",
    );
    expect(dispatch).toHaveBeenCalledWith(
      Actions.setTransientMessage(expect.stringContaining("default model set to openai/gpt-4o")),
    );
  });

  test("/model without slash sets an error", () => {
    const { deps, dispatch } = makeDiskWriteHarness();
    const handler = createTuiCommandHandler(deps);
    handler.handle("/model just-a-string");

    expect(settingsStore.write).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(
      Actions.setErrorMessage(expect.stringContaining("invalid")),
    );
  });

  test("/model <unknown>/<id> sets an error about unknown provider", () => {
    const { deps, dispatch } = makeDiskWriteHarness();
    const handler = createTuiCommandHandler(deps);
    handler.handle("/model no-such-provider/gpt-4o");

    expect(settingsStore.write).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(
      Actions.setErrorMessage(expect.stringContaining("unknown provider")),
    );
  });

  test("/model with wrong arity sets an error", () => {
    const { deps, dispatch } = makeDiskWriteHarness();
    const handler = createTuiCommandHandler(deps);
    handler.handle("/model");

    expect(settingsStore.write).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(
      Actions.setErrorMessage(expect.stringContaining("/model <provider>/<modelId>")),
    );
  });
});

describe("createTuiCommandHandler — /team", () => {
  beforeEach(() => {
    settingsStore.load.mockReturnValue(SETTINGS_DEFAULT);
  });

  test("/team --unset calls settingsStore.unsetDefaultTeam and replies", () => {
    const { deps, dispatch } = makeDiskWriteHarness();
    const handler = createTuiCommandHandler(deps);
    handler.handle("/team --unset");

    expect(settingsStore.unsetDefaultTeam).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(
      Actions.setTransientMessage(expect.stringContaining("default team unset")),
    );
  });

  test("/team (no args) replies with defaultTeam and installed list", () => {
    settingsStore.load.mockReturnValue({ ...SETTINGS_DEFAULT, defaultTeam: "alpha" });
    teamRegistry.listInstalled.mockReturnValue(["minimal", "alpha", "beta"]);
    const { deps, dispatch } = makeDiskWriteHarness();
    const handler = createTuiCommandHandler(deps);
    handler.handle("/team");

    expect(dispatch).toHaveBeenCalledWith(
      Actions.setTransientMessage(expect.stringMatching(/alpha/)),
    );
    expect(dispatch).toHaveBeenCalledWith(
      Actions.setTransientMessage(expect.stringMatching(/minimal.*alpha.*beta/)),
    );
  });

  test("/team (no args) reports 'unset' when no defaultTeam is configured", () => {
    settingsStore.load.mockReturnValue({});
    teamRegistry.listInstalled.mockReturnValue(["minimal"]);
    const { deps, dispatch } = makeDiskWriteHarness();
    const handler = createTuiCommandHandler(deps);
    handler.handle("/team");

    expect(dispatch).toHaveBeenCalledWith(
      Actions.setTransientMessage(expect.stringContaining("unset")),
    );
  });

  test("/team <id> when team is installed dispatches loadTeam and replies", async () => {
    teamRegistry.isInstalled.mockReturnValue(true);
    const { deps, dispatch } = makeDiskWriteHarness();
    const handler = createTuiCommandHandler(deps);
    handler.handle("/team alpha");

    expect(teamRegistry.isInstalled).toHaveBeenCalledWith("alpha");
    await new Promise((r) => setImmediate(r));
    expect(loadTeam).toHaveBeenCalledWith("alpha");
    expect(dispatch).toHaveBeenCalledWith(
      Actions.setTransientMessage(expect.stringContaining("switching to team 'alpha'")),
    );
  });

  test("/team <id> when team is NOT installed falls through to stub reply", () => {
    teamRegistry.isInstalled.mockReturnValue(false);
    const { deps, dispatch } = makeDiskWriteHarness();
    const handler = createTuiCommandHandler(deps);
    handler.handle("/team ghost");

    expect(loadTeam).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(
      Actions.setTransientMessage(expect.stringContaining("ghost")),
    );
    expect(dispatch).toHaveBeenCalledWith(
      Actions.setTransientMessage(expect.stringContaining("not installed")),
    );
  });
});