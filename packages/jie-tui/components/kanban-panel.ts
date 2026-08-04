import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { TuiState, type StateStore } from "../state";
import type { KanbanCard, KanbanStatus } from "../kanban";
import { style, type ColorName } from "./themes";

const PANEL_PADDING = 1;
const COLUMN_GAP = "  ";
const MAX_ROWS_PER_COLUMN = 8;

const KANBAN_COLUMNS: ReadonlyArray<{ readonly status: KanbanStatus; readonly title: string; readonly cardColor: ColorName }> = [
  { status: "pending", title: "Pending", cardColor: "text" },
  { status: "in_progress", title: "In Progress", cardColor: "accent" },
  { status: "completed", title: "Done", cardColor: "muted" },
];

export class KanbanPanel implements Component {
  private readonly stateStore: StateStore;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  render(width: number): string[] {
    const state = this.stateStore.getState();
    if (state.teamId === null || !state.kanbanPanelVisible) return [];
    const focused = TuiState.getFocusedAgent(state);
    if (focused === null) return [];
    const w = Math.max(1, width);
    const inner = Math.max(1, w - 2 - PANEL_PADDING * 2);
    const rows = renderKanbanBoard(focused.cards, inner);
    const border = style("borderMuted");
    const horizontal = "─".repeat(Math.max(0, w - 2));
    const framed = rows.map((row) => truncateToWidth(`${border("│")} ${row} ${border("│")}`, w));
    return [
      truncateToWidth(border(`┌${horizontal}┐`), w),
      ...framed,
      truncateToWidth(border(`└${horizontal}┘`), w),
    ];
  }

  invalidate(): void {}
}

function renderKanbanBoard(cards: ReadonlyArray<KanbanCard>, innerWidth: number): string[] {
  const columnWidth = Math.max(1, Math.floor((innerWidth - COLUMN_GAP.length * (KANBAN_COLUMNS.length - 1)) / KANBAN_COLUMNS.length));
  const columns = KANBAN_COLUMNS.map((column) => renderColumn(column, cards.filter((card) => card.status === column.status), columnWidth));
  const height = Math.max(...columns.map((column) => column.length));
  const rows: string[] = [];
  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    const cells = columns.map((column) => fitToWidth(column[rowIndex] ?? "", columnWidth));
    rows.push(fitToWidth(cells.join(COLUMN_GAP), innerWidth));
  }
  return rows;
}

function renderColumn(column: { readonly title: string; readonly cardColor: ColorName }, cards: ReadonlyArray<KanbanCard>, columnWidth: number): string[] {
  const header = style("dim")(truncateToWidth(`${column.title} (${cards.length})`, columnWidth));
  const rows = cards.slice(0, MAX_ROWS_PER_COLUMN).map((card) => style(column.cardColor)(truncateToWidth(card.content, columnWidth)));
  const overflow = cards.length - MAX_ROWS_PER_COLUMN;
  if (overflow > 0) rows.push(style("dim")(`+${overflow} more`));
  return [header, ...rows];
}

function fitToWidth(text: string, width: number): string {
  const fitted = truncateToWidth(text, width);
  return fitted + " ".repeat(Math.max(0, width - visibleWidth(fitted)));
}
