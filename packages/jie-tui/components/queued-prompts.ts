import { truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { TuiState, type StateStore } from "../state";
import { style } from "./themes";

const QUEUED_PREFIX = "Queued: ";

export class QueuedPrompts implements Component {
  private readonly stateStore: StateStore;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  render(width: number): string[] {
    const focused = TuiState.getFocusedAgent(this.stateStore.getState());
    if (focused === null || focused.queue.length === 0) return [];
    const w = Math.max(1, width);
    return focused.queue.map((prompt) => style("muted")(truncateToWidth(QUEUED_PREFIX + prompt, w)));
  }

  invalidate(): void {}
}
