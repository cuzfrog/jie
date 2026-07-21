import { truncateToWidth, type Component } from "@earendil-works/pi-tui";
import type { StateStore } from "../state";
import { style } from "./themes";

export class StatusLine implements Component {
  private readonly stateStore: StateStore;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
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
