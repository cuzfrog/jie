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

  test("draws a border line and dim column titles above one row per agent", () => {
    stateStore.getState.mockReturnValue(teamState({ focusedAgentId: LEADER_ID }));
    const lines = new TeamPanel(stateStore).render(120);
    expect(lines[0]).toBe(style("borderMuted")("─".repeat(120)));
    for (const title of ["agent", "ctx", "tools", "subscribe", "model"]) expect(lines[1]).toContain(style("dim")(title));
    expect(lines.length).toBe(4);
    expect(stripAnsi(lines[2]).startsWith("▸ general-1 leader")).toBe(true);
    expect(stripAnsi(lines[3]).startsWith("  coder-1")).toBe(true);
  });

  test("identifies the leader with a dim label instead of a mark, and drops the role from the identity", () => {
    stateStore.getState.mockReturnValue(teamState({ focusedAgentId: LEADER_ID }));
    const text = new TeamPanel(stateStore).render(120);
    expect(text[2]).toContain(style("dim")("leader"));
    expect(stripAnsi(text[2])).toContain("general-1 leader ·");
    for (const line of text.map(stripAnsi)) expect(line).not.toContain("★");
    expect(stripAnsi(text[2])).not.toContain("· general");
    expect(stripAnsi(text[3])).not.toContain("· coder");
    expect(stripAnsi(text[3]).startsWith("  coder-1")).toBe(true);
  });

  test("points at the team cursor while keeping the focused agent key highlighted", () => {
    stateStore.getState.mockReturnValue(teamState({ focusedAgentId: WORKER_ID, teamCursorAgentId: LEADER_ID }));
    const lines = new TeamPanel(stateStore).render(120);
    expect(lines[2]).toContain(style("accent")("▸"));
    expect(lines[2]).toContain(style("accent")("general-1"));
    expect(lines[3]).not.toContain(style("accent")("▸"));
    expect(lines[3]).toContain(style("accent")("coder-1"));
  });

  test("without a cursor the pointer follows the focused agent", () => {
    stateStore.getState.mockReturnValue(teamState({ focusedAgentId: WORKER_ID }));
    const text = new TeamPanel(stateStore).render(120).map(stripAnsi);
    expect(text[2].startsWith("  general-1 leader")).toBe(true);
    expect(text[3].startsWith("▸ coder-1")).toBe(true);
  });

  test("shows no pointer when neither cursor nor focus is set", () => {
    stateStore.getState.mockReturnValue(teamState({ focusedAgentId: null }));
    const text = new TeamPanel(stateStore).render(120).map(stripAnsi);
    expect(text[2].startsWith("  general-1 leader")).toBe(true);
    expect(text[3].startsWith("  coder-1")).toBe(true);
  });

  test("shows context right after the key, then tools, subscriptions, and the full model segment", () => {
    stateStore.getState.mockReturnValue(teamState({ focusedAgentId: LEADER_ID }, {
      [LEADER_ID]: {
        tools: ["notify", "read_file"],
        subscribe: ["task.recorded"],
        model: { provider: "local", id: "qwen3.5-4b", effort: "medium", contextWindow: 128000 },
        contextTokensUsed: 32000,
      },
    }));
    const row = stripAnsi(new TeamPanel(stateStore).render(160)[2]);
    expect(row).toContain("25%/128k");
    expect(row).toContain("notify read_file");
    expect(row).toContain("task.recorded");
    expect(row.trimEnd().endsWith("(local) qwen3.5-4b | medium")).toBe(true);
    expect(row.indexOf("25%/128k")).toBeLessThan(row.indexOf("notify read_file"));
    expect(row.indexOf("notify read_file")).toBeLessThan(row.indexOf("task.recorded"));
  });

  test("right-aligns the model column at the screen edge and pads every line to the full width", () => {
    stateStore.getState.mockReturnValue(teamState({ focusedAgentId: LEADER_ID }, {
      [LEADER_ID]: { model: { provider: "local", id: "qwen3.5-4b", effort: "medium", contextWindow: 128000 } },
    }));
    const lines = new TeamPanel(stateStore).render(160);
    for (const line of lines) expect(visibleWidth(line)).toBe(160);
    expect(stripAnsi(lines[1]).trimEnd().endsWith("model")).toBe(true);
    expect(stripAnsi(lines[2]).trimEnd().endsWith("(local) qwen3.5-4b | medium")).toBe(true);
    expect(stripAnsi(lines[3]).trimEnd().endsWith("—")).toBe(true);
  });

  test("left-aligns the middle columns across rows of differing widths", () => {
    stateStore.getState.mockReturnValue(teamState({ focusedAgentId: LEADER_ID }, {
      [LEADER_ID]: { tools: ["notify"], subscribe: ["task.failed"] },
      [WORKER_ID]: { tools: ["bash", "read_file", "write_file", "edit"], subscribe: ["task.planned"] },
    }));
    const text = new TeamPanel(stateStore).render(160).map(stripAnsi);
    expect(text[2].indexOf("task.failed")).toBe(text[3].indexOf("task.planned"));
  });

  test("drops the middle columns right to left when the width does not fit them all", () => {
    stateStore.getState.mockReturnValue(teamState({ focusedAgentId: LEADER_ID }, {
      [LEADER_ID]: {
        tools: ["alpha", "beta", "gamma"],
        subscribe: ["task.review_passed", "task.failed"],
        model: { provider: "provider", id: "model-identifier", effort: "medium", contextWindow: 128000 },
        contextTokensUsed: 32000,
      },
    }));
    const panel = new TeamPanel(stateStore);
    const wide = stripAnsi(panel.render(100)[2]);
    expect(wide).toContain("25%/128k");
    expect(wide).toContain("alpha beta gamma");
    expect(wide).not.toContain("task.review_passed");
    const medium = stripAnsi(panel.render(70)[2]);
    expect(medium).toContain("25%/128k");
    expect(medium).not.toContain("alpha");
    const narrow = stripAnsi(panel.render(60)[2]);
    expect(narrow).not.toContain("25%/128k");
    expect(narrow).toContain("general-1 leader");
    expect(narrow).toContain("| medium");
  });

  test("keeps the identity and a truncated model when even those exceed the width", () => {
    stateStore.getState.mockReturnValue(teamState({ focusedAgentId: LEADER_ID }, {
      [LEADER_ID]: { model: { provider: "provider", id: "model-identifier", effort: "medium", contextWindow: 128000 } },
    }));
    const row = stripAnsi(new TeamPanel(stateStore).render(40)[2]);
    expect(visibleWidth(row)).toBeLessThanOrEqual(40);
    expect(row.startsWith("▸ general-1 leader")).toBe(true);
  });

  test("shows a spinner frame for a busy agent", () => {
    stateStore.getState.mockReturnValue(teamState({}, { [WORKER_ID]: { status: "busy" } }));
    const row = new TeamPanel(stateStore).render(80)[3];
    const spinnerGlyphs = SPINNER_FRAMES.map((frame) => style("accent")(frame));
    expect(spinnerGlyphs.some((glyph) => row.includes(glyph))).toBe(true);
  });

  test("marks an idle agent whose last stop was an error", () => {
    stateStore.getState.mockReturnValue(teamState({}, { [WORKER_ID]: { lastStopReason: "error" } }));
    expect(new TeamPanel(stateStore).render(80)[3]).toContain(style("error")("✗"));
  });

  test("tags the queue depth when prompts are queued", () => {
    stateStore.getState.mockReturnValue(teamState({}, { [WORKER_ID]: { queue: ["a", "b"] } }));
    expect(stripAnsi(new TeamPanel(stateStore).render(120)[3])).toContain("coder-1 · q2");
  });

  test("truncates every line to the available width", () => {
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
