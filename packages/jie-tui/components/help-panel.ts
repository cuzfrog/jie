import { truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { TuiState, type StateStore } from "../state";
import { helpLines } from "./welcome-banner";
import { style } from "./themes";

const PANEL_PADDING = 1;
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
    const inner = Math.max(1, w - 2 - PANEL_PADDING * 2);
    const rows = [...helpLines(inner), style("dim")(HINT)];
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
