import { visibleWidth } from "@earendil-works/pi-tui";
import type { KanbanCard } from "@cuzfrog/jie-platform";
import { type StateStore, type TuiState } from "../../state";
import { makeTuiState } from "../../test";
import { KanbanList } from "./kanban-list";
import { strikethrough, style } from "../themes";

const stateStore = vi.mocked<StateStore>({ getState: vi.fn(), dispatch: vi.fn(), subscribe: vi.fn(() => () => undefined) });

describe("KanbanList", () => {
  beforeEach(() => {
    stateStore.getState.mockReturnValue(makeTuiState());
  });

  test("renders nothing before a team is loaded", () => {
    expect(new KanbanList(stateStore).render(80)).toEqual([]);
  });

  test("renders nothing when the board is empty", () => {
    stateStore.getState.mockReturnValue(boardState([]));
    expect(new KanbanList(stateStore).render(80)).toEqual([]);
  });

  test("renders the Todo: title above one glyphed row per card", () => {
    stateStore.getState.mockReturnValue(boardState([
      { id: "K1", content: "later", status: "pending" },
      { id: "K2", content: "now", status: "in_progress" },
      { id: "K3", content: "done", status: "completed" },
    ]));
    const lines = new KanbanList(stateStore).render(80);
    expect(lines[0]).toBe(style("accent")("Todo:"));
    expect(lines).toHaveLength(4);
    expect(lines[1]).toContain("·");
    expect(lines[1]).toContain("K1");
    expect(lines[1]).toContain("later");
    expect(lines[2]).toContain("▶");
    expect(lines[2]).toContain("K2");
    expect(lines[2]).toContain("now");
    expect(lines[3]).toContain("✓");
    expect(lines[3]).toContain("K3");
    expect(lines[3]).toContain("done");
  });

  test("strikes through completed tasks", () => {
    stateStore.getState.mockReturnValue(boardState([
      { id: "K1", content: "later", status: "pending" },
      { id: "K3", content: "done", status: "completed" },
    ]));
    const lines = new KanbanList(stateStore).render(80);
    expect(lines[1]).not.toContain("\x1b[9m");
    expect(lines[2]).toContain(strikethrough(style("muted")("K3 done")));
  });

  test("renders nothing while the kanban panel is open", () => {
    stateStore.getState.mockReturnValue(boardState([{ id: "K1", content: "later", status: "pending" }], { kanbanPanelVisible: true }));
    expect(new KanbanList(stateStore).render(80)).toEqual([]);
  });

  test("shows at most six rows below the title", () => {
    const cards = Array.from({ length: 9 }, (_v, i): KanbanCard => ({ id: `K${i + 1}`, content: `task-${i}`, status: "pending" }));
    stateStore.getState.mockReturnValue(boardState(cards));
    const lines = new KanbanList(stateStore).render(80);
    expect(lines).toHaveLength(1 + 6);
    expect(lines[0]).toBe(style("accent")("Todo:"));
  });

  test("never renders a line wider than the given width (doRender guard)", () => {
    stateStore.getState.mockReturnValue(boardState([
      { id: "K1", content: "x".repeat(300), status: "in_progress" },
      { id: "K2", content: "中文🎉".repeat(40), status: "pending" },
    ]));
    const list = new KanbanList(stateStore);
    for (const width of [13, 40, 61, 80, 139]) {
      for (const line of list.render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});

function boardState(cards: ReadonlyArray<KanbanCard>, overrides: Partial<TuiState> = {}): TuiState {
  return makeTuiState({
    teamId: "my-team",
    kanbanBoard: cards,
    ...overrides,
  });
}