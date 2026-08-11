import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { CommandMeta, CommandRegistry } from "../../command";
import { type StateStore, type TuiState } from "../../state";
import { type TuiComponent } from "../..";
import { hintLines } from "../elements";
import { Panel } from "./panel";
import { style } from "../themes";

const HINT = "Type /help to close.";
const COMMANDS_HEADING = "Commands";
const SHORTCUTS_HEADING = "Shortcuts";
const COLUMN_GAP = 4;

export class HelpPanel extends Panel implements TuiComponent {
  private helpPanelVisible = false;
  private readonly commandRegistry: CommandRegistry;

  constructor(stateStore: StateStore, commandRegistry: CommandRegistry) {
    super(stateStore);
    this.commandRegistry = commandRegistry;
  }

  update(): boolean {
    const visible = this.stateStore.getState().helpPanelVisible;
    if (visible === this.helpPanelVisible) return false;
    this.helpPanelVisible = visible;
    return true;
  }

  protected override isVisible(state: TuiState): boolean {
    return state.helpPanelVisible;
  }

  protected override body(_state: TuiState, inner: number): string[] {
    return helpLines(inner, this.commandRegistry.metadata);
  }

  protected override hint(_state: TuiState, width: number): string | null {
    return truncateToWidth(style("dim")(HINT), width);
  }
}

function helpLines(width: number, metadata: ReadonlyArray<CommandMeta>): string[] {
  const w = Math.max(1, width);
  return joinSections([commandSection(w, metadata), shortcutsSection(w)], w);
}

function joinSections(sections: ReadonlyArray<ReadonlyArray<string>>, width: number): string[] {
  return sections.flatMap((section, index) => (index === 0 ? [...section] : ["", ...section])).map((line) => truncateToWidth(line, width));
}

function commandSection(width: number, metadata: ReadonlyArray<CommandMeta>): string[] {
  const cells = metadata.flatMap(commandCells);
  const half = Math.ceil(cells.length / 2);
  const left = cells.slice(0, half);
  const right = cells.slice(half);
  const leftWidth = maxWidth(left);
  const rightWidth = maxWidth(right);
  const rows: string[] = [];
  if (rightWidth > 0 && leftWidth + COLUMN_GAP + rightWidth <= width) {
    const gap = " ".repeat(COLUMN_GAP);
    for (let i = 0; i < left.length; i++) {
      const cell = left[i]!;
      const pair = right[i];
      rows.push(pair === undefined ? `  ${cell.text}` : `  ${cell.text}${" ".repeat(leftWidth - cell.width)}${gap}${pair.text}`);
    }
  } else {
    for (const cell of cells) rows.push(`  ${cell.text}`);
  }
  return [style("text")(COMMANDS_HEADING), ...rows];
}

function shortcutsSection(width: number): string[] {
  return [style("text")(SHORTCUTS_HEADING), ...hintLines(width)];
}

interface CommandCell {
  readonly text: string;
  readonly width: number;
}

function commandCells(command: CommandMeta): CommandCell[] {
  const canonical = commandCell(command.name, command.description, command.argumentHint);
  const aliases = (command.aliases ?? []).map((alias) => commandCell(alias, `alias of /${command.name}`, command.argumentHint));
  return [canonical, ...aliases];
}

function commandCell(name: string, description: string, argumentHint: string | undefined): CommandCell {
  const argument = argumentHint === undefined ? "" : ` ${style("warning")(argumentHint)}`;
  const text = `${style("accent")(`/${name}`)}${argument}${style("muted")(`  ${description}`)}`;
  return { text, width: visibleWidth(text) };
}

function maxWidth(cells: ReadonlyArray<CommandCell>): number {
  return cells.reduce((max, cell) => Math.max(max, cell.width), 0);
}

export { helpLines as _helpLines };
