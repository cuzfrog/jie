import { visibleWidth } from "@earendil-works/pi-tui";
import { type StateStore } from "../../state";
import { makeAgentUiState, makeTuiState } from "../../test";
import { WorkingSpinner, _spinnerFrame } from "./working-spinner";

const AGENT_ID = "demo:general-1";
const ANOTHER_AGENT_ID = "demo:helper-1";

const stateStore = vi.mocked<StateStore>({
  getState: vi.fn(),
  dispatch: vi.fn(),
  subscribe: vi.fn(() => () => undefined),
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("_spinnerFrame", () => {
  test("advances one frame per interval and wraps around", () => {
    expect(_spinnerFrame(0, 80)).toBe("⠋");
    expect(_spinnerFrame(80, 80)).toBe("⠙");
    expect(_spinnerFrame(160, 80)).toBe("⠹");
    expect(_spinnerFrame(800, 80)).toBe("⠋");
  });

  test("uses a slower interval for the team spinner", () => {
    expect(_spinnerFrame(0, 1000)).toBe("⠋");
    expect(_spinnerFrame(1000, 1000)).toBe("⠙");
    expect(_spinnerFrame(9000, 1000)).toBe("⠏");
    expect(_spinnerFrame(10000, 1000)).toBe("⠋");
  });
});

describe("WorkingSpinner.update", () => {
  test("reports dirty when the focused agent becomes busy", () => {
    stateStore.getState.mockReturnValue(makeTuiState({
      focusedAgentId: AGENT_ID,
      agents: new Map([[AGENT_ID, makeAgentUiState(AGENT_ID, { status: "busy" })]]),
    }));
    expect(new WorkingSpinner(stateStore).update()).toBe(true);
  });

  test("reports dirty when the working kind changes to team", () => {
    stateStore.getState.mockReturnValue(makeTuiState({
      focusedAgentId: AGENT_ID,
      agents: new Map([[AGENT_ID, makeAgentUiState(AGENT_ID, { status: "busy" })]]),
    }));
    const spinner = new WorkingSpinner(stateStore);
    spinner.update();

    stateStore.getState.mockReturnValue(makeTuiState({
      focusedAgentId: AGENT_ID,
      agents: new Map([[ANOTHER_AGENT_ID, makeAgentUiState(ANOTHER_AGENT_ID, { status: "busy" })]]),
    }));
    expect(spinner.update()).toBe(true);
  });

  test("reports dirty when the spinner clears after working", () => {
    stateStore.getState.mockReturnValue(makeTuiState({
      focusedAgentId: AGENT_ID,
      agents: new Map([[AGENT_ID, makeAgentUiState(AGENT_ID, { status: "busy" })]]),
    }));
    const spinner = new WorkingSpinner(stateStore);
    spinner.update();

    stateStore.getState.mockReturnValue(makeTuiState({}));
    expect(spinner.update()).toBe(true);
  });

  test("reports dirty when interrupted with no active work", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ interruptedAgentId: AGENT_ID }));
    expect(new WorkingSpinner(stateStore).update()).toBe(true);
  });

  test("reports clean when the working kind is unchanged", () => {
    const busy = makeTuiState({
      focusedAgentId: AGENT_ID,
      agents: new Map([[AGENT_ID, makeAgentUiState(AGENT_ID, { status: "busy" })]]),
    });
    stateStore.getState.mockReturnValue(busy);
    const spinner = new WorkingSpinner(stateStore);
    spinner.update();
    expect(spinner.update()).toBe(false);
  });
});

describe("WorkingSpinner.render", () => {
  test("renders nothing when no agent is working", () => {
    stateStore.getState.mockReturnValue(makeTuiState({}));
    expect(new WorkingSpinner(stateStore).render(80)).toEqual([]);
  });

  test("renders the focused spinner with a frame, label and elapsed time", () => {
    stateStore.getState.mockReturnValue(makeTuiState({
      focusedAgentId: AGENT_ID,
      agents: new Map([[AGENT_ID, makeAgentUiState(AGENT_ID, { status: "busy" })]]),
    }));
    vi.spyOn(Date, "now").mockReturnValue(0);
    const spinner = new WorkingSpinner(stateStore);
    spinner.update();
    expect(spinner.render(80)).toEqual(["", "\x1b[36m⠋\x1b[39m \x1b[90mWorking… (0.0s)\x1b[39m"]);
  });

  test("renders the team spinner with a slower frame interval and elapsed time", () => {
    stateStore.getState.mockReturnValue(makeTuiState({
      focusedAgentId: AGENT_ID,
      agents: new Map([[ANOTHER_AGENT_ID, makeAgentUiState(ANOTHER_AGENT_ID, { status: "busy" })]]),
    }));
    vi.spyOn(Date, "now").mockReturnValue(0);
    const spinner = new WorkingSpinner(stateStore);
    spinner.update();
    expect(spinner.render(80)).toEqual(["", "\x1b[36m⠋\x1b[39m \x1b[90mTeam working… (0.0s)\x1b[39m"]);
  });

  test("shows the elapsed time since the working state began", () => {
    stateStore.getState.mockReturnValue(makeTuiState({
      focusedAgentId: AGENT_ID,
      agents: new Map([[AGENT_ID, makeAgentUiState(AGENT_ID, { status: "busy" })]]),
    }));
    const spy = vi.spyOn(Date, "now").mockReturnValue(0);
    const spinner = new WorkingSpinner(stateStore);
    spinner.update();
    spy.mockReturnValue(800);
    expect(spinner.render(80)).toEqual(["", "\x1b[36m⠋\x1b[39m \x1b[90mWorking… (0.8s)\x1b[39m"]);
  });

  test("renders the interrupted label", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ interruptedAgentId: AGENT_ID }));
    const spinner = new WorkingSpinner(stateStore);
    spinner.update();
    expect(spinner.render(80)).toEqual(["", "\x1b[90mInterrupted\x1b[39m"]);
  });

  test("recomputes the mode on render without requiring a prior update", () => {
    stateStore.getState.mockReturnValue(makeTuiState({
      focusedAgentId: AGENT_ID,
      agents: new Map([[AGENT_ID, makeAgentUiState(AGENT_ID, { status: "busy" })]]),
    }));
    vi.spyOn(Date, "now").mockReturnValue(0);
    expect(new WorkingSpinner(stateStore).render(80)).toEqual(["", "\x1b[36m⠋\x1b[39m \x1b[90mWorking… (0.0s)\x1b[39m"]);
  });

  test("never renders a line wider than the given width", () => {
    stateStore.getState.mockReturnValue(makeTuiState({
      focusedAgentId: AGENT_ID,
      agents: new Map([[AGENT_ID, makeAgentUiState(AGENT_ID, { status: "busy" })]]),
    }));
    vi.spyOn(Date, "now").mockReturnValue(0);
    const spinner = new WorkingSpinner(stateStore);
    spinner.update();
    for (const width of [10, 13, 40, 80, 139]) {
      for (const line of spinner.render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});
