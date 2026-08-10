import { truncateToWidth } from "@earendil-works/pi-tui";
import { TuiState, type StateStore, type AgentUiState } from "../../state";
import { type TuiComponent } from "../..";
import { singleLine } from "./single-line";
import { style } from "../themes";

const QUEUED_PREFIX = "Queued: ";

export class QueuedPrompts implements TuiComponent {
  private readonly stateStore: StateStore;
  private focused: AgentUiState | null = null;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  update(): boolean {
    const focused = TuiState.getFocusedAgent(this.stateStore.getState());
    if (focused === this.focused) return false;
    this.focused = focused;
    return true;
  }

  render(width: number): string[] {
    const focused = TuiState.getFocusedAgent(this.stateStore.getState());
    if (focused === null || focused.queue.length === 0) return [];
    const w = Math.max(1, width);
    return focused.queue.map((entry) => style("muted")(truncateToWidth(QUEUED_PREFIX + singleLine(entry.text), w)));
  }

  invalidate(): void {}
}
