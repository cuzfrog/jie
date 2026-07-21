import { truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { TuiState, type StateStore } from "../../state";
import type { TodoStatus } from "../../todo";
import { type ColorName, style } from "../themes";

const MAX_VISIBLE_TODOS = 6;

const TODO_STYLES: { readonly [K in TodoStatus]: { readonly glyph: string; readonly glyphColor: ColorName; readonly textColor: ColorName } } = {
  pending: { glyph: "·", glyphColor: "muted", textColor: "text" },
  in_progress: { glyph: "▶", glyphColor: "accent", textColor: "text" },
  completed: { glyph: "✓", glyphColor: "muted", textColor: "muted" },
};

export class TodoList implements Component {
  private readonly stateStore: StateStore;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  render(width: number): string[] {
    const focused = TuiState.getFocusedAgent(this.stateStore.getState());
    if (focused === null) return [];
    const todos = focused.todos;
    if (todos.length === 0) return [];
    const w = Math.max(1, width);
    return todos.slice(0, MAX_VISIBLE_TODOS).map((item) => {
      const entry = TODO_STYLES[item.status];
      return truncateToWidth(`${style(entry.glyphColor)(entry.glyph)} ${style(entry.textColor)(item.content)}`, w);
    });
  }

  invalidate(): void {}
}
