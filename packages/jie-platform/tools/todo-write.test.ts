import { createTodoWriteTool, type TodoItem } from "./todo-write";
import { makeEmptyContext } from "./_test-context";

describe("todo_write", () => {
  test("single in_progress todo is accepted as the canonical shape", async () => {
    const tool = createTodoWriteTool();
    const todos: TodoItem[] = [{ content: "write tests", status: "in_progress", active_form: "Writing tests" }];
    const result = await tool.execute({ todos }, makeEmptyContext());
    expect(result.content).toContain("Updated todo list");
    expect(result.content).toContain("1 item");
    expect(result.details).toMatchObject({ kind: "todos", todos });
  });

  test("mix of pending and completed items is accepted", async () => {
    const tool = createTodoWriteTool();
    const todos: TodoItem[] = [
      { content: "first", status: "completed" },
      { content: "second", status: "in_progress" },
      { content: "third", status: "pending" },
    ];
    const result = await tool.execute({ todos }, makeEmptyContext());
    expect((result.details as { todos: TodoItem[] }).todos).toEqual(todos);
  });

  test("empty todos list clears the list", async () => {
    const tool = createTodoWriteTool();
    const result = await tool.execute({ todos: [] }, makeEmptyContext());
    expect(result.content).toContain("0 items");
    expect((result.details as { todos: TodoItem[] }).todos).toEqual([]);
  });

  test("more than one in_progress item -> todo_write_invalid", async () => {
    const tool = createTodoWriteTool();
    await expect(
      tool.execute(
        {
          todos: [
            { content: "a", status: "in_progress" },
            { content: "b", status: "in_progress" },
          ],
        },
        makeEmptyContext(),
      ),
    ).rejects.toMatchObject({ code: "TODO_WRITE_INVALID" });
  });

  test("an in_progress item must exist when the list is non-empty", async () => {
    const tool = createTodoWriteTool();
    await expect(
      tool.execute(
        {
          todos: [
            { content: "a", status: "completed" },
            { content: "b", status: "pending" },
          ],
        },
        makeEmptyContext(),
      ),
    ).rejects.toMatchObject({ code: "TODO_WRITE_INVALID" });
  });

  test("duplicate content -> todo_write_invalid", async () => {
    const tool = createTodoWriteTool();
    await expect(
      tool.execute(
        {
          todos: [
            { content: "same", status: "in_progress" },
            { content: "same", status: "pending" },
          ],
        },
        makeEmptyContext(),
      ),
    ).rejects.toMatchObject({ code: "TODO_WRITE_INVALID" });
  });

  test("empty content -> todo_write_invalid", async () => {
    const tool = createTodoWriteTool();
    await expect(
      tool.execute({ todos: [{ content: "", status: "in_progress" }] }, makeEmptyContext()),
    ).rejects.toMatchObject({ code: "TODO_WRITE_INVALID" });
  });

  test("whitespace-only content is treated as empty -> todo_write_invalid", async () => {
    const tool = createTodoWriteTool();
    await expect(
      tool.execute({ todos: [{ content: "   \t\n  ", status: "in_progress" }] }, makeEmptyContext()),
    ).rejects.toMatchObject({ code: "TODO_WRITE_INVALID" });
  });

  test("LLM-facing content reports the in_progress item by name", async () => {
    const tool = createTodoWriteTool();
    const result = await tool.execute(
      { todos: [{ content: "implement diff view", status: "in_progress" }] },
      makeEmptyContext(),
    );
    expect(result.content).toContain("implement diff view");
  });

  test("details carries discriminator kind: 'todos'", async () => {
    const tool = createTodoWriteTool();
    const result = await tool.execute(
      { todos: [{ content: "x", status: "in_progress" }] },
      makeEmptyContext(),
    );
    expect(result.details).toMatchObject({ kind: "todos" });
  });
});