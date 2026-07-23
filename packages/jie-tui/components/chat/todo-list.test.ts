import { visibleWidth } from "@earendil-works/pi-tui";
import { type AgentId, type StateStore, type TuiState } from "../../state";
import { makeAgentUiState, makeTuiState } from "../../test";
import type { TodoItem } from "../../todo";
import { TodoList } from "./todo-list";

const LEADER_ID: AgentId = "my-team:general-1";

const stateStore = vi.mocked<StateStore>({ getState: vi.fn(), dispatch: vi.fn(), subscribe: vi.fn(() => () => undefined) });

describe("TodoList", () => {
  beforeEach(() => {
    stateStore.getState.mockReturnValue(makeTuiState());
  });

  test("renders nothing without a focused agent", () => {
    expect(new TodoList(stateStore).render(80)).toEqual([]);
  });

  test("renders nothing when the focused agent has no todos", () => {
    stateStore.getState.mockReturnValue(stateWithTodos([]));
    expect(new TodoList(stateStore).render(80)).toEqual([]);
  });

  test("renders one glyphed row per todo status", () => {
    stateStore.getState.mockReturnValue(stateWithTodos([
      { content: "later", status: "pending" },
      { content: "now", status: "in_progress" },
      { content: "done", status: "completed" },
    ]));
    const lines = new TodoList(stateStore).render(80);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("·");
    expect(lines[0]).toContain("later");
    expect(lines[1]).toContain("▶");
    expect(lines[1]).toContain("now");
    expect(lines[2]).toContain("✓");
    expect(lines[2]).toContain("done");
  });

  test("shows at most six rows", () => {
    const todos = Array.from({ length: 9 }, (_v, i): TodoItem => ({ content: `task-${i}`, status: "pending" }));
    stateStore.getState.mockReturnValue(stateWithTodos(todos));
    expect(new TodoList(stateStore).render(80)).toHaveLength(6);
  });

  test("never renders a line wider than the given width (doRender guard)", () => {
    stateStore.getState.mockReturnValue(stateWithTodos([
      { content: "x".repeat(300), status: "in_progress" },
      { content: "中文🎉".repeat(40), status: "pending" },
    ]));
    const list = new TodoList(stateStore);
    for (const width of [13, 40, 61, 80, 139]) {
      for (const line of list.render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});

function stateWithTodos(todos: ReadonlyArray<TodoItem>): TuiState {
  return makeTuiState({
    teamId: "my-team",
    leaderAgentId: LEADER_ID,
    focusedAgentId: LEADER_ID,
    agents: new Map([[LEADER_ID, makeAgentUiState(LEADER_ID, { isLeader: true, todos })]]),
  });
}
