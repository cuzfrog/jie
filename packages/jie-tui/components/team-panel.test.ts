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
    expect(new TeamPanel(stateStore).render(24)).toEqual([]);
  });

  test("renders nothing when the loaded team has no agents", () => {
    stateStore.getState.mockReturnValue(makeTuiState({ teamId: "my-team" }));
    expect(new TeamPanel(stateStore).render(24)).toEqual([]);
  });

  test("pins the leader first and marks it, regardless of map order", () => {
    stateStore.getState.mockReturnValue(teamState({ leaderAgentId: LEADER_ID, focusedAgentId: LEADER_ID }));
    const text = new TeamPanel(stateStore).render(24).map(stripAnsi);
    expect(text).toEqual(["★ general-1", "  · general", "  coder-1", "  · coder"]);
  });

  test("colors the focused agent key with the accent color", () => {
    stateStore.getState.mockReturnValue(teamState({ focusedAgentId: WORKER_ID }));
    const lines = new TeamPanel(stateStore).render(24);
    expect(lines[2]).toContain(style("accent")("coder-1"));
    stateStore.getState.mockReturnValue(teamState({ focusedAgentId: null }));
    expect(new TeamPanel(stateStore).render(24)[2]).not.toContain(style("accent")("coder-1"));
  });

  test("shows a spinner frame for a busy agent", () => {
    stateStore.getState.mockReturnValue(teamState({}, { [WORKER_ID]: { status: "busy" } }));
    const row = new TeamPanel(stateStore).render(24)[3];
    const spinnerGlyphs = SPINNER_FRAMES.map((frame) => style("accent")(frame));
    expect(spinnerGlyphs.some((glyph) => row.includes(glyph))).toBe(true);
  });

  test("marks an idle agent whose last stop was an error", () => {
    stateStore.getState.mockReturnValue(teamState({}, { [WORKER_ID]: { lastStopReason: "error" } }));
    const row = new TeamPanel(stateStore).render(24)[3];
    expect(row).toContain(style("error")("✗"));
  });

  test("tags the queue depth when prompts are queued", () => {
    stateStore.getState.mockReturnValue(teamState({}, { [WORKER_ID]: { queue: ["a", "b"] } }));
    expect(stripAnsi(new TeamPanel(stateStore).render(24)[3])).toBe("  · coder · q2");
  });

  test("truncates every row to the panel width", () => {
    stateStore.getState.mockReturnValue(teamState({ focusedAgentId: LEADER_ID }));
    for (const width of [1, 6, 12, 24]) {
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
  return makeTuiState({ teamId: "my-team", leaderAgentId: LEADER_ID, agents, ...overrides });
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
