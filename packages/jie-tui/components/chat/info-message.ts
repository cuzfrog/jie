import { type Component } from "@earendil-works/pi-tui";
import { type InfoEntry } from "../../state";
import { helpLines } from "../welcome-banner";

export class InfoMessage implements Component {
  private readonly entry: InfoEntry;

  constructor(entry: InfoEntry) {
    this.entry = entry;
  }

  render(width: number): string[] {
    switch (this.entry.kind) {
      case "help": return helpLines(Math.max(1, width));
    }
  }

  invalidate(): void {}
}
