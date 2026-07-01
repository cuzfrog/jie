import {
  createTuiCommandHandler,
  runCommand,
  type CommandHandlerDeps,
  type TuiCommandHandler,
} from "./command-handler";
import { Actions, ActionTypes, INITIAL_TUI_STATE, type Action, type TuiState } from "./state";

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