import { truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { COMMAND_METADATA } from "../../command-metadata";
import { type InfoEntry, type StateStore, type TuiState } from "../../state";
import { style } from "../themes";
import { welcomeLines } from "../welcome-banner";
import { hintLines } from "../key-hints";

export class InfoMessage implements Component {
  private readonly stateStore: StateStore;
  private readonly entry: InfoEntry;

  constructor(stateStore: StateStore, entry: InfoEntry) {
    this.stateStore = stateStore;
    this.entry = entry;
  }

  render(width: number): string[] {
    const w = Math.max(1, width);
    switch (this.entry.kind) {
      case "help": return helpLines(this.stateStore.getState(), w);
    }
  }

  invalidate(): void {}
}

function helpLines(state: TuiState, width: number): string[] {
  const lines: string[] = [...welcomeLines(state), ...hintLines(width)];
  for (const command of COMMAND_METADATA) {
    const name = command.argumentHint === undefined ? `/${command.name}` : `/${command.name} ${command.argumentHint}`;
    lines.push(`${style("accent")(name)}${style("muted")(`  ${command.description}`)}`);
  }
  return lines.map((line) => truncateToWidth(line, width));
}
