import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { type StateStore, type TuiState } from "../state";
import type { KanbanCard, KanbanStatus } from "../kanban";
import { bg, style, type ColorName } from "./themes";

const PANEL_PADDING = 1;
const COLUMN_GAP = "  ";
const MAX_ROWS_PER_COLUMN = 8;
const STATUS_LABELS: { readonly [K in KanbanStatus]: string } = {
  pending: "pending",
  in_progress: "in_progress",
  completed: "completed",
};

const KANBAN_COLUMNS: ReadonlyArray<{ readonly status: KanbanStatus; readonly title: string; readonly cardColor: ColorName }> = [
  { status: "pending", title: "Pending", cardColor: "text" },
  { status: "in_progress", title: "In Progress", cardColor: "accent" },
  { status: "completed", title: "Done", cardColor: "muted" },
];

const HINTS = {
  collapsed: "↑↓←→ move · tab expand · enter edit · ctrl+k close",
  expanded: "tab collapse · enter edit · ctrl+k close",
  editing: "enter/ctrl+s save · esc cancel",
} as const;

export class KanbanPanel implements Component {
  private readonly stateStore: StateStore;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  render(width: number): string[] {
    const state = this.stateStore.getState();
    if (state.teamId === null || !state.kanbanPanelVisible) return [];
    const w = Math.max(1, width);
    const inner = Math.max(1, w - 2 - PANEL_PADDING * 2);
    const focused = state.kanbanCursor === null ? null : state.kanbanBoard.find((card) => card.id === state.kanbanCursor) ?? null;
    const rows = state.kanbanExpanded ? renderCardDetail(focused, inner) : renderKanbanBoard(state, inner);
    const border = style("borderMuted");
    const horizontal = "─".repeat(Math.max(0, w - 2));
    const framed = rows.map((row) => truncateToWidth(`${border("│")} ${row} ${border("│")}`, w));
    return [
      truncateToWidth(border(`┌${horizontal}┐`), w),
      ...framed,
      truncateToWidth(border(`└${horizontal}┘`), w),
      renderHint(state, w),
    ];
  }

  invalidate(): void {}
}

function renderKanbanBoard(state: TuiState, innerWidth: number): string[] {
  const columnWidth = Math.max(1, Math.floor((innerWidth - COLUMN_GAP.length * (KANBAN_COLUMNS.length - 1)) / KANBAN_COLUMNS.length));
  const columns = KANBAN_COLUMNS.map((column) => renderColumn(column, state.kanbanBoard.filter((card) => card.status === column.status), state.kanbanCursor, columnWidth));
  const height = Math.max(...columns.map((column) => column.length));
  const rows: string[] = [];
  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    const cells = columns.map((column) => fitToWidth(column[rowIndex] ?? "", columnWidth));
    rows.push(fitToWidth(cells.join(COLUMN_GAP), innerWidth));
  }
  return rows;
}

function renderColumn(column: { readonly title: string; readonly cardColor: ColorName }, cards: ReadonlyArray<KanbanCard>, cursorId: string | null, columnWidth: number): string[] {
  const header = style("dim")(truncateToWidth(`${column.title} (${cards.length})`, columnWidth));
  const rows = cards.slice(0, MAX_ROWS_PER_COLUMN).map((card) => {
    const line = style(column.cardColor)(truncateToWidth(card.content, columnWidth));
    return withBackground(line, columnWidth, bg(card.id === cursorId ? "cursor" : "card"));
  });
  const overflow = cards.length - MAX_ROWS_PER_COLUMN;
  if (overflow > 0) rows.push(style("dim")(`+${overflow} more`));
  return [header, ...rows];
}

function renderCardDetail(card: KanbanCard | null, innerWidth: number): string[] {
  if (card === null) return [style("muted")("no task selected")];
  const lines = [`${card.id} · ${card.content}`, `status: ${STATUS_LABELS[card.status]}`];
  if (card.active_form !== undefined) lines.push(`active: ${card.active_form}`);
  if (card.description !== undefined && card.description !== "") lines.push(`description: ${card.description}`);
  return lines.map((line, index) => {
    const text = style(index === 0 ? "text" : "muted")(truncateToWidth(line, innerWidth));
    return withBackground(text, innerWidth, bg("card"));
  });
}

function renderHint(state: TuiState, width: number): string {
  const text = state.kanbanEdit !== null ? HINTS.editing : state.kanbanExpanded ? HINTS.expanded : HINTS.collapsed;
  return truncateToWidth(style("dim")(text), width);
}

function fitToWidth(text: string, width: number): string {
  const fitted = truncateToWidth(text, width);
  return fitted + " ".repeat(Math.max(0, width - visibleWidth(fitted)));
}

function withBackground(text: string, width: number, apply: (text: string) => string): string {
  const padded = text + " ".repeat(Math.max(0, width - visibleWidth(text)));
  return apply(padded);
}