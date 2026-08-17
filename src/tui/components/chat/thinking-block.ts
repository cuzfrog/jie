import { truncateToWidth, wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import type { MessageBlock, StateStore } from "../../state";
import { THINKING_LABEL, style } from "../themes";
import { formatDuration } from "../elements";

export class ThinkingBlock implements Component {
  private readonly stateStore: StateStore;
  private block: MessageBlock;

  constructor(block: MessageBlock, stateStore: StateStore) {
    this.block = block;
    this.stateStore = stateStore;
  }

  update(block: MessageBlock): void {
    this.block = block;
  }

  render(width: number): string[] {
    const w = Math.max(1, width);
    const label = this.block.durationMs === undefined ? THINKING_LABEL : `Thought for ${formatDuration(this.block.durationMs)}`;
    if (!this.stateStore.getState().thinkingExpanded) return [truncateToWidth(style("thinkingText")(label), w)];
    return [style("thinkingText")(label), ...wrapTextWithAnsi(style("thinkingText")(this.block.text), w)];
  }

  invalidate(): void {}
}
