import { truncateToWidth, type Component } from "@earendil-works/pi-tui";
import type { KanbanCard, KanbanStatus } from "@cuzfrog/jie-platform";
import { type StateStore } from "../../state";
import { strikethrough, style, type ColorName } from "../themes";

const MAX_VISIBLE_CARDS = 6;
const TODO_TITLE = "Todo:";

const CARD_STYLES: { readonly [K in KanbanStatus]: { readonly glyph: string; readonly glyphColor: ColorName; readonly textColor: ColorName } } = {
  pending: { glyph: "·", glyphColor: "muted", textColor: "text" },
  in_progress: { glyph: "▸", glyphColor: "accent", textColor: "text" },
  in_review: { glyph: "◉", glyphColor: "warning", textColor: "warning" },
  completed: { glyph: "✓", glyphColor: "muted", textColor: "muted" },
};

export class KanbanList implements Component {
  private readonly stateStore: StateStore;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  render(width: number): string[] {
    const state = this.stateStore.getState();
    if (state.teamId === null || state.kanbanView !== "list") return [];
    const cards = state.kanbanBoard;
    if (cards.length === 0) return [];
    const w = Math.max(1, width);
    return [
      style("accent")(TODO_TITLE),
      ...cards.slice(0, MAX_VISIBLE_CARDS).map((card) => renderCard(card, w)),
    ];
  }

  invalidate(): void {}
}

function renderCard(card: KanbanCard, width: number): string {
  const entry = CARD_STYLES[card.status];
  const glyph = style(entry.glyphColor)(entry.glyph);
  const scopeBadge = card.scope === "session" ? "[E] " : "";
  const label = `${card.id} ${scopeBadge}${card.content}`;
  const colored = style(entry.textColor)(label);
  const text = card.status === "completed" ? strikethrough(colored) : colored;
  return truncateToWidth(`${glyph} ${text}`, width);
}
