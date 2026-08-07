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

  test("renders nothing while the view is hidden or list", () => {
    stateStore.getState.mockReturnValue(boardState([], { kanbanView: "hidden" }));
    expect(new KanbanPanel(stateStore).render(80)).toEqual([]);
    stateStore.getState.mockReturnValue(boardState([], { kanbanView: "list" }));
    expect(new KanbanPanel(stateStore).render(80)).toEqual([]);
  });

  test("shows only the column headers when the board is empty", () => {
    stateStore.getState.mockReturnValue(boardState([]));
    const lines = new KanbanPanel(stateStore).render(120);
    expect(lines[1]).toContain(style("dim")("Pending (0)"));
    expect(lines[1]).toContain(style("dim")("In Progress (0)"));
    expect(lines[1]).toContain(style("dim")("In Review (0)"));
    expect(lines[1]).toContain(style("dim")("Done (0)"));
  });

  test("draws a thin full box around dim column headers above one row per card", () => {
    stateStore.getState.mockReturnValue(boardState([{ id: "#1", content: "write spec", status: "pending" }]));
    const lines = new KanbanPanel(stateStore).render(120);
    expect(lines[0]).toBe(style("borderMuted")(`┌${"─".repeat(118)}┐`));
    expect(lines[3]).toBe(style("borderMuted")(`└${"─".repeat(118)}┘`));
    expect(lines[1]).toContain(style("dim")("Pending (1)"));
  });

  test("lists each card under its status column left to right", () => {
    stateStore.getState.mockReturnValue(boardState([
      { id: "#1", content: "write spec", status: "pending" },
      { id: "#2", content: "implement tool", status: "in_progress" },
      { id: "#3", content: "rename todo", status: "completed" },
    ]));
    const row = stripAnsi(new KanbanPanel(stateStore).render(120)[2]);
    expect(row.indexOf("write spec")).toBeGreaterThanOrEqual(0);
    expect(row.indexOf("write spec")).toBeLessThan(row.indexOf("implement tool"));
    expect(row.indexOf("implement tool")).toBeLessThan(row.indexOf("rename todo"));
  });

  test("styles cards by status: pending text, in-progress accent, completed muted", () => {
    stateStore.getState.mockReturnValue(boardState([
      { id: "#1", content: "write spec", status: "pending" },
      { id: "#2", content: "implement tool", status: "in_progress" },
      { id: "#3", content: "rename todo", status: "completed" },
    ]));
    const row = new KanbanPanel(stateStore).render(120)[2];
    expect(row).toContain(style("text")("write spec"));
    expect(row).toContain(style("accent")("implement tool"));
    expect(row).toContain(style("muted")("rename todo"));
  });

  test("marks the cursor card with a triangle, indents the others, and renders no backgrounds", () => {
    stateStore.getState.mockReturnValue(boardState([
      { id: "#1", content: "write spec", status: "pending" },
      { id: "#2", content: "implement tool", status: "in_progress" },
    ], { kanbanCursor: "#2" }));
    const row = new KanbanPanel(stateStore).render(120)[2];
    expect(row).toContain(`${style("accent")("▸")}${style("accent")("implement tool")}`);
    expect(stripAnsi(row)).toContain(" write spec");
    expect(row).not.toContain("\x1b[48;5;");
  });

  test("caps each column at eight cards and reports the overflow", () => {
    const cards: ReadonlyArray<KanbanCard> = Array.from({ length: 12 }, (_, index) => ({ id: `#${index + 1}`, content: `pending ${index}`, status: "pending" }));
    stateStore.getState.mockReturnValue(boardState(cards));
    const text = new KanbanPanel(stateStore).render(120).map(stripAnsi);
    expect(text.some((line) => line.includes("Pending (12)"))).toBe(true);
    expect(text.some((line) => line.includes("pending 7"))).toBe(true);
    expect(text.some((line) => line.includes("pending 8"))).toBe(false);
    expect(text.some((line) => line.includes("+4 more"))).toBe(true);
  });

  test("pads every framed line to the full width so the box sides align", () => {
    stateStore.getState.mockReturnValue(boardState([{ id: "#1", content: "a", status: "pending" }]));
    const lines = new KanbanPanel(stateStore).render(120);
    for (const line of lines.slice(0, lines.length - 1)) expect(visibleWidth(line)).toBe(120);
  });

  test("truncates card content wider than its column", () => {
    stateStore.getState.mockReturnValue(boardState([{ id: "#1", content: "x".repeat(200), status: "pending" }]));
    for (const line of new KanbanPanel(stateStore).render(80)) expect(visibleWidth(line)).toBeLessThanOrEqual(80);
  });

  test("shows a shortcut hint below the panel", () => {
    stateStore.getState.mockReturnValue(boardState([{ id: "#1", content: "a", status: "pending" }]));
    const lines = new KanbanPanel(stateStore).render(80);
    expect(lines[lines.length - 1]).toContain("tab expand");
    expect(lines[lines.length - 1]).toContain("ctrl+e edit");
  });

  test("expanded mode shows the focused card detail full width with the id chip on the top border", () => {
    stateStore.getState.mockReturnValue(boardState([
      { id: "#1", content: "write spec", status: "in_progress", active_form: "drafting", description: "cover storage and events" },
    ], { kanbanExpanded: true, kanbanCursor: "#1" }));
    const lines = new KanbanPanel(stateStore).render(120);
    expect(lines.join("")).not.toContain("\x1b[48;5;");
    const text = lines.map(stripAnsi);
    expect(text[0]).toContain("┌ #1 ");
    expect(text.some((line) => line.includes("▸write spec"))).toBe(true);
    expect(text.some((line) => line.includes("description: cover storage and events"))).toBe(true);
    expect(text.some((line) => line.includes("status: in_progress"))).toBe(true);
    expect(text.some((line) => line.includes("active: drafting"))).toBe(true);
    expect(text[text.length - 1]).toContain("tab collapse");
  });

  test("expanded mode pads every framed line to the full panel width", () => {
    stateStore.getState.mockReturnValue(boardState([
      { id: "#1", content: "write spec", status: "in_progress", active_form: "drafting", description: "cover storage and events" },
    ], { kanbanExpanded: true, kanbanCursor: "#1" }));
    const lines = new KanbanPanel(stateStore).render(120);
    for (const line of lines.slice(0, lines.length - 1)) {
      expect(visibleWidth(line)).toBe(120);
    }
  });

  test("expanded mode shows a cursor on the selected field for editing", () => {
    stateStore.getState.mockReturnValue(boardState([
      { id: "#1", content: "write spec", status: "in_progress", description: "cover storage and events" },
    ], { kanbanExpanded: true, kanbanCursor: "#1", kanbanEditField: "content" }));
    const text = new KanbanPanel(stateStore).render(120).map(stripAnsi);
    expect(text.some((line) => line.includes("▸write spec"))).toBe(true);
    expect(text.some((line) => line.includes(" description: cover storage and events"))).toBe(true);
  });

  test("expanded mode selects the description row when the edit field is description", () => {
    stateStore.getState.mockReturnValue(boardState([
      { id: "#1", content: "write spec", status: "in_progress", description: "cover storage and events" },
    ], { kanbanExpanded: true, kanbanCursor: "#1", kanbanEditField: "description" }));
    const text = new KanbanPanel(stateStore).render(120).map(stripAnsi);
    expect(text.some((line) => line.includes(" write spec"))).toBe(true);
    expect(text.some((line) => line.includes("▸description: cover storage and events"))).toBe(true);
  });

  test("expanded mode renders a dim placeholder when the card has no description", () => {
    stateStore.getState.mockReturnValue(boardState([
      { id: "#1", content: "write spec", status: "in_progress" },
    ], { kanbanExpanded: true, kanbanCursor: "#1", kanbanEditField: "description" }));
    const lines = new KanbanPanel(stateStore).render(120);
    const text = lines.map(stripAnsi);
    const line = text.find((line) => line.includes("description:"));
    expect(line).toBeDefined();
    const inner = stripAnsi(line!).replace(/[│]/g, "").trim();
    expect(inner).toBe("▸description:");
    expect(lines.some((line) => line.includes(style("dim")("description:")))).toBe(true);
  });

  test("expanded mode with no cursor shows a placeholder", () => {
    stateStore.getState.mockReturnValue(boardState([{ id: "#1", content: "a", status: "pending" }], { kanbanExpanded: true }));
    const lines = new KanbanPanel(stateStore).render(80);
    expect(stripAnsi(lines[1])).toContain("no task selected");
  });

  test("truncates every line to the available width", () => {
    stateStore.getState.mockReturnValue(boardState([
      { id: "#1", content: "write spec", status: "pending" },
      { id: "#2", content: "implement tool", status: "in_progress" },
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
    kanbanView: "panel",
    ...overrides,
  });
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}
