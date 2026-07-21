import { truncateToWidth, wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import type { StateStore } from "../../state";
import { THINKING_LABEL, style } from "../themes";

export class ThinkingBlock implements Component {
  private readonly stateStore: StateStore;
  private text: string;

  constructor(text: string, stateStore: StateStore) {
    this.text = text;
    this.stateStore = stateStore;
  }

  update(text: string): void {
    this.text = text;
  }

  render(width: number): string[] {
    const w = Math.max(1, width);
    if (!this.stateStore.getState().thinkingExpanded) return [truncateToWidth(style("thinkingText")(THINKING_LABEL), w)];
    return [style("thinkingText")(THINKING_LABEL), ...wrapTextWithAnsi(style("thinkingText")(this.text), w)];
  }

  invalidate(): void {}
}
