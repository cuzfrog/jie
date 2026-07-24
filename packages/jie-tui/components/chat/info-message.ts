import { truncateToWidth, type Component } from "@earendil-works/pi-tui";
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
  for (const [name, description] of COMMAND_SUMMARY) {
    lines.push(`${style("accent")(name)}${style("muted")(`  ${description}`)}`);
  }
  return lines.map((line) => truncateToWidth(line, width));
}

const COMMAND_SUMMARY: ReadonlyArray<readonly [string, string]> = [
  ["/help", "show this help"],
  ["/clear", "clear the conversation"],
  ["/exit", "quit jie"],
  ["/team <teamId>", "switch the active team"],
  ["/resume <sessionId>", "resume a session of the loaded team"],
  ["/rename <name>", "name the active session"],
  ["/model <provider>/<modelId>", "set the default model"],
  ["/effort <level>", "set the default thinking effort"],
  ["/login <provider> <apiKey>", "store a provider API key"],
  ["/logout [<provider>]", "remove one or all API keys"],
];
