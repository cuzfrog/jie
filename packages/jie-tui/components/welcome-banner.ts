import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { COMMAND_METADATA, type CommandMeta } from "../command-metadata";
import { TuiState, type AgentUiState, type StateStore } from "../state";
import { hintLines } from "./key-hints";
import { style } from "./themes";

export class WelcomeBanner implements Component {
  private readonly stateStore: StateStore;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  render(width: number): string[] {
    if (TuiState.hasChatContent(this.stateStore.getState())) return [];
    const w = Math.max(1, width);
    return splashRows(this.stateStore.getState(), w).map((line) => truncateToWidth(line, w));
  }

  invalidate(): void {}
}

export function welcomeLines(state: TuiState, width: number): string[] {
  const w = Math.max(1, width);
  return [...splashRows(state, w), "", ...keysSection(w)].map((line) => truncateToWidth(line, w));
}

function splashRows(state: TuiState, width: number): string[] {
  return [...headerLines(state, width), "", ...commandSection(width)];
}

function headerLines(state: TuiState, width: number): string[] {
  const identity = identityLines(state);
  if (width < MARK_MIN_WIDTH) return identity;
  const gap = " ".repeat(MARK_GAP);
  const rows: string[] = [];
  for (let i = 0; i < MARK_LINES.length; i++) {
    const art = MARK_LINES[i]!;
    const label = identity[i];
    rows.push(label === undefined ? style("accent")(art) : `${style("accent")(art.padEnd(MARK_WIDTH))}${gap}${label}`);
  }
  return rows;
}

function identityLines(state: TuiState): string[] {
  const lines = [
    `${style("accent")(WORDMARK)}${style("muted")(`  ${TAGLINE}`)}`,
    `${style("warning")(MARK_GLYPH)}${style("muted")(MARK_GLOSS)}`,
  ];
  const team = teamLine(state);
  if (team !== null) lines.push(team);
  return lines;
}

function teamLine(state: TuiState): string | null {
  if (state.teamId === null) return null;
  const roster = Array.from(state.agents.values(), describeAgent).join(ROSTER_SEPARATOR);
  const suffix = roster === "" ? "" : `${ROSTER_SEPARATOR}${roster}`;
  return `${style("accent")(`team ${state.teamId}`)}${style("muted")(suffix)}`;
}

function describeAgent(agent: AgentUiState): string {
  const leader = agent.isLeader ? " (leader)" : "";
  const model = agent.model === null ? "" : ` · ${agent.model.provider}/${agent.model.id}`;
  return `${agent.agentKey}${leader}${model}`;
}

function keysSection(width: number): string[] {
  return [sectionHeading(KEYS_HEADING, width), ...hintLines(width)];
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
  return [sectionHeading(COMMANDS_HEADING, width), ...rows];
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

function sectionHeading(title: string, width: number): string {
  const ruleLength = Math.max(0, width - title.length - 1);
  return `${style("text")(title)} ${style("borderMuted")("─".repeat(ruleLength))}`;
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
const MARK_MIN_WIDTH = MARK_WIDTH + MARK_GAP + WORDMARK.length + 2 + TAGLINE.length;
const COLUMN_GAP = 4;
const COMMANDS_HEADING = "COMMANDS";
const KEYS_HEADING = "KEYS";
const ROSTER_SEPARATOR = " · ";
