import { truncateToWidth } from "@earendil-works/pi-tui";
import type { KanbanCard, KanbanStatus } from "../../../platform";
import { type StateStore } from "../../state";
import { type TuiComponent } from "../..";
import { strikethrough, style, type ColorName } from "../themes";

const MAX_VISIBLE_CARDS = 6;
const MAX_TODOS_PER_CARD = 5;
const MAX_VISIBLE_LINES = 10;
const KANBAN_TITLE = "Kanban:";

const CARD_STYLES: { readonly [K in KanbanStatus]: { readonly glyph: string; readonly glyphColor: ColorName; readonly textColor: ColorName } } = {
  pending: { glyph: "·", glyphColor: "muted", textColor: "text" },
  in_progress: { glyph: "▸", glyphColor: "accent", textColor: "text" },
  in_review: { glyph: "◉", glyphColor: "warning", textColor: "warning" },
  completed: { glyph: "✓", glyphColor: "muted", textColor: "muted" },
};

export class KanbanList implements TuiComponent {
  private readonly stateStore: StateStore;
  private teamId: string | null = null;
  private kanban: ReturnType<StateStore["getState"]>["kanban"] | null = null;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  update(): boolean {
    const state = this.stateStore.getState();
    if (state.teamId === this.teamId && state.kanban === this.kanban) return false;
    this.teamId = state.teamId;
    this.kanban = state.kanban;
    return true;
  }

  render(width: number): string[] {
    const state = this.stateStore.getState();
    if (state.teamId === null || state.kanban.view !== "list") return [];
    const cards = state.kanban.board;
    if (cards.length === 0) return [];
    const w = Math.max(1, width);
    const allTrees = cards.map((card) => cardTree(card, w));
    const totalLines = allTrees.reduce((sum, tree) => sum + tree.length, 0);
    const willOverflow = totalLines > MAX_VISIBLE_LINES - 1;
    const contentBudget = willOverflow ? MAX_VISIBLE_LINES - 2 : MAX_VISIBLE_LINES - 1;
    const lines: string[] = [];
    let rendered = 0;
    for (let index = 0; index < Math.min(cards.length, MAX_VISIBLE_CARDS); index += 1) {
      const tree = allTrees[index]!;
      if (lines.length + tree.length > contentBudget) break;
      lines.push(...tree);
      rendered += tree.length;
    }
    const result = [style("accent")(KANBAN_TITLE), ...lines];
    if (totalLines > rendered) result.push(truncateToWidth(`+${totalLines - rendered} more`, w));
    return result;
  }

  invalidate(): void {}
}

function cardTree(card: KanbanCard, width: number): string[] {
  const lines: string[] = [renderParent(card, width)];
  if (card.todos !== undefined) {
    const shown = card.todos.slice(0, MAX_TODOS_PER_CARD);
    for (const todo of shown) lines.push(renderTodo(todo, width));
    if (card.todos.length > shown.length) lines.push(truncateToWidth(`  +${card.todos.length - shown.length} more`, width));
  }
  return lines;
}

function countDone(todos: ReadonlyArray<{ readonly done: boolean }>): number {
  return todos.reduce((sum, todo) => (todo.done ? sum + 1 : sum), 0);
}

function renderParent(card: KanbanCard, width: number): string {
  const entry = CARD_STYLES[card.status];
  const glyph = style(entry.glyphColor)(entry.glyph);
  const scopeBadge = card.scope === "session" ? "[E] " : "";
  const refBadge = card.externalRef !== undefined ? `${card.externalRef} ` : "";
  const progress = card.todos ? ` (${countDone(card.todos)}/${card.todos.length})` : "";
  const label = `${refBadge}${card.id} ${scopeBadge}${card.content}${progress}`;
  const colored = style(entry.textColor)(label);
  const text = card.status === "completed" ? strikethrough(colored) : colored;
  return truncateToWidth(`${glyph} ${text}`, width);
}

function renderTodo(todo: { readonly text: string; readonly done: boolean }, width: number): string {
  const label = `[${todo.done ? "x" : " "}] ${todo.text}`;
  const text = todo.done ? strikethrough(style("dim")(label)) : style("text")(label);
  return truncateToWidth(`  ${text}`, width);
}
