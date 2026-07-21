import { Events } from "@cuzfrog/jie-platform";
import { visibleWidth } from "@earendil-works/pi-tui";
import { Actions, createStateStore, type StateStore } from "../../state";
import type { TodoItem } from "../../todo";
import { TodoList } from "./todo-list";

function storeWithTodos(todos: ReadonlyArray<TodoItem>): StateStore {
  const store = createStateStore();
  store.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, {
    id: "my-team",
    leaderKey: "general-1",
    agents: [{ teamId: "my-team", role: "general", agentKey: "general-1", isLeader: true, model: null }],
  })));
  store.dispatch(Actions.receiveEvent(Events.agentToolResult(
    { kind: "agent", teamId: "my-team", agentKey: "general-1" },
    "todo-1",
    "todo_write",
    null,
    0,
    null,
    { kind: "todos", todos },
  )));
  return store;
}

describe("TodoList", () => {
  test("renders nothing without a focused agent", () => {
    expect(new TodoList(createStateStore()).render(80)).toEqual([]);
  });

  test("renders nothing when the focused agent has no todos", () => {
    expect(new TodoList(storeWithTodos([])).render(80)).toEqual([]);
  });

  test("renders one glyphed row per todo status", () => {
    const list = new TodoList(storeWithTodos([
      { content: "later", status: "pending" },
      { content: "now", status: "in_progress" },
      { content: "done", status: "completed" },
    ]));
    const lines = list.render(80);
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
    expect(new TodoList(storeWithTodos(todos)).render(80)).toHaveLength(6);
  });

  test("never renders a line wider than the given width (doRender guard)", () => {
    const list = new TodoList(storeWithTodos([
      { content: "x".repeat(300), status: "in_progress" },
      { content: "中文🎉".repeat(40), status: "pending" },
    ]));
    for (const width of [13, 40, 61, 80, 139]) {
      for (const line of list.render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width);
      }
    }
  });
});
