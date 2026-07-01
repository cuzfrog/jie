import { createTestTuiWithTerminal } from "../../../tests/support";
import {
  StatusBar,
  _statusBarContextFromState,
  type StatusBarContext,
  type StatusBarModel,
} from "./status-bar";
import type { AgentUiState, TuiState } from "../state";

function makeModel(overrides: Partial<StatusBarModel> = {}): StatusBarModel {
  return {
    cwd: "/home/cuz/workspace/jie",
    git: { branch: "main", dirty: false, ahead: 0, behind: 0 },
    ...overrides,
  };
}

function makeContext(overrides: Partial<StatusBarContext> = {}): StatusBarContext {
  return {
    focusedStatus: "idle",
    focusedAgentKey: "general-1",
    teamId: "default",
    showRail: false,
    focusedModel: { provider: "openai", id: "gpt-4", effort: "high" },
    ...overrides,
  };
}

describe("StatusBar", () => {
  test("setModel updates cwdLine and hintLine text", () => {
    const { tui } = createTestTuiWithTerminal();
    const bar = new StatusBar(tui);
    bar.setModel(makeModel(), makeContext());
    const rendered = bar.render(120);
    const flat = rendered.join("\n");
    expect(flat).toContain("/home/cuz/workspace/jie (main)");
    expect(flat).toContain("default:general-1");
  });

  test("renders the loader glyph when focused agent is busy", () => {
    const { tui } = createTestTuiWithTerminal();
    const bar = new StatusBar(tui);
    bar.setModel(makeModel(), makeContext({ focusedStatus: "busy" }));
    expect(bar.children.length).toBe(3);
    expect(bar.render(120).join("\n")).toContain("…");
  });

  test("omits the loader glyph when focused agent is idle", () => {
    const { tui } = createTestTuiWithTerminal();
    const bar = new StatusBar(tui);
    bar.setModel(makeModel(), makeContext({ focusedStatus: "idle" }));
    expect(bar.children.length).toBe(2);
    expect(bar.render(120).join("\n")).not.toContain("…");
  });

  test("renders two children when no focused agent", () => {
    const { tui } = createTestTuiWithTerminal();
    const bar = new StatusBar(tui);
    bar.setModel(makeModel(), makeContext({ focusedStatus: null, focusedAgentKey: null }));
    expect(bar.children.length).toBe(2);
  });

  test("switches loader on when status changes idle → busy", () => {
    const { tui } = createTestTuiWithTerminal();
    const bar = new StatusBar(tui);
    bar.setModel(makeModel(), makeContext({ focusedStatus: "idle" }));
    expect(bar.children.length).toBe(2);
    expect(bar.render(120).join("\n")).not.toContain("…");
    bar.setModel(makeModel(), makeContext({ focusedStatus: "busy" }));
    expect(bar.children.length).toBe(3);
    expect(bar.render(120).join("\n")).toContain("…");
  });

  test("removes loader on busy → idle", () => {
    const { tui } = createTestTuiWithTerminal();
    const bar = new StatusBar(tui);
    bar.setModel(makeModel(), makeContext({ focusedStatus: "busy" }));
    expect(bar.children.length).toBe(3);
    expect(bar.render(120).join("\n")).toContain("…");
    bar.setModel(makeModel(), makeContext({ focusedStatus: "idle" }));
    expect(bar.children.length).toBe(2);
    expect(bar.render(120).join("\n")).not.toContain("…");
  });

  test("hint text reflects rail visibility", () => {
    const { tui } = createTestTuiWithTerminal();
    const bar = new StatusBar(tui);
    bar.setModel(makeModel(), makeContext({ showRail: false }));
    expect(bar.render(120).join("\n")).toContain("ctrl+left for agents");
    bar.setModel(makeModel(), makeContext({ showRail: true }));
    expect(bar.render(120).join("\n")).toContain("ctrl+left close agents");
  });

  test("model text shows em-dash when focusedModel is null", () => {
    const { tui } = createTestTuiWithTerminal();
    const bar = new StatusBar(tui);
    bar.setModel(makeModel(), makeContext({ focusedModel: null }));
    expect(bar.render(120).join("\n")).toContain("—");
  });

  test("model text shows provider, model id, and effort", () => {
    const { tui } = createTestTuiWithTerminal();
    const bar = new StatusBar(tui);
    bar.setModel(makeModel(), makeContext({ focusedModel: { provider: "openai", id: "gpt-4", effort: "high" } }));
    const flat = bar.render(120).join("\n");
    expect(flat).toContain("(openai) gpt-4");
    expect(flat).toContain("| high");
  });

  test("render delegates to container and does not mutate children", () => {
    const { tui } = createTestTuiWithTerminal();
    const bar = new StatusBar(tui);
    bar.setModel(makeModel(), makeContext({ focusedStatus: "busy" }));
    const before = bar.children.length;
    const lines = bar.render(120);
    expect(lines.length).toBeGreaterThan(0);
    expect(bar.children.length).toBe(before);
  });
});

describe("statusBarContextFromState", () => {
  test("extracts focused agent status and key", () => {
    const agent: AgentUiState = {
      agentId: "default:general-1",
      teamId: "default",
      agentKey: "general-1",
      role: "general",
      isLeader: true,
      status: "busy",
      model: { provider: "openai", id: "gpt-4", effort: "high" },
      history: [],
      currentTurn: null,
      lastStopReason: null,
    };
    const state: TuiState = {
      teamId: "default",
      leaderAgentId: "default:general-1",
      agents: new Map([["default:general-1", agent]]),
      focusedAgentId: "default:general-1",
      transientMessage: null,
      errorBanner: null,
      showTeamRailPanel: true,
      pendingQuit: false,
    };
    expect(_statusBarContextFromState(state)).toEqual({
      focusedStatus: "busy",
      focusedAgentKey: "general-1",
      teamId: "default",
      showRail: true,
      focusedModel: { provider: "openai", id: "gpt-4", effort: "high" },
    });
  });

  test("returns nulls when no focused agent", () => {
    const state: TuiState = {
      teamId: null,
      leaderAgentId: null,
      agents: new Map(),
      focusedAgentId: null,
      transientMessage: null,
      errorBanner: null,
      showTeamRailPanel: false,
      pendingQuit: false,
    };
    expect(_statusBarContextFromState(state)).toEqual({
      focusedStatus: null,
      focusedAgentKey: null,
      teamId: null,
      showRail: false,
      focusedModel: null,
    });
  });

  test("reflects showTeamRailPanel flag", () => {
    const state: TuiState = {
      teamId: "t1",
      leaderAgentId: null,
      agents: new Map(),
      focusedAgentId: null,
      transientMessage: null,
      errorBanner: null,
      showTeamRailPanel: false,
      pendingQuit: false,
    };
    expect(_statusBarContextFromState(state).showRail).toBe(false);
  });
});
