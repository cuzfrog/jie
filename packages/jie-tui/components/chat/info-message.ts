import { type Component } from "@earendil-works/pi-tui";
import { type InfoEntry, type StateStore } from "../../state";
import { welcomeLines } from "../welcome-banner";

export class InfoMessage implements Component {
  private readonly stateStore: StateStore;
  private readonly entry: InfoEntry;

  constructor(stateStore: StateStore, entry: InfoEntry) {
    this.stateStore = stateStore;
    this.entry = entry;
  }

  render(width: number): string[] {
    switch (this.entry.kind) {
      case "help": return welcomeLines(this.stateStore.getState(), Math.max(1, width));
    }
  }

  invalidate(): void {}
}
