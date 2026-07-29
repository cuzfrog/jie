import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { AgentId, AgentUiState } from "../state";
import { contextPercentColor, formatContextPercent, formatModelSegment } from "./footer";
import { SPINNER_FRAMES, SPINNER_INTERVAL_MS, style } from "./themes";

export type TeamTableColumn = "agent" | "ctx" | "tools" | "subscribe" | "model";

export interface TeamTableOptions {
  readonly pointed: AgentId | null;
  readonly focused: AgentId | null;
  readonly droppable?: ReadonlyArray<TeamTableColumn>;
}

export function renderTeamTable(
  agents: ReadonlyArray<AgentUiState>,
  columns: ReadonlyArray<TeamTableColumn>,
  width: number,
  options: TeamTableOptions,
): string[] {
  const w = Math.max(1, width);
  const allRows = [headerCells(columns), ...agents.map((agent) => rowCells(agent, columns, options.pointed, options.focused))];
  const visible = visibleColumns(allRows, columns, w, options.droppable ?? []);
  const widths = columnWidths(allRows, visible);
  return allRows.map((cells) => layoutRow(cells, visible, widths, w));
}

function headerCells(columns: ReadonlyArray<TeamTableColumn>): string[] {
  return columns.map((column) => style("dim")(column));
}

function rowCells(
  agent: AgentUiState,
  columns: ReadonlyArray<TeamTableColumn>,
  pointed: AgentId | null,
  focused: AgentId | null,
): string[] {
  return columns.map((column) => cell(column, agent, pointed, focused));
}

function cell(column: TeamTableColumn, agent: AgentUiState, pointed: AgentId | null, focused: AgentId | null): string {
  switch (column) {
    case "agent":
      return identityCell(agent, pointed, focused);
    case "ctx":
      return contextCell(agent);
    case "tools":
      return listCell(agent.tools);
    case "subscribe":
      return listCell(agent.subscribe);
    case "model":
      return modelCell(agent);
  }
}

function identityCell(agent: AgentUiState, pointed: AgentId | null, focused: AgentId | null): string {
  const isPointed = agent.agentId === pointed;
  const isFocused = agent.agentId === focused;
  const pointer = isPointed ? style("accent")(POINTER_GLYPH) : " ";
  const key = isPointed || isFocused ? style("accent")(agent.agentKey) : agent.agentKey;
  const leader = agent.isLeader ? ` ${style("dim")(LEADER_LABEL)}` : "";
  const queue = agent.queue.length > 0 ? ` ${style("muted")(`q${agent.queue.length}`)}` : "";
  return `${pointer} ${key}${leader}${statusGlyph(agent)}${queue}`;
}

function statusGlyph(agent: AgentUiState): string {
  if (agent.status === "busy") return ` ${style("accent")(spinnerFrame())}`;
  if (agent.lastStopReason === "error") return ` ${style("error")("✗")}`;
  return "";
}

function spinnerFrame(): string {
  return SPINNER_FRAMES[Math.floor(Date.now() / SPINNER_INTERVAL_MS) % SPINNER_FRAMES.length];
}

function contextCell(agent: AgentUiState): string {
  const window = agent.model?.contextWindow ?? null;
  return style(contextPercentColor(agent.contextTokensUsed, window))(formatContextPercent(agent.contextTokensUsed, window));
}

function listCell(values: ReadonlyArray<string>): string {
  return style("muted")(values.length === 0 ? EMPTY_CELL : values.join(" "));
}

function modelCell(agent: AgentUiState): string {
  return agent.model === null ? style("muted")(EMPTY_CELL) : formatModelSegment(agent.model);
}

function visibleColumns(
  allRows: ReadonlyArray<ReadonlyArray<string>>,
  columns: ReadonlyArray<TeamTableColumn>,
  width: number,
  droppable: ReadonlyArray<TeamTableColumn>,
): number[] {
  const visible = columns.map((_, index) => index);
  for (const column of droppable) {
    if (naturalWidth(allRows, visible) <= width) break;
    const at = visible.indexOf(columns.indexOf(column));
    if (at !== -1) visible.splice(at, 1);
  }
  return visible;
}

function naturalWidth(allRows: ReadonlyArray<ReadonlyArray<string>>, visible: number[]): number {
  const cells = columnWidths(allRows, visible).reduce((sum, columnWidth) => sum + columnWidth, 0);
  return cells + COLUMN_GAP.length * (visible.length - 1);
}

function columnWidths(allRows: ReadonlyArray<ReadonlyArray<string>>, visible: number[]): number[] {
  return visible.map((column) => Math.max(...allRows.map((cells) => visibleWidth(cells[column]))));
}

function layoutRow(cells: ReadonlyArray<string>, visible: number[], widths: number[], width: number): string {
  let left = "";
  for (let i = 0; i < visible.length - 1; i++) {
    if (i > 0) left += COLUMN_GAP;
    const cell = cells[visible[i]];
    const padding = widths[i] - visibleWidth(cell);
    left += padding > 0 ? cell + " ".repeat(padding) : cell;
  }
  const last = cells[visible[visible.length - 1]];
  const lastWidth = visibleWidth(last);
  if (visibleWidth(left) + COLUMN_GAP.length + lastWidth <= width) {
    return left + " ".repeat(width - visibleWidth(left) - lastWidth) + last;
  }
  return truncateToWidth(`${left}${COLUMN_GAP}${last}`, width);
}

const POINTER_GLYPH = "▸";
const LEADER_LABEL = "leader";
const COLUMN_GAP = "  ";
const EMPTY_CELL = "—";
