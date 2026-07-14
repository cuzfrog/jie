import { Box, Text } from "@cuzfrog/jie-ink";
import type { JSX } from "react";
import type { TodoItem, TodoStatus } from "../../todo";
import { useTuiContext } from "../context";
import { pickColor } from "../themes";

export const MAX_VISIBLE_TODOS = 6;

interface TodoStyle {
  readonly glyph: string;
  readonly glyphColor: "accent" | "muted";
  readonly textColor: "muted" | "text";
}

const TODO_STYLES: { readonly [K in TodoStatus]: TodoStyle } = {
  pending: { glyph: "·", glyphColor: "muted", textColor: "text" },
  in_progress: { glyph: "▶", glyphColor: "accent", textColor: "text" },
  completed: { glyph: "✓", glyphColor: "muted", textColor: "muted" },
};

interface TodoListProps {
  readonly width: number;
}

interface TodoRow {
  readonly item: TodoItem;
  readonly index: number;
}

export function TodoList({ width }: TodoListProps): JSX.Element | null {
  const { state } = useTuiContext();
  const focusedId = state.focusedAgentId;
  const focused = focusedId === null ? null : state.agents.get(focusedId) ?? null;
  if (focused === null) return null;
  const todos = focused.todos;
  if (todos.length === 0) return null;
  const visible = todos.slice(0, MAX_VISIBLE_TODOS);
  const rows: TodoRow[] = visible.map((item, index) => ({ item, index }));
  return (
    <Box flexDirection="column" width={width} borderStyle="single" borderColor={pickColor("borderMuted")} paddingX={1}>
      {rows.map((row) => (
        <TodoRowView key={`${row.index}-${row.item.content}`} item={row.item} width={width - 4} />
      ))}
    </Box>
  );
}

export function todoListRowCount(todoCount: number): number {
  return Math.min(MAX_VISIBLE_TODOS, todoCount);
}

function TodoRowView({ item, width }: { readonly item: TodoItem; readonly width: number }): JSX.Element {
  const style = TODO_STYLES[item.status];
  return (
    <Box flexDirection="row">
      <Text color={pickColor(style.glyphColor)}>{style.glyph} </Text>
      <Text color={pickColor(style.textColor)}>{truncate(item.content, Math.max(1, width))}</Text>
    </Box>
  );
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1))}…`;
}