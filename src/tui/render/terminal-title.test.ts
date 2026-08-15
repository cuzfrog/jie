import type { QuestionItem } from "../../platform";
import { Actions, type StateStore, type TuiState } from "../state";
import { makeAgentUiState, makeTuiState } from "../test";
import type { Terminal } from "@earendil-works/pi-tui";
import { TerminalTitleImpl, _buildTerminalTitle } from "./terminal-title";

const QUESTIONS: QuestionItem[] = [];

class StubTerminal implements Terminal {
  columns = 80;
  rows = 24;
  setTitle = vi.fn();
  setProgress = vi.fn();
  write = vi.fn();
  start(): void {}
  stop(): void {}
  drainInput(): Promise<void> { return Promise.resolve(); }
  get kittyProtocolActive(): boolean { return false; }
  moveBy(): void {}
  hideCursor(): void {}
  showCursor(): void {}
  clearLine(): void {}
  clearFromCursor(): void {}
  clearScreen(): void {}
}

const state: TuiState = makeTuiState({});
const stateStore = vi.mocked<StateStore>({
  getState: vi.fn(() => state),
  dispatch: vi.fn(),
  subscribe: vi.fn(() => () => undefined),
});

describe("_buildTerminalTitle", () => {
  test("uses the idle dot when the TUI is not busy", () => {
    const state = makeTuiState({});
    expect(_buildTerminalTitle(state, 0)).toBe(`${"●"}jie`);
  });

  test("uses a spinner frame when the TUI is busy", () => {
    const state = makeTuiState({
      agents: new Map([
        ["my-team:general-1", makeAgentUiState("my-team:general-1", { isLeader: true, status: "busy" })],
      ]),
      focusedAgentId: "my-team:general-1",
      leaderAgentId: "my-team:general-1",
    });
    expect(_buildTerminalTitle(state, 1)).toBe(`${"◓"}jie`);
  });

  test("appends cwd when present", () => {
    expect(_buildTerminalTitle(makeTuiState({ cwd: "/tmp" }), 0)).toBe(`${"●"}jie - /tmp`);
  });

  test("uses a bell when the focused agent is idle after a ringable stop", () => {
    const state = makeTuiState({
      agents: new Map([
        ["my-team:general-1", makeAgentUiState("my-team:general-1", { isLeader: true, status: "idle", lastStopReason: "stop" })],
      ]),
      focusedAgentId: "my-team:general-1",
      leaderAgentId: "my-team:general-1",
      requireUserAttention: true,
    });
    expect(_buildTerminalTitle(state, 0)).toBe(`${"🔔"}jie`);
  });

  test("reverts the bell to a spinner when another agent is busy", () => {
    const state = makeTuiState({
      agents: new Map([
        ["my-team:general-1", makeAgentUiState("my-team:general-1", { isLeader: true, status: "idle", lastStopReason: "stop" })],
        ["my-team:worker-1", makeAgentUiState("my-team:worker-1", { status: "busy" })],
      ]),
      focusedAgentId: "my-team:general-1",
      leaderAgentId: "my-team:general-1",
      requireUserAttention: true,
    });
    expect(_buildTerminalTitle(state, 1)).toBe(`${"◓"}jie`);
  });

  test("uses a hand when a question is pending", () => {
    const state = makeTuiState({
      agents: new Map([
        ["my-team:general-1", makeAgentUiState("my-team:general-1", { isLeader: true, status: "busy" })],
      ]),
      focusedAgentId: "my-team:general-1",
      leaderAgentId: "my-team:general-1",
      question: {
        requestId: "req-1",
        agentId: "my-team:general-1",
        questions: QUESTIONS,
        questionIndex: 0,
        optionCursor: 0,
        selections: [],
        otherText: [],
        editingOther: false,
      },
    });
    expect(_buildTerminalTitle(state, 0)).toBe(`${"✋"}jie`);
  });

  test("keeps the hand even when the focused agent is idle after a ringable stop", () => {
    const state = makeTuiState({
      agents: new Map([
        ["my-team:general-1", makeAgentUiState("my-team:general-1", { isLeader: true, status: "idle", lastStopReason: "stop" })],
      ]),
      focusedAgentId: "my-team:general-1",
      leaderAgentId: "my-team:general-1",
      question: {
        requestId: "req-1",
        agentId: "my-team:general-1",
        questions: QUESTIONS,
        questionIndex: 0,
        optionCursor: 0,
        selections: [],
        otherText: [],
        editingOther: false,
      },
    });
    expect(_buildTerminalTitle(state, 0)).toBe(`${"✋"}jie`);
  });

  test("reverts the bell to a dot when the terminal is focused", () => {
    const state = makeTuiState({
      agents: new Map([
        ["my-team:general-1", makeAgentUiState("my-team:general-1", { isLeader: true, status: "idle", lastStopReason: "stop" })],
      ]),
      focusedAgentId: "my-team:general-1",
      leaderAgentId: "my-team:general-1",
      terminalFocused: true,
      requireUserAttention: false,
    });
    expect(_buildTerminalTitle(state, 0)).toBe(`${"●"}jie`);
  });

  test("reverts the hand to a dot when the terminal is focused", () => {
    const state = makeTuiState({
      agents: new Map([
        ["my-team:general-1", makeAgentUiState("my-team:general-1", { isLeader: true, status: "idle" })],
      ]),
      focusedAgentId: "my-team:general-1",
      leaderAgentId: "my-team:general-1",
      terminalFocused: true,
      question: {
        requestId: "req-1",
        agentId: "my-team:general-1",
        questions: QUESTIONS,
        questionIndex: 0,
        optionCursor: 0,
        selections: [],
        otherText: [],
        editingOther: false,
      },
    });
    expect(_buildTerminalTitle(state, 0)).toBe(`${"●"}jie`);
  });

  test("does not re-show the bell when the terminal loses focus after the user has focused", () => {
    const state = makeTuiState({
      agents: new Map([
        ["my-team:general-1", makeAgentUiState("my-team:general-1", { isLeader: true, status: "idle", lastStopReason: "stop" })],
      ]),
      focusedAgentId: "my-team:general-1",
      leaderAgentId: "my-team:general-1",
      terminalFocused: false,
      requireUserAttention: false,
    });
    expect(_buildTerminalTitle(state, 0)).toBe(`${"●"}jie`);
  });
});

