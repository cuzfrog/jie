import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import type { CommandResult } from "../../platform";
import { COMMAND_METADATA, type CommandMeta } from "../command-metadata";
import { TuiState, type StateStore, type TuiState as TuiStateType } from "../state";
import { hintLines } from "./key-hints";
import { style } from "./themes";

type InstalledTeams = CommandResult<"getTeamInfo">["installed"];

export class WelcomeBanner implements Component {
  private readonly stateStore: StateStore;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  render(width: number): string[] {
    if (TuiState.hasChatContent(this.stateStore.getState())) return [];
    return welcomeLines(this.stateStore.getState(), width);
  }

  invalidate(): void {}
}

export function welcomeLines(state: TuiStateType, width: number): string[] {
  const w = Math.max(1, width);
  return joinSections([identityLines(state), helpHintSection()], w);
}

function helpHintSection(): string[] {
  return [`${style("accent")("/help")}${style("muted")(" to show commands and shortcuts")}`];
}

export function helpLines(width: number): string[] {
  const w = Math.max(1, width);
  return joinSections(infoSections(w), w);
}

function infoSections(width: number): string[][] {
  return [commandSection(width), shortcutsSection(width)];
}

function joinSections(sections: ReadonlyArray<ReadonlyArray<string>>, width: number): string[] {
  return sections.flatMap((section, index) => (index === 0 ? [...section] : ["", ...section])).map((line) => truncateToWidth(line, width));
}

function identityLines(state: TuiStateType): string[] {
  const version = state.version === "" ? "" : ` · v${state.version}`;
  const lines = [
    `${style("accent")(MARK_GLYPH)}${style("muted")(` (jiè)${version}  ${TAGLINE}`)}`,
  ];
  const teams = teamsLine(state);
  if (teams !== null) lines.push(teams);
  return lines;
}

function teamsLine(state: TuiStateType): string | null {
  const installed = state.installedTeams;
  if (installed === null || installed.length === 0) return null;
  const current = installed.find((team) => team.id === state.teamId);
  const rest = installed.filter((team) => team.id !== state.teamId);
  const ordered: InstalledTeams = current === undefined ? installed : [current, ...rest];
  const list = ordered.map((team) => `${team.id}(${team.agentCount})`).join(TEAMS_SEPARATOR);
  return `${style("accent")("Teams: ")}${style("muted")(list)}`;
}

function shortcutsSection(width: number): string[] {
  return [style("text")(SHORTCUTS_HEADING), ...hintLines(width)];
}

function commandSection(width: number): string[] {
  const cells = COMMAND_METADATA.flatMap(commandCells);
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

interface CommandCell {
  readonly text: string;
  readonly width: number;
}

function maxWidth(cells: ReadonlyArray<CommandCell>): number {
  return cells.reduce((max, cell) => Math.max(max, cell.width), 0);
}

const MARK_GLYPH = "界";
const TAGLINE = "native multi-agent coding";
const COLUMN_GAP = 4;
const COMMANDS_HEADING = "Commands";
const SHORTCUTS_HEADING = "Shortcuts";
const TEAMS_SEPARATOR = " · ";
