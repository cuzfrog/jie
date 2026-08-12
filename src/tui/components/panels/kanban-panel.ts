import { matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { Actions, type Action, TuiState, type StateStore, type KanbanEditField } from "../../state";
import type { KanbanCard, KanbanStatus } from "../../../platform";
import { type TuiComponent } from "../..";
import { Panel } from "./panel";
import { style, strikethrough, type ColorName } from "../themes";

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
  expanded: "↑↓ select field · space toggle · tab collapse · ctrl+e edit · ctrl+k close",
  editing: "enter/ctrl+s save · esc cancel",
} as const;
const CTRL_E = "\x05";

const CHIP_BACKGROUND = "\x1b[100m";
const CHIP_BACKGROUND_END = "\x1b[49m";

interface KeyFallback {
  handleInput(data: string): void;
  isShowingAutocomplete(): boolean;
}

export class KanbanPanel extends Panel implements TuiComponent {
  private teamId: string | null = null;
  private kanban: TuiState["kanban"] | null = null;
  private readonly editor: KeyFallback;

  constructor(stateStore: StateStore, editor: KeyFallback) {
    super(stateStore);
    this.editor = editor;
  }

  update(): boolean {
    const state = this.stateStore.getState();
    if (state.teamId === this.teamId && state.kanban === this.kanban) return false;
    this.teamId = state.teamId;
    this.kanban = state.kanban;
    return true;
  }

  handleInput(data: string): void {
    const state = this.stateStore.getState();
    if (state.kanban.view === "panel" && state.kanban.edit === null && !this.editor.isShowingAutocomplete()) {
      const action = resolveKanbanKey(data, state);
      if (action !== null) {
        this.stateStore.dispatch(action);
        return;
      }
    }
    this.editor.handleInput(data);
  }

  protected override isVisible(state: TuiState): boolean {
    return state.teamId !== null && state.kanban.view === "panel";
  }

  protected override body(state: TuiState, inner: number): string[] {
    if (state.kanban.expanded) return renderCardDetail(focusedCard(state), state.kanban.editField, inner);
    return renderKanbanBoard(state, TuiState.kanbanVisibleCards(state), inner);
  }

  protected override topBorder(state: TuiState, width: number): string | null {
    if (!state.kanban.expanded) return null;
    const focused = focusedCard(state);
    return focused === null ? null : renderExpandedTopBorder(focused.id, width, style("borderMuted"));
  }

  protected override hint(state: TuiState, width: number): string | null {
    return renderHint(state, width);
  }
}

function focusedCard(state: TuiState): KanbanCard | null {
  const visible = TuiState.kanbanVisibleCards(state);
  return state.kanban.cursor === null ? null : visible.find((card) => card.id === state.kanban.cursor) ?? null;
}

function renderKanbanBoard(state: TuiState, visible: ReadonlyArray<KanbanCard>, innerWidth: number): string[] {
  const columnWidth = Math.max(1, Math.floor((innerWidth - COLUMN_GAP.length * (KANBAN_COLUMNS.length - 1)) / KANBAN_COLUMNS.length));
  const columns = KANBAN_COLUMNS.map((column) => {
    const cards = visible.filter((card) => card.status === column.status);
    const total = state.kanban.board.filter((card) => card.status === column.status).length;
    return renderColumn(column, cards, total, state.kanban.cursor, columnWidth);
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
    const progress = card.todos ? ` (${countDone(card.todos)}/${card.todos.length})` : "";
    const progressWidth = visibleWidth(progress);
    const contentWidth = Math.max(0, columnWidth - 1 - badgeWidth - refWidth - progressWidth);
    return marker + badge + ref + style(column.cardColor)(truncateToWidth(card.content, contentWidth)) + style("dim")(progress);
  });
  const overflow = total - cards.length;
  if (overflow > 0) rows.push(style("dim")(`+${overflow} more`));
  return [header, ...rows];
}

