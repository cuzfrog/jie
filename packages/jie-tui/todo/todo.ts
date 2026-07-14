export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TodoItem {
  readonly content: string;
  readonly status: TodoStatus;
  readonly active_form?: string;
}

export interface TodoDetailsPayload {
  readonly kind: "todos";
  readonly todos: ReadonlyArray<TodoItem>;
}

export function isTodoDetails(value: unknown): value is TodoDetailsPayload {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { kind?: unknown; todos?: unknown };
  if (candidate.kind !== "todos") return false;
  if (!Array.isArray(candidate.todos)) return false;
  for (const item of candidate.todos) {
    if (!isTodoItem(item)) return false;
  }
  return true;
}

function isTodoItem(value: unknown): value is TodoItem {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { content?: unknown; status?: unknown; active_form?: unknown };
  if (typeof candidate.content !== "string") return false;
  if (candidate.status !== "pending" && candidate.status !== "in_progress" && candidate.status !== "completed") return false;
  if (candidate.active_form !== undefined && typeof candidate.active_form !== "string") return false;
  return true;
}