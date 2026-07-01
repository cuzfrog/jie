import { Loader, Text } from "@earendil-works/pi-tui";
import { createTestTui } from "../test";
import {
  StatusBar,
  _statusBarContextFromStateForTest,
  type StatusBarContext,
  type StatusBarModel,
} from "./status-bar";
import type { AgentUiState, TuiState } from "../state";

function makeModel(overrides: Partial<StatusBarModel> = {}): StatusBarModel {
  return {
    cwd: "/home/cuz/workspace/jie",
    branch: "main",
    provider: "openai",
    modelId: "gpt-4",
    effort: "high",
    ...overrides,
  };
}

function makeContext(overrides: Partial<StatusBarContext> = {}): StatusBarContext {
  return {
    focusedStatus: "idle",
    focusedAgentKey: "general-1",
    teamId: "default",
    showRail: false,
    ...overrides,
  };
}

describe("StatusBar", () => {
  test("setModel updates cwdLine and hintLine text", () => {
    const tui = createTestTui();
    const bar = new StatusBar(tui);
    bar.setModel(makeModel(), makeContext());
    const rendered = bar.render(120);
    const flat = rendered.join("\n");
    expect(flat).toContain("/home/cuz/workspace/jie (main)");
    expect(flat).toContain("default:general-1");
  });

  test("renders three children when focused agent is busy (text + hint + loader)", () => {
    const tui = createTestTui();
    const bar = new StatusBar(tui);
    bar.setModel(makeModel(), makeContext({ focusedStatus: "busy" }));
    expect(bar.children.length).toBe(3);
    const kinds = bar.children.map((c) => c.constructor.name);
    expect(kinds).toEqual([Text.name, Text.name, Loader.name]);
  });

  test("renders two children when focused agent is idle (no loader)", () => {
    const tui = createTestTui();
    const bar = new StatusBar(tui);
    bar.setModel(makeModel(), makeContext({ focusedStatus: "idle" }));
    expect(bar.children.length).toBe(2);
    const kinds = bar.children.map((c) => c.constructor.name);
    expect(kinds).toEqual([Text.name, Text.name]);
  });

  test("renders two children when no focused agent", () => {
    const tui = createTestTui();
    const bar = new StatusBar(tui);
    bar.setModel(makeModel(), makeContext({ focusedStatus: null, focusedAgentKey: null }));
    expect(bar.children.length).toBe(2);
  });

  test("switches loader on when status changes idle → busy", () => {
    const tui = createTestTui();
    const bar = new StatusBar(tui);
    bar.setModel(makeModel(), makeContext({ focusedStatus: "idle" }));
    expect(bar.children.length).toBe(2);
    bar.setModel(makeModel(), makeContext({ focusedStatus: "busy" }));
    expect(bar.children.length).toBe(3);
    expect(bar.children[2]).toBeInstanceOf(Loader);
  });

  test("removes loader on busy → idle", () => {
    const tui = createTestTui();
    const bar = new StatusBar(tui);
    bar.setModel(makeModel(), makeContext({ focusedStatus: "busy" }));
    expect(bar.children.length).toBe(3);
    bar.setModel(makeModel(), makeContext({ focusedStatus: "idle" }));
    expect(bar.children.length).toBe(2);
  });

  test("hint text reflects rail visibility", () => {
    const tui = createTestTui();
    const bar = new StatusBar(tui);
    bar.setModel(makeModel(), makeContext({ showRail: false }));
    expect(bar.render(120).join("\n")).toContain("ctrl+left for agents");
    bar.setModel(makeModel(), makeContext({ showRail: true }));
    expect(bar.render(120).join("\n")).toContain("ctrl+left close agents");
  });

  test("model text shows em-dash when provider or modelId is empty", () => {
    const tui = createTestTui();
    const bar = new StatusBar(tui);
    bar.setModel(makeModel({ provider: "", modelId: "" }), makeContext());
    expect(bar.render(120).join("\n")).toContain("—");
  });

  test("model text omits effort when empty", () => {
    const tui = createTestTui();
    const bar = new StatusBar(tui);
    bar.setModel(makeModel({ effort: "" }), makeContext());
    const flat = bar.render(120).join("\n");
    expect(flat).toContain("(openai) gpt-4");
    expect(flat).not.toContain("|");
  });

  test("render delegates to container and does not mutate children", () => {
    const tui = createTestTui();
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
      model: null,
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
    };
    expect(_statusBarContextFromStateForTest(state)).toEqual({
      focusedStatus: "busy",
      focusedAgentKey: "general-1",
      teamId: "default",
      showRail: true,
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
    };
    expect(_statusBarContextFromStateForTest(state)).toEqual({
      focusedStatus: null,
      focusedAgentKey: null,
      teamId: null,
      showRail: false,
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
    };
    expect(_statusBarContextFromStateForTest(state).showRail).toBe(false);
  });
});