describe("TerminalTitleImpl", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("initialize writes the title immediately", () => {
    const terminal = new StubTerminal();
    const title = new TerminalTitleImpl(terminal, stateStore, 100);
    title.initialize();
    expect(terminal.setTitle).toHaveBeenCalledTimes(1);
    title.dispose();
  });

  test("advances the spinner frame on each interval tick", () => {
    const terminal = new StubTerminal();
    const title = new TerminalTitleImpl(terminal, stateStore, 100);
    title.initialize();
    expect(terminal.setTitle).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    expect(terminal.setTitle).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(100);
    expect(terminal.setTitle).toHaveBeenCalledTimes(3);
    title.dispose();
  });

  test("dispose cancels the interval", () => {
    const terminal = new StubTerminal();
    const title = new TerminalTitleImpl(terminal, stateStore, 100);
    title.initialize();
    title.dispose();
    vi.advanceTimersByTime(200);
    expect(terminal.setTitle).toHaveBeenCalledTimes(1);
  });

  test("initialize enables and disable disables focus reporting", () => {
    const terminal = new StubTerminal();
    const title = new TerminalTitleImpl(terminal, stateStore, 100);
    title.initialize();
    expect(terminal.write).toHaveBeenCalledWith("\x1b[?1004h");
    title.dispose();
    expect(terminal.write).toHaveBeenCalledWith("\x1b[?1004l");
  });

  test("subscribes to the state store and updates the title when state changes", () => {
    const terminal = new StubTerminal();
    const store = vi.mocked<StateStore>({
      getState: vi.fn(() => makeTuiState({})),
      dispatch: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
    });
    const title = new TerminalTitleImpl(terminal, store, 100);
    title.initialize();
    expect(store.subscribe).toHaveBeenCalledTimes(1);
    const listener = store.subscribe.mock.calls[0]![0];
    store.getState.mockReturnValue(makeTuiState({
      agents: new Map([
        ["my-team:general-1", makeAgentUiState("my-team:general-1", { isLeader: true, status: "busy" })],
      ]),
      focusedAgentId: "my-team:general-1",
      leaderAgentId: "my-team:general-1",
    }));
    void listener(Actions.terminalFocusGained(), store.getState(), makeTuiState({}));
    expect(terminal.setTitle).toHaveBeenLastCalledWith(`${"◐"}jie`);
    title.dispose();
  });
});
