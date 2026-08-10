import { truncateToWidth } from "@earendil-works/pi-tui";
import type { StateStore } from "../../state";
import { type TuiComponent } from "../..";
import { style } from "../themes";

export class StatusLine implements TuiComponent {
  private readonly stateStore: StateStore;
  private transientMessage: string | null = null;
  private errorBanner: string | null = null;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  update(): boolean {
    const state = this.stateStore.getState();
    if (state.transientMessage === this.transientMessage && state.errorBanner === this.errorBanner) return false;
    this.transientMessage = state.transientMessage;
    this.errorBanner = state.errorBanner;
    return true;
  }

  render(width: number): string[] {
    const state = this.stateStore.getState();
    const w = Math.max(1, width);
    const lines: string[] = [];
    const transient = state.transientMessage;
    if (transient !== null && transient !== "") lines.push(style("muted")(truncateToWidth(transient, w)));
    const error = state.errorBanner;
    if (error !== null && error !== "") lines.push(style("error")(truncateToWidth(error, w)));
    return lines;
  }

  invalidate(): void {}
}
