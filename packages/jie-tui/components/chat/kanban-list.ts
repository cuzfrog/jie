import { truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { TuiState, type StateStore } from "../../state";
import type { KanbanStatus } from "../../kanban";
import { type ColorName, style } from "../themes";

const MAX_VISIBLE_CARDS = 6;

const CARD_STYLES: { readonly [K in KanbanStatus]: { readonly glyph: string; readonly glyphColor: ColorName; readonly textColor: ColorName } } = {
  pending: { glyph: "·", glyphColor: "muted", textColor: "text" },
  in_progress: { glyph: "▶", glyphColor: "accent", textColor: "text" },
  completed: { glyph: "✓", glyphColor: "muted", textColor: "muted" },
};

export class KanbanList implements Component {
  private readonly stateStore: StateStore;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  render(width: number): string[] {
    const focused = TuiState.getFocusedAgent(this.stateStore.getState());
    if (focused === null) return [];
    const cards = focused.cards;
    if (cards.length === 0) return [];
    const w = Math.max(1, width);
    return cards.slice(0, MAX_VISIBLE_CARDS).map((item) => {
      const entry = CARD_STYLES[item.status];
      return truncateToWidth(`${style(entry.glyphColor)(entry.glyph)} ${style(entry.textColor)(item.content)}`, w);
    });
  }

  invalidate(): void {}
}
