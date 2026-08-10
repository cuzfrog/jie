import { visibleWidth } from "@earendil-works/pi-tui";
import type { KanbanCard } from "../../../platform";
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
      { id: "#1", content: "later", status: "pending" },
      { id: "#2", content: "now", status: "in_progress" },
      { id: "#3", content: "done", status: "completed" },
    ]));
    const lines = new KanbanList(stateStore).render(80);
    expect(lines[0]).toBe(style("accent")("Todo:"));
    expect(lines).toHaveLength(4);
    expect(lines[1]).toContain("·");
    expect(lines[1]).toContain("#1");
    expect(lines[1]).toContain("later");
    expect(lines[2]).toContain("▸");
    expect(lines[2]).toContain("#2");
    expect(lines[2]).toContain("now");
    expect(lines[3]).toContain("✓");
    expect(lines[3]).toContain("#3");
    expect(lines[3]).toContain("done");
  });

  test("strikes through completed tasks", () => {
    stateStore.getState.mockReturnValue(boardState([
      { id: "#1", content: "later", status: "pending" },
      { id: "#3", content: "done", status: "completed" },
    ]));
    const lines = new KanbanList(stateStore).render(80);
    expect(lines[1]).not.toContain("\x1b[9m");
    expect(lines[2]).toContain(strikethrough(style("muted")("#3 done")));
  });

  test("renders an external reference before the card id", () => {
    stateStore.getState.mockReturnValue(boardState([{ id: "#1", content: "issue", status: "pending", externalRef: "G#42" }]));
    const lines = new KanbanList(stateStore).render(80);
    expect(lines[1]).toContain("G#42");
    expect(lines[1]).toContain("#1");
  });

  test("renders an [E] badge for session-scoped ephemeral cards", () => {
    stateStore.getState.mockReturnValue(boardState([{ id: "#1", content: "ephemeral", status: "pending", scope: "session" }]));
    const lines = new KanbanList(stateStore).render(80);
    expect(lines[1]).toContain("[E]");
  });

  test("renders nothing outside the list view", () => {
    stateStore.getState.mockReturnValue(boardState([{ id: "#1", content: "later", status: "pending" }], { kanbanView: "panel" }));
    expect(new KanbanList(stateStore).render(80)).toEqual([]);
    stateStore.getState.mockReturnValue(boardState([{ id: "#1", content: "later", status: "pending" }], { kanbanView: "hidden" }));
    expect(new KanbanList(stateStore).render(80)).toEqual([]);
  });

  test("shows at most six rows below the title", () => {
    const cards = Array.from({ length: 9 }, (_v, i): KanbanCard => ({ id: `#${i + 1}`, content: `task-${i}`, status: "pending" }));
    stateStore.getState.mockReturnValue(boardState(cards));
    const lines = new KanbanList(stateStore).render(80);
    expect(lines).toHaveLength(1 + 6);
    expect(lines[0]).toBe(style("accent")("Todo:"));
  });

  test("never renders a line wider than the given width (doRender guard)", () => {
    stateStore.getState.mockReturnValue(boardState([
      { id: "#1", content: "x".repeat(300), status: "in_progress" },
      { id: "#2", content: "中文🎉".repeat(40), status: "pending" },
    ]));
    const list = new KanbanList(stateStore);
    for (const width of [13, 40, 61, 80, 139]) {
      for (const line of list.render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});

describe("KanbanList.update", () => {
  test("reports dirty when the board changes", () => {
    stateStore.getState.mockReturnValue(boardState([{ id: "#1", content: "a", status: "pending" }]));
    const list = new KanbanList(stateStore);
    list.update();
    stateStore.getState.mockReturnValue(boardState([{ id: "#2", content: "b", status: "pending" }]));
    expect(list.update()).toBe(true);
  });

  test("reports dirty when the view changes", () => {
    const board: ReadonlyArray<KanbanCard> = [{ id: "#1", content: "a", status: "pending" }];
    stateStore.getState.mockReturnValue(boardState(board, { kanbanView: "list" }));
    const list = new KanbanList(stateStore);
    list.update();
    stateStore.getState.mockReturnValue(boardState(board, { kanbanView: "hidden" }));
    expect(list.update()).toBe(true);
  });

  test("reports dirty when the team changes", () => {
    const board: ReadonlyArray<KanbanCard> = [{ id: "#1", content: "a", status: "pending" }];
    stateStore.getState.mockReturnValue(boardState(board, { teamId: "my-team" }));
    const list = new KanbanList(stateStore);
    list.update();
    stateStore.getState.mockReturnValue(boardState(board, { teamId: "other" }));
    expect(list.update()).toBe(true);
  });

  test("reports clean when the watched slice is unchanged", () => {
    const state = boardState([{ id: "#1", content: "a", status: "pending" }]);
    stateStore.getState.mockReturnValue(state);
    const list = new KanbanList(stateStore);
    expect(list.update()).toBe(true);
    expect(list.update()).toBe(false);
  });

  test("reports clean when only an unwatched field changes", () => {
    const board: ReadonlyArray<KanbanCard> = [{ id: "#1", content: "a", status: "pending" }];
    stateStore.getState.mockReturnValue(boardState(board));
    const list = new KanbanList(stateStore);
    list.update();
    stateStore.getState.mockReturnValue(boardState(board, { focusedAgentId: "my-team:general-1" }));
    expect(list.update()).toBe(false);
  });
});

function boardState(cards: ReadonlyArray<KanbanCard>, overrides: Partial<TuiState> = {}): TuiState {
  return makeTuiState({
    teamId: "my-team",
    kanbanBoard: cards,
    kanbanView: "list",
    ...overrides,
  });
}
