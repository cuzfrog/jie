import { visibleWidth } from "@earendil-works/pi-tui";
import { type AgentId, type AgentUiState, type StateStore, type TuiState } from "../state";
import { makeAgentUiState, makeTuiState } from "../test";
import { TeamPanel } from "./team-panel";
import { SPINNER_FRAMES, style } from "./themes";

const LEADER_ID: AgentId = "my-team:general-1";
const WORKER_ID: AgentId = "my-team:coder-1";

const stateStore = vi.mocked<StateStore>({ getState: vi.fn(), dispatch: vi.fn(), subscribe: vi.fn(() => () => undefined) });

describe("TeamPanel", () => {
  beforeEach(() => {
    stateStore.getState.mockReturnValue(makeTuiState());
  });

  test("renders nothing before a team is loaded", () => {
    expect(new TeamPanel(stateStore).render(80)).toEqual([]);
  });

  test("renders nothing when the loaded team has no agents", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ teamId: "my-team" }));
    expect(new TeamPanel(stateStore).render(80)).toEqual([]);
  });

  test("renders nothing while the strip is hidden", () => {
    stateStore.getState.mockReturnValue(teamState({ teamPanelVisible: false }));
    expect(new TeamPanel(stateStore).render(80)).toEqual([]);
  });

  test("renders one row per agent, leader first, with empty columns as dashes", () => {
    stateStore.getState.mockReturnValue(teamState({ focusedAgentId: LEADER_ID }));
    const text = new TeamPanel(stateStore).render(120).map(stripAnsi);
    expect(text).toEqual(["▸ ★ general-1 · general  —  —  —  —", "  coder-1 · coder        —  —  —  —"]);
  });

  test("points at the team cursor while keeping the focused agent key highlighted", () => {
    stateStore.getState.mockReturnValue(teamState({ focusedAgentId: WORKER_ID, teamCursorAgentId: LEADER_ID }));
    const lines = new TeamPanel(stateStore).render(120);
    expect(lines[0]).toContain(style("accent")("▸"));
    expect(lines[0]).toContain(style("accent")("general-1"));
    expect(lines[1]).not.toContain(style("accent")("▸"));
    expect(lines[1]).toContain(style("accent")("coder-1"));
  });

  test("without a cursor the pointer follows the focused agent", () => {
    stateStore.getState.mockReturnValue(teamState({ focusedAgentId: WORKER_ID }));
    const text = new TeamPanel(stateStore).render(120).map(stripAnsi);
    expect(text[0].startsWith("  ★ general-1")).toBe(true);
    expect(text[1].startsWith("▸ coder-1")).toBe(true);
  });

  test("shows no pointer when neither cursor nor focus is set", () => {
    stateStore.getState.mockReturnValue(teamState({ focusedAgentId: null }));
    const text = new TeamPanel(stateStore).render(120).map(stripAnsi);
    expect(text[0].startsWith("  ★ general-1")).toBe(true);
    expect(text[1].startsWith("  coder-1")).toBe(true);
  });

  test("shows tools, subscriptions, model, and context usage columns", () => {
    stateStore.getState.mockReturnValue(teamState({ focusedAgentId: LEADER_ID }, {
      [LEADER_ID]: {
        tools: ["notify", "read_file"],
        subscribe: ["task.recorded"],
        model: { provider: "local", id: "qwen3.5-4b", effort: "medium", contextWindow: 128000 },
        contextTokensUsed: 32000,
      },
    }));
    const row = stripAnsi(new TeamPanel(stateStore).render(160)[0]);
    expect(row).toContain("notify read_file");
    expect(row).toContain("task.recorded");
    expect(row).toContain("qwen3.5-4b");
    expect(row).toContain("25%/128k");
  });

  test("left-aligns columns across rows of differing widths", () => {
    stateStore.getState.mockReturnValue(teamState({ focusedAgentId: LEADER_ID }, {
      [LEADER_ID]: { tools: ["notify"], subscribe: ["task.failed"] },
      [WORKER_ID]: { tools: ["bash", "read_file", "write_file", "edit"], subscribe: ["task.planned"] },
    }));
    const text = new TeamPanel(stateStore).render(160).map(stripAnsi);
    expect(text[0].indexOf("task.failed")).toBe(text[1].indexOf("task.planned"));
  });

  test("shows a spinner frame for a busy agent", () => {
    stateStore.getState.mockReturnValue(teamState({}, { [WORKER_ID]: { status: "busy" } }));
    const row = new TeamPanel(stateStore).render(80)[1];
    const spinnerGlyphs = SPINNER_FRAMES.map((frame) => style("accent")(frame));
    expect(spinnerGlyphs.some((glyph) => row.includes(glyph))).toBe(true);
  });

  test("marks an idle agent whose last stop was an error", () => {
    stateStore.getState.mockReturnValue(teamState({}, { [WORKER_ID]: { lastStopReason: "error" } }));
    expect(new TeamPanel(stateStore).render(80)[1]).toContain(style("error")("✗"));
  });

  test("tags the queue depth when prompts are queued", () => {
    stateStore.getState.mockReturnValue(teamState({}, { [WORKER_ID]: { queue: ["a", "b"] } }));
    expect(stripAnsi(new TeamPanel(stateStore).render(120)[1])).toContain("coder-1 · coder · q2");
  });

  test("truncates every row to the available width", () => {
    stateStore.getState.mockReturnValue(teamState({ focusedAgentId: LEADER_ID }));
    for (const width of [1, 6, 12, 80]) {
      for (const line of new TeamPanel(stateStore).render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});

function teamState(overrides: Partial<TuiState> = {}, agentOverrides: Partial<Record<AgentId, Partial<AgentUiState>>> = {}): TuiState {
  const leader = makeAgentUiState(LEADER_ID, { isLeader: true, role: "general", ...agentOverrides[LEADER_ID] });
  const worker = makeAgentUiState(WORKER_ID, { role: "coder", ...agentOverrides[WORKER_ID] });
  const agents = new Map<AgentId, AgentUiState>([[WORKER_ID, worker], [LEADER_ID, leader]]);
  return makeTuiState({ teamId: "my-team", leaderAgentId: LEADER_ID, agents, teamPanelVisible: true, ...overrides });
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
