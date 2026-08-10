import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { KanbanCard, KanbanStatus } from "../../../platform";
import { TuiState, type StateStore } from "../../state";
import { type TuiComponent } from "../..";
import { Panel } from "./panel";
import { style, type ColorName } from "../themes";

const COLUMN_GAP = "  ";
const STATUS_LABELS: { readonly [K in KanbanStatus]: string } = {
  pending: "pending",
  in_progress: "in_progress",
  in_review: "in_review",
  completed: "completed",
};

const KANBAN_COLUMNS: ReadonlyArray<{ readonly status: KanbanStatus; readonly title: string; readonly cardColor: ColorName }> = [
  { status: "pending", title: "Pending", cardColor: "text" },
  { status: "in_progress", title: "In Progress", cardColor: "accent" },
  { status: "in_review", title: "In Review", cardColor: "warning" },
  { status: "completed", title: "Done", cardColor: "muted" },
];

const HINTS = {
  collapsed: "↑↓←-> move · tab expand · ctrl+e edit · ctrl+k close",
  expanded: "↑↓ select field · tab collapse · ctrl+e edit · ctrl+k close",
  editing: "enter/ctrl+s save · esc cancel",
} as const;

const CHIP_BACKGROUND = "\x1b[100m";
const CHIP_BACKGROUND_END = "\x1b[49m";

export class KanbanPanel extends Panel implements TuiComponent {
  private teamId: string | null = null;
  private kanbanView: "hidden" | "list" | "panel" = "hidden";
  private kanbanExpanded = false;
  private kanbanBoard: ReadonlyArray<KanbanCard> = [];
  private kanbanCursor: string | null = null;
  private kanbanEditField: "content" | "description" = "content";
  private kanbanEdit: string | null = null;

  constructor(stateStore: StateStore) {
    super(stateStore);
  }

  update(): boolean {
    const state = this.stateStore.getState();
    if (state.teamId === this.teamId && state.kanbanView === this.kanbanView && state.kanbanExpanded === this.kanbanExpanded && state.kanbanBoard === this.kanbanBoard && state.kanbanCursor === this.kanbanCursor && state.kanbanEditField === this.kanbanEditField && state.kanbanEdit === this.kanbanEdit) return false;
    this.teamId = state.teamId;
    this.kanbanView = state.kanbanView;
    this.kanbanExpanded = state.kanbanExpanded;
    this.kanbanBoard = state.kanbanBoard;
    this.kanbanCursor = state.kanbanCursor;
    this.kanbanEditField = state.kanbanEditField;
    this.kanbanEdit = state.kanbanEdit;
    return true;
  }

  protected isVisible(state: TuiState): boolean {
    return state.teamId !== null && state.kanbanView === "panel";
  }

  protected body(state: TuiState, inner: number): string[] {
    if (state.kanbanExpanded) return renderCardDetail(focusedCard(state), state.kanbanEditField, inner);
    return renderKanbanBoard(state, TuiState.kanbanVisibleCards(state), inner);
  }

  protected topBorder(state: TuiState, width: number): string | null {
    if (!state.kanbanExpanded) return null;
    const focused = focusedCard(state);
    return focused === null ? null : renderExpandedTopBorder(focused.id, width, style("borderMuted"));
  }

  protected hint(state: TuiState, width: number): string | null {
    return renderHint(state, width);
  }
}

function focusedCard(state: TuiState): KanbanCard | null {
  const visible = TuiState.kanbanVisibleCards(state);
  return state.kanbanCursor === null ? null : visible.find((card) => card.id === state.kanbanCursor) ?? null;
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
    const badge = card.scope === "session" ? style("warning")("E ") : "";
    const badgeWidth = card.scope === "session" ? 2 : 0;
    const ref = card.externalRef !== undefined ? style("accent")(`${card.externalRef} `) : "";
    const refWidth = card.externalRef !== undefined ? visibleWidth(card.externalRef) + 1 : 0;
    return marker + badge + ref + style(column.cardColor)(truncateToWidth(card.content, Math.max(0, columnWidth - 1 - badgeWidth - refWidth)));
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
  const scope = style("muted")(fitToWidth(`scope: ${card.scope ?? "team"}`, innerWidth));
  const rows = [title, description, status, scope];
  if (card.externalRef !== undefined) rows.push(style("muted")(fitToWidth(`ref: ${card.externalRef}`, innerWidth)));
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
