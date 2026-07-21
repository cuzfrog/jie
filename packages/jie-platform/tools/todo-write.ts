import { Type } from "typebox";
import type { Tool, ToolResult } from "./types";
import { JiePlatformError } from "../jie-platform-errors";
import type { TodoItem } from "../types/todo";

export type { TodoStatus, TodoItem, TodoDetailsPayload } from "../types/todo";
export { isTodoDetails } from "../types/todo";

const TODO_WRITE_DESCRIPTION = `Update the live task checklist. \`todos\` is the full list (it replaces, not
merges with, whatever the agent has now). Each item is \`{ content, status, active_form? }\`.
Contract:
- exactly one item (or zero, to clear) is \`in_progress\` when the list is non-empty;
- no duplicate \`content\` strings;
- no empty \`content\`.
The returned \`details\` carries the same list under \`kind: "todos"\` so the TUI can render
the live checklist from the same payload.`;

interface TodoWriteInput {
  todos: ReadonlyArray<TodoItem>;
}

export interface TodoWriteResultDetails {
  readonly kind: "todos";
  readonly todos: ReadonlyArray<TodoItem>;
}

export function createTodoWriteTool(): Tool<TodoWriteInput> {
  return {
    name: "todo_write",
    description: TODO_WRITE_DESCRIPTION,
    label: "Update Todos",
    parameters: Type.Object({
      todos: Type.Array(
        Type.Object({
          content: Type.String(),
          status: Type.Union([
            Type.Literal("pending"),
            Type.Literal("in_progress"),
            Type.Literal("completed"),
          ]),
          active_form: Type.Optional(Type.String()),
        }),
      ),
    }),
    async execute(input: TodoWriteInput): Promise<ToolResult> {
      validate(input.todos);
      const summary = buildSummary(input.todos);
      return {
        content: summary,
        details: { kind: "todos", todos: input.todos },
      };
    },
  };
}

function validate(todos: ReadonlyArray<TodoItem>): void {
  let inProgressCount = 0;
  const seen = new Set<string>();
  for (const todo of todos) {
    if (todo.content.trim() === "") {
      throw new JiePlatformError("TODO_WRITE_INVALID", { detail: "empty content" });
    }
    if (seen.has(todo.content)) {
      throw new JiePlatformError("TODO_WRITE_INVALID", { detail: `duplicate content: ${todo.content}` });
    }
    seen.add(todo.content);
    if (todo.status === "in_progress") inProgressCount++;
  }
  if (todos.length > 0 && inProgressCount !== 1) {
    throw new JiePlatformError("TODO_WRITE_INVALID", {
      detail: `expected exactly one in_progress item, got ${inProgressCount}`,
    });
  }
}

function buildSummary(todos: ReadonlyArray<TodoItem>): string {
  if (todos.length === 0) return "Updated todo list: 0 items";
  const current = todos.find((t) => t.status === "in_progress");
  const itemWord = todos.length === 1 ? "item" : "items";
  const header = `Updated todo list: ${todos.length} ${itemWord}`;
  if (current === undefined) return header;
  return `${header}; current: ${current.content}`;
}
