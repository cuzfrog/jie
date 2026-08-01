import { truncateToWidth, wrapTextWithAnsi, type Component } from "@earendil-works/pi-tui";
import type { MessageBlock, StateStore } from "../../state";
import { THINKING_LABEL, style } from "../themes";

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
    const label = this.block.durationMs === undefined ? THINKING_LABEL : `Thought for ${formatThinkingDuration(this.block.durationMs)}`;
    if (!this.stateStore.getState().thinkingExpanded) return [truncateToWidth(style("thinkingText")(label), w)];
    return [style("thinkingText")(label), ...wrapTextWithAnsi(style("thinkingText")(this.block.text), w)];
  }

  invalidate(): void {}
}

function formatThinkingDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) {
    const seconds = Math.round(ms / 100) / 10;
    return `${seconds % 1 === 0 ? seconds.toFixed(0) : seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export { formatThinkingDuration as _formatThinkingDuration };
