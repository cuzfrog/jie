import { visibleWidth } from "@earendil-works/pi-tui";
import type { KanbanCard } from "@cuzfrog/jie-platform";
import { type StateStore, type TuiState } from "../state";
import { makeTuiState } from "../test";
import { KanbanPanel } from "./kanban-panel";
import { style } from "./themes";

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

  test("shows only the column headers when the board is empty", () => {
    stateStore.getState.mockReturnValue(boardState([]));
    const lines = new KanbanPanel(stateStore).render(120);
    expect(lines[1]).toContain(style("dim")("Pending (0)"));
    expect(lines[1]).toContain(style("dim")("In Progress (0)"));
    expect(lines[1]).toContain(style("dim")("Done (0)"));
  });

  test("draws a thin full box around dim column headers above one row per card", () => {
    stateStore.getState.mockReturnValue(boardState([{ id: "K1", content: "write spec", status: "pending" }]));
    const lines = new KanbanPanel(stateStore).render(120);
    expect(lines[0]).toBe(style("borderMuted")(`┌${"─".repeat(118)}┐`));
    expect(lines[3]).toBe(style("borderMuted")(`└${"─".repeat(118)}┘`));
    expect(lines[1]).toContain(style("dim")("Pending (1)"));
  });

  test("lists each card under its status column left to right", () => {
    stateStore.getState.mockReturnValue(boardState([
      { id: "K1", content: "write spec", status: "pending" },
      { id: "K2", content: "implement tool", status: "in_progress" },
      { id: "K3", content: "rename todo", status: "completed" },
    ]));
    const row = stripAnsi(new KanbanPanel(stateStore).render(120)[2]);
    expect(row.indexOf("write spec")).toBeGreaterThanOrEqual(0);
    expect(row.indexOf("write spec")).toBeLessThan(row.indexOf("implement tool"));
    expect(row.indexOf("implement tool")).toBeLessThan(row.indexOf("rename todo"));
  });

  test("styles cards by status: pending text, in-progress accent, completed muted", () => {
    stateStore.getState.mockReturnValue(boardState([
      { id: "K1", content: "write spec", status: "pending" },
      { id: "K2", content: "implement tool", status: "in_progress" },
      { id: "K3", content: "rename todo", status: "completed" },
    ]));
    const row = new KanbanPanel(stateStore).render(120)[2];
    expect(row).toContain(style("text")("write spec"));
    expect(row).toContain(style("accent")("implement tool"));
    expect(row).toContain(style("muted")("rename todo"));
  });

  test("gives every card a background and the cursor card a distinct one", () => {
    stateStore.getState.mockReturnValue(boardState([
      { id: "K1", content: "write spec", status: "pending" },
      { id: "K2", content: "implement tool", status: "in_progress" },
    ], { kanbanCursor: "K2" }));
    const row = new KanbanPanel(stateStore).render(120)[2];
    expect(row).toContain(`\x1b[48;5;236m${style("text")("write spec")}`);
    expect(row).toContain(`\x1b[48;5;30m${style("accent")("implement tool")}`);
    expect(row).not.toContain(`\x1b[48;5;30m${style("text")("write spec")}`);
  });

  test("caps each column at eight cards and reports the overflow", () => {
    const cards: ReadonlyArray<KanbanCard> = Array.from({ length: 12 }, (_, index) => ({ id: `K${index + 1}`, content: `pending ${index}`, status: "pending" }));
    stateStore.getState.mockReturnValue(boardState(cards));
    const text = new KanbanPanel(stateStore).render(120).map(stripAnsi);
    expect(text.some((line) => line.includes("Pending (12)"))).toBe(true);
    expect(text.some((line) => line.includes("pending 7"))).toBe(true);
    expect(text.some((line) => line.includes("pending 8"))).toBe(false);
    expect(text.some((line) => line.includes("+4 more"))).toBe(true);
  });

  test("pads every framed line to the full width so the box sides align", () => {
    stateStore.getState.mockReturnValue(boardState([{ id: "K1", content: "a", status: "pending" }]));
    const lines = new KanbanPanel(stateStore).render(120);
    for (const line of lines.slice(0, lines.length - 1)) expect(visibleWidth(line)).toBe(120);
  });

  test("truncates card content wider than its column", () => {
    stateStore.getState.mockReturnValue(boardState([{ id: "K1", content: "x".repeat(200), status: "pending" }]));
    for (const line of new KanbanPanel(stateStore).render(80)) expect(visibleWidth(line)).toBeLessThanOrEqual(80);
  });

  test("shows a shortcut hint below the panel", () => {
    stateStore.getState.mockReturnValue(boardState([{ id: "K1", content: "a", status: "pending" }]));
    const lines = new KanbanPanel(stateStore).render(80);
    expect(lines[lines.length - 1]).toContain("tab expand");
  });

  test("expanded mode shows the focused card detail full width", () => {
    stateStore.getState.mockReturnValue(boardState([
      { id: "K1", content: "write spec", status: "in_progress", active_form: "drafting", description: "cover storage and events" },
    ], { kanbanExpanded: true, kanbanCursor: "K1" }));
    const text = new KanbanPanel(stateStore).render(120).map(stripAnsi);
    expect(text.some((line) => line.includes("K1 · write spec"))).toBe(true);
    expect(text.some((line) => line.includes("status: in_progress"))).toBe(true);
    expect(text.some((line) => line.includes("active: drafting"))).toBe(true);
    expect(text.some((line) => line.includes("description: cover storage and events"))).toBe(true);
    expect(text[text.length - 1]).toContain("tab collapse");
  });

  test("expanded mode with no cursor shows a placeholder", () => {
    stateStore.getState.mockReturnValue(boardState([{ id: "K1", content: "a", status: "pending" }], { kanbanExpanded: true }));
    const lines = new KanbanPanel(stateStore).render(80);
    expect(stripAnsi(lines[1])).toContain("no task selected");
  });

  test("truncates every line to the available width", () => {
    stateStore.getState.mockReturnValue(boardState([
      { id: "K1", content: "write spec", status: "pending" },
      { id: "K2", content: "implement tool", status: "in_progress" },
    ]));
    for (const width of [1, 6, 12, 80]) {
      for (const line of new KanbanPanel(stateStore).render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});

function boardState(cards: ReadonlyArray<KanbanCard>, overrides: Partial<TuiState> = {}): TuiState {
  return makeTuiState({
    teamId: "my-team",
    kanbanBoard: cards,
    kanbanPanelVisible: true,
    ...overrides,
  });
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
