import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import type { KanbanCard, KanbanStatus } from "@cuzfrog/jie-platform";
import { TuiState, type StateStore } from "../state";
import { style, type ColorName } from "./themes";

const PANEL_PADDING = 1;
const COLUMN_GAP = "  ";
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
  collapsed: "↑↓←→ move · tab expand · ctrl+e edit · ctrl+k close",
  expanded: "↑↓ select field · tab collapse · ctrl+e edit · ctrl+k close",
  editing: "enter/ctrl+s save · esc cancel",
} as const;

const CHIP_BACKGROUND = "\x1b[100m";
const CHIP_BACKGROUND_END = "\x1b[49m";

export class KanbanPanel implements Component {
  private readonly stateStore: StateStore;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  render(width: number): string[] {
    const state = this.stateStore.getState();
    if (state.teamId === null || state.kanbanView !== "panel") return [];
    const w = Math.max(1, width);
    const inner = Math.max(1, w - 2 - PANEL_PADDING * 2);
    const visible = TuiState.kanbanVisibleCards(state);
    const focused = state.kanbanCursor === null ? null : visible.find((card) => card.id === state.kanbanCursor) ?? null;
    const border = style("borderMuted");
    const horizontal = "─".repeat(Math.max(0, w - 2));
    const expandedTop = state.kanbanExpanded && focused !== null ? renderExpandedTopBorder(focused.id, w, border) : null;
    const rows = state.kanbanExpanded ? renderCardDetail(focused, state.kanbanEditField, inner) : renderKanbanBoard(state, visible, inner);
    const framed = rows.map((row) => {
      const padded = fitToWidth(row, inner);
      return truncateToWidth(`${border("│")} ${padded} ${border("│")}`, w);
    });
    return [
      expandedTop ?? truncateToWidth(border(`┌${horizontal}┐`), w),
      ...framed,
      truncateToWidth(border(`└${horizontal}┘`), w),
      renderHint(state, w),
    ];
  }

  invalidate(): void {}
}

function renderKanbanBoard(state: TuiState, visible: ReadonlyArray<KanbanCard>, innerWidth: number): string[] {
  const columnWidth = Math.max(1, Math.floor((innerWidth - COLUMN_GAP.length * (KANBAN_COLUMNS.length - 1)) / KANBAN_COLUMNS.length));
  const columns = KANBAN_COLUMNS.map((column) => {
    const cards = visible.filter((card) => card.status === column.status);
    const total = state.kanbanBoard.filter((card) => card.status === column.status).length;
    return renderColumn(column, cards, total, state.kanbanCursor, columnWidth);
  });
  const height = Math.max(...columns.map((column) => column.length));
  const rows: string[] = [];
  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    const cells = columns.map((column) => fitToWidth(column[rowIndex] ?? "", columnWidth));
    rows.push(fitToWidth(cells.join(COLUMN_GAP), innerWidth));
  }
  return rows;
}

function renderColumn(column: { readonly title: string; readonly cardColor: ColorName }, cards: ReadonlyArray<KanbanCard>, total: number, cursorId: string | null, columnWidth: number): string[] {
  const header = style("dim")(truncateToWidth(`${column.title} (${total})`, columnWidth));
  const rows = cards.map((card) => {
    const marker = card.id === cursorId ? style("accent")("▸") : " ";
    return marker + style(column.cardColor)(truncateToWidth(card.content, Math.max(0, columnWidth - 1)));
  });
  const overflow = total - cards.length;
  if (overflow > 0) rows.push(style("dim")(`+${overflow} more`));
  return [header, ...rows];
}

function renderCardDetail(card: KanbanCard | null, field: "content" | "description", innerWidth: number): string[] {
  if (card === null) return [style("muted")("no task selected")];
  const title = renderCardDetailRow(field === "content", "text", card.content, innerWidth);
  const description = renderCardDetailRow(field === "description", card.description ? "muted" : "dim", card.description ? `description: ${card.description}` : "description:", innerWidth);
  const status = style("muted")(fitToWidth(`status: ${STATUS_LABELS[card.status]}`, innerWidth));
  const rows = [title, description, status];
  if (card.active_form !== undefined) rows.push(style("muted")(fitToWidth(`active: ${card.active_form}`, innerWidth)));
  return rows;
}

function renderCardDetailRow(selected: boolean, color: ColorName, text: string, innerWidth: number): string {
  const marker = selected ? style("accent")("▸") : " ";
  const line = marker + style(color)(text);
  return fitToWidth(line, innerWidth);
}

function renderExpandedTopBorder(cardId: string, width: number, border: (text: string) => string): string {
  const chip = ` ${cardId} `;
  const chipWidth = visibleWidth(chip);
  const horizontal = "─".repeat(Math.max(0, width - 2 - chipWidth));
  return `${border("┌")}${CHIP_BACKGROUND}${chip}${CHIP_BACKGROUND_END}${border(`${horizontal}┐`)}`;
}

function renderHint(state: TuiState, width: number): string {
  const text = state.kanbanEdit !== null ? HINTS.editing : state.kanbanExpanded ? HINTS.expanded : HINTS.collapsed;
  return truncateToWidth(style("dim")(text), width);
}

function fitToWidth(text: string, width: number): string {
  return truncateToWidth(text, width, "", true);
}
