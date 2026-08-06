import type { KanbanCard, KanbanStatus } from "../kanban";

export type KanbanDirection = "up" | "down" | "left" | "right";

const COLUMN_ORDER: ReadonlyArray<KanbanStatus> = ["pending", "in_progress", "completed"];

export function moveKanbanCursor(cards: ReadonlyArray<KanbanCard>, currentId: string | null, direction: KanbanDirection): string | null {
  if (cards.length === 0) return null;
  const current = cards.find((card) => card.id === currentId) ?? cards[0]!;
  const column = columnOf(cards, current.status);
  const row = column.findIndex((card) => card.id === current.id);
  if (direction === "up" || direction === "down") {
    const next = direction === "up" ? row - 1 : row + 1;
    if (next < 0 || next >= column.length) return current.id;
    return column[next]!.id;
  }
  const target = adjacentColumn(cards, current.status, direction === "left" ? -1 : 1);
  if (target === null) return current.id;
  return target[Math.min(row, target.length - 1)]!.id;
}

export function clampKanbanCursor(cards: ReadonlyArray<KanbanCard>, cursorId: string | null): string | null {
  if (cards.length === 0) return null;
  if (cursorId !== null && cards.some((card) => card.id === cursorId)) return cursorId;
  return cards[0]!.id;
}

function columnOf(cards: ReadonlyArray<KanbanCard>, status: KanbanStatus): ReadonlyArray<KanbanCard> {
  return cards.filter((card) => card.status === status);
}

function adjacentColumn(cards: ReadonlyArray<KanbanCard>, status: KanbanStatus, step: 1 | -1): ReadonlyArray<KanbanCard> | null {
  const start = COLUMN_ORDER.indexOf(status);
  for (let offset = step; start + offset >= 0 && start + offset < COLUMN_ORDER.length; offset += step) {
    const column = columnOf(cards, COLUMN_ORDER[start + offset]!);
    if (column.length > 0) return column;
  }
  return null;
}