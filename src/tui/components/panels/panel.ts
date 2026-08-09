import { type Component } from "@earendil-works/pi-tui";
import { type StateStore, type TuiState } from "../../state";
import { Box } from "../elements";

export abstract class Panel implements Component {
  protected readonly stateStore: StateStore;

  protected constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  render(width: number): string[] {
    const state = this.stateStore.getState();
    if (!this.isVisible(state)) return [];
    const w = Math.max(1, width);
    const inner = Math.max(1, w - 4);
    const rows = this.body(state, inner);
    if (rows.length === 0) return [];
    const top = this.topBorder(state, w);
    const boxed = new Box(rows, top !== null ? { top } : {}).render(w);
    const hint = this.hint(state, w);
    return hint !== null ? [...boxed, hint] : boxed;
  }

  invalidate(): void {}

  protected abstract isVisible(state: TuiState): boolean;
  protected abstract body(state: TuiState, inner: number): string[];
  protected topBorder(_state: TuiState, _width: number): string | null {
    return null;
  }
  protected hint(_state: TuiState, _width: number): string | null {
    return null;
  }
}