function countDone(todos: ReadonlyArray<{ readonly done: boolean }>): number {
  return todos.reduce((sum, todo) => (todo.done ? sum + 1 : sum), 0);
}

function renderCardDetail(card: KanbanCard | null, editField: KanbanEditField, innerWidth: number): string[] {
  if (card === null) return [style("muted")("no task selected")];
  const title = renderCardDetailRow(editField === "content", "text", card.content, innerWidth);
  const description = renderCardDetailRow(
    editField === "description",
    card.description ? "muted" : "dim",
    card.description ? `description: ${card.description}` : "description:",
    innerWidth,
  );
  const status = style("muted")(fitToWidth(`status: ${STATUS_LABELS[card.status]}`, innerWidth));
  const scope = style("muted")(fitToWidth(`scope: ${card.scope ?? "team"}`, innerWidth));
  const rows = [title, description, status, scope];
  if (card.externalRef !== undefined) rows.push(style("muted")(fitToWidth(`ref: ${card.externalRef}`, innerWidth)));
  if (card.active_form !== undefined) rows.push(style("muted")(fitToWidth(`active: ${card.active_form}`, innerWidth)));
  if (card.todos !== undefined && card.todos.length > 0) {
    rows.push(style("dim")(fitToWidth("todos:", innerWidth)));
    for (let index = 0; index < card.todos.length; index += 1) {
      const selected = isTodoField(editField) && editField.todoIndex === index;
      rows.push(renderTodo(card.todos[index]!, selected, innerWidth));
    }
  }
  return rows;
}

function renderTodo(todo: { readonly text: string; readonly done: boolean }, selected: boolean, innerWidth: number): string {
  const marker = selected ? style("accent")("▸") : " ";
  const label = `[${todo.done ? "x" : " "}] ${todo.text}`;
  const text = todo.done ? strikethrough(style("muted")(label)) : style("text")(label);
  return fitToWidth(marker + text, innerWidth);
}

function isTodoField(field: KanbanEditField): field is { todoIndex: number } {
  return typeof field === "object";
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
  const text = state.kanban.edit !== null ? HINTS.editing : state.kanban.expanded ? HINTS.expanded : HINTS.collapsed;
  return truncateToWidth(style("dim")(text), width);
}

function fitToWidth(text: string, width: number): string {
  return truncateToWidth(text, width, "", true);
}

function resolveKanbanKey(data: string, state: TuiState): Action | null {
  if (matchesKey(data, "esc") && state.kanban.expanded) return Actions.toggleKanbanExpand();
  if (matchesKey(data, "tab")) return Actions.toggleKanbanExpand();
  if (state.kanban.expanded) {
    if (matchesKey(data, "up")) return Actions.moveKanbanEditField("up");
    if (matchesKey(data, "down")) return Actions.moveKanbanEditField("down");
    if (matchesKey(data, "space")) return resolveKanbanToggle(state);
    if (data === CTRL_E && state.kanban.cursor !== null && typeof state.kanban.editField === "string") {
      return Actions.commitKanbanEdit(state.kanban.cursor, state.kanban.editField);
    }
    return null;
  }
  if (matchesKey(data, "up")) return Actions.moveKanbanCursor("up");
  if (matchesKey(data, "down")) return Actions.moveKanbanCursor("down");
  if (matchesKey(data, "left")) return Actions.moveKanbanCursor("left");
  if (matchesKey(data, "right")) return Actions.moveKanbanCursor("right");
  if (data === CTRL_E && state.kanban.cursor !== null) return Actions.commitKanbanEdit(state.kanban.cursor);
  return null;
}

function resolveKanbanToggle(state: TuiState): Action | null {
  const field = state.kanban.editField;
  if (!isTodoField(field)) return null;
  const card = focusedCard(state);
  if (card === null || card.todos === undefined) return null;
  const todo = card.todos[field.todoIndex];
  if (todo === undefined) return null;
  return Actions.toggleKanbanTodo(card.id, todo.text);
}
