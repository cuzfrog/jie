import { visibleWidth } from "@earendil-works/pi-tui";
import { type AgentId, type StateStore, type TuiState } from "../state";
import type { KanbanCard } from "../kanban";
import { makeAgentUiState, makeTuiState } from "../test";
import { KanbanPanel } from "./kanban-panel";
import { style } from "./themes";

const AGENT_ID: AgentId = "my-team:general-1";

const stateStore = vi.mocked<StateStore>({ getState: vi.fn(), dispatch: vi.fn(), subscribe: vi.fn(() => () => undefined) });

describe("KanbanPanel", () => {
  beforeEach(() => {
    stateStore.getState.mockReturnValue(makeTuiState());
  });

  test("renders nothing before a team is loaded", () => {
    expect(new KanbanPanel(stateStore).render(80)).toEqual([]);
  });

  test("renders nothing while the panel is hidden", () => {
    stateStore.getState.mockReturnValue(boardState([], { kanbanPanelVisible: false }));
    expect(new KanbanPanel(stateStore).render(80)).toEqual([]);
  });

  test("renders nothing when no agent is focused", () => {
    stateStore.getState.mockReturnValue(boardState([], { focusedAgentId: null }));
    expect(new KanbanPanel(stateStore).render(80)).toEqual([]);
  });

  test("shows only the column headers when the focused agent has no cards", () => {
    stateStore.getState.mockReturnValue(boardState([]));
    const lines = new KanbanPanel(stateStore).render(120);
    expect(lines.length).toBe(3);
    expect(lines[1]).toContain(style("dim")("Pending (0)"));
    expect(lines[1]).toContain(style("dim")("In Progress (0)"));
    expect(lines[1]).toContain(style("dim")("Done (0)"));
  });

  test("draws a thin full box around dim column headers above one row per card", () => {
    stateStore.getState.mockReturnValue(boardState([{ content: "write spec", status: "pending" }]));
    const lines = new KanbanPanel(stateStore).render(120);
    expect(lines[0]).toBe(style("borderMuted")(`┌${"─".repeat(118)}┐`));
    expect(lines[3]).toBe(style("borderMuted")(`└${"─".repeat(118)}┘`));
    expect(lines[1]).toContain(style("dim")("Pending (1)"));
    expect(lines.length).toBe(4);
  });

  test("lists each card under its status column left to right", () => {
    stateStore.getState.mockReturnValue(boardState([
      { content: "write spec", status: "pending" },
      { content: "implement tool", status: "in_progress" },
      { content: "rename todo", status: "completed" },
    ]));
    const row = stripAnsi(new KanbanPanel(stateStore).render(120)[2]);
    expect(row.indexOf("write spec")).toBeGreaterThanOrEqual(0);
    expect(row.indexOf("write spec")).toBeLessThan(row.indexOf("implement tool"));
    expect(row.indexOf("implement tool")).toBeLessThan(row.indexOf("rename todo"));
  });

  test("styles cards by status: pending text, in-progress accent, completed muted", () => {
    stateStore.getState.mockReturnValue(boardState([
      { content: "write spec", status: "pending" },
      { content: "implement tool", status: "in_progress" },
      { content: "rename todo", status: "completed" },
    ]));
    const row = new KanbanPanel(stateStore).render(120)[2];
    expect(row).toContain(style("text")("write spec"));
    expect(row).toContain(style("accent")("implement tool"));
    expect(row).toContain(style("muted")("rename todo"));
  });

  test("caps each column at eight cards and reports the overflow", () => {
    const cards: ReadonlyArray<KanbanCard> = Array.from({ length: 12 }, (_, index) => ({ content: `pending ${index}`, status: "pending" }));
    stateStore.getState.mockReturnValue(boardState(cards));
    const text = new KanbanPanel(stateStore).render(120).map(stripAnsi);
    expect(text.some((line) => line.includes("Pending (12)"))).toBe(true);
    expect(text.some((line) => line.includes("pending 7"))).toBe(true);
    expect(text.some((line) => line.includes("pending 8"))).toBe(false);
    expect(text.some((line) => line.includes("+4 more"))).toBe(true);
  });

  test("pads every line to the full width so the box sides align", () => {
    stateStore.getState.mockReturnValue(boardState([{ content: "a", status: "pending" }]));
    for (const line of new KanbanPanel(stateStore).render(120)) expect(visibleWidth(line)).toBe(120);
  });

  test("truncates card content wider than its column", () => {
    stateStore.getState.mockReturnValue(boardState([{ content: "x".repeat(200), status: "pending" }]));
    for (const line of new KanbanPanel(stateStore).render(80)) expect(visibleWidth(line)).toBe(80);
  });

  test("truncates every line to the available width", () => {
    stateStore.getState.mockReturnValue(boardState([
      { content: "write spec", status: "pending" },
      { content: "implement tool", status: "in_progress" },
    ]));
    for (const width of [1, 6, 12, 80]) {
      for (const line of new KanbanPanel(stateStore).render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});

function boardState(cards: ReadonlyArray<KanbanCard>, overrides: Partial<TuiState> = {}): TuiState {
  const agent = makeAgentUiState(AGENT_ID, { isLeader: true, cards });
  return makeTuiState({
    teamId: "my-team",
    leaderAgentId: AGENT_ID,
    focusedAgentId: AGENT_ID,
    agents: new Map([[AGENT_ID, agent]]),
    kanbanPanelVisible: true,
    ...overrides,
  });
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
