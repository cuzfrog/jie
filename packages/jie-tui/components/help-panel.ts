import { type Component } from "@earendil-works/pi-tui";
import { type StateStore } from "../state";
import { Box } from "./box";
import { helpLines } from "./welcome-banner";
import { style } from "./themes";

const HINT = "Type /help to close.";

export class HelpPanel implements Component {
  private readonly stateStore: StateStore;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  render(width: number): string[] {
    const state = this.stateStore.getState();
    if (!state.helpPanelVisible) return [];
    const w = Math.max(1, width);
    const inner = Math.max(1, w - 4);
    const rows = [...helpLines(inner), style("dim")(HINT)];
    return new Box(rows).render(w);
  }

  invalidate(): void {}
}
