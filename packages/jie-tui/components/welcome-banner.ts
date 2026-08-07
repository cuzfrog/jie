import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import type { CommandResult } from "@cuzfrog/jie-platform";
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
  return joinSections([headerLines(state, w), helpHintSection()], w);
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

function headerLines(state: TuiStateType, width: number): string[] {
  const identity = identityLines(state);
  const minWidth = MARK_WIDTH + MARK_GAP + visibleWidth(identity[0]);
  if (width < minWidth) return identity;
  const gap = " ".repeat(MARK_GAP);
  const rows: string[] = [];
  for (let i = 0; i < MARK_LINES.length; i++) {
    const art = MARK_LINES[i]!;
    const label = identity[i];
    rows.push(label === undefined ? style("accent")(art) : `${style("accent")(art.padEnd(MARK_WIDTH))}${gap}${label}`);
  }
  return rows;
}

function identityLines(state: TuiStateType): string[] {
  const version = state.version === "" ? "" : ` v${state.version}`;
  const lines = [
    `${style("accent")(WORDMARK)}${style("muted")(`${version}  ${TAGLINE}`)}`,
    `${style("warning")(MARK_GLYPH)}${style("muted")(MARK_GLOSS)}`,
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
  const cells = COMMAND_METADATA.map(commandCell);
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

function commandCell(command: CommandMeta): CommandCell {
  const argument = command.argumentHint === undefined ? "" : ` ${style("warning")(command.argumentHint)}`;
  const text = `${style("accent")(`/${command.name}`)}${argument}${style("muted")(`  ${command.description}`)}`;
  return { text, width: visibleWidth(text) };
}

interface CommandCell {
  readonly text: string;
  readonly width: number;
}

function maxWidth(cells: ReadonlyArray<CommandCell>): number {
  return cells.reduce((max, cell) => Math.max(max, cell.width), 0);
}

const WORDMARK = "jie";
const TAGLINE = "multi-agent coding, right in your terminal";
const MARK_GLYPH = "界";
const MARK_GLOSS = " (jiè) · boundary; world";
const MARK_LINES: ReadonlyArray<string> = [
  "   █▀▀▀▀█▀▀▀▀█",
  "   █▄▄▄▄█▄▄▄▄█",
  "   █▀▀▀▀█▀▀▀▀█",
  "   ▀▀▀▀▀█▀▀▀▀▀",
  "      ▄██▀█▄",
  "    ▄▀▄▀ █ ▀▄",
  "  ▄▀ ▄▀  █   ▀▄",
];
const MARK_WIDTH = 15;
const MARK_GAP = 4;
const COLUMN_GAP = 4;
const COMMANDS_HEADING = "Commands";
const SHORTCUTS_HEADING = "Shortcuts";
const TEAMS_SEPARATOR = " · ";
