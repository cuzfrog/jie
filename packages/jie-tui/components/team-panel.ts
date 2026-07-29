import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { TuiState, type AgentId, type AgentUiState, type StateStore } from "../state";
import { contextPercentColor, formatContextPercent, formatModelSegment } from "./footer";
import { SPINNER_FRAMES, SPINNER_INTERVAL_MS, style } from "./themes";

type RowCells = readonly [string, string, string, string, string];

const POINTER_GLYPH = "▸";
const LEADER_LABEL = "leader";
const COLUMN_GAP = "  ";
const EMPTY_CELL = "—";
const MODEL_COLUMN = 4;
const DROPPABLE_COLUMNS = [3, 2, 1] as const;

export class TeamPanel implements Component {
  private readonly stateStore: StateStore;

  constructor(stateStore: StateStore) {
    this.stateStore = stateStore;
  }

  render(width: number): string[] {
    const state = this.stateStore.getState();
    if (state.teamId === null || !state.teamPanelVisible) return [];
    const roster = TuiState.rosterOrder(state);
    if (roster.length === 0) return [];
    const w = Math.max(1, width);
    const pointed = state.teamCursorAgentId ?? state.focusedAgentId;
    const allRows = [headerCells(), ...roster.map((agent) => rowCells(agent, pointed, state.focusedAgentId))];
    const visible = visibleColumns(allRows, w);
    const widths = columnWidths(allRows, visible);
    return [style("borderMuted")("─".repeat(w)), ...allRows.map((cells) => layoutRow(cells, visible, widths, w))];
  }

  invalidate(): void {}
}

function headerCells(): RowCells {
  return [style("dim")("agent"), style("dim")("ctx"), style("dim")("tools"), style("dim")("subscribe"), style("dim")("model")];
}

function rowCells(agent: AgentUiState, pointed: AgentId | null, focused: AgentId | null): RowCells {
  return [identityCell(agent, pointed, focused), contextCell(agent), listCell(agent.tools), listCell(agent.subscribe), modelCell(agent)];
}

function identityCell(agent: AgentUiState, pointed: AgentId | null, focused: AgentId | null): string {
  const isPointed = agent.agentId === pointed;
  const isFocused = agent.agentId === focused;
  const pointer = isPointed ? style("accent")(POINTER_GLYPH) : " ";
  const key = isPointed || isFocused ? style("accent")(agent.agentKey) : agent.agentKey;
  const leader = agent.isLeader ? ` ${style("dim")(LEADER_LABEL)}` : "";
  const queue = agent.queue.length > 0 ? ` ${style("muted")(`q${agent.queue.length}`)}` : "";
  return `${pointer} ${key}${leader} ${statusGlyph(agent)}${queue}`;
}

function statusGlyph(agent: AgentUiState): string {
  if (agent.status === "busy") return style("accent")(spinnerFrame());
  if (agent.lastStopReason === "error") return style("error")("✗");
  return style("muted")("·");
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

function visibleColumns(allRows: ReadonlyArray<RowCells>, width: number): number[] {
  const visible = [0, 1, 2, 3, MODEL_COLUMN];
  for (const column of DROPPABLE_COLUMNS) {
    if (naturalWidth(allRows, visible) <= width) break;
    visible.splice(visible.indexOf(column), 1);
  }
  return visible;
}

function naturalWidth(allRows: ReadonlyArray<RowCells>, visible: number[]): number {
  const cells = columnWidths(allRows, visible).reduce((sum, columnWidth) => sum + columnWidth, 0);
  return cells + COLUMN_GAP.length * (visible.length - 1);
}

function columnWidths(allRows: ReadonlyArray<RowCells>, visible: number[]): number[] {
  return visible.map((column) => Math.max(...allRows.map((cells) => visibleWidth(cells[column]))));
}

function layoutRow(cells: RowCells, visible: number[], widths: number[], width: number): string {
  let left = "";
  for (let i = 0; i < visible.length - 1; i++) {
    if (i > 0) left += COLUMN_GAP;
    const cell = cells[visible[i]];
    const padding = widths[i] - visibleWidth(cell);
    left += padding > 0 ? cell + " ".repeat(padding) : cell;
  }
  const model = cells[visible[visible.length - 1]];
  const modelWidth = visibleWidth(model);
  if (visibleWidth(left) + COLUMN_GAP.length + modelWidth <= width) {
    return left + " ".repeat(width - visibleWidth(left) - modelWidth) + model;
  }
  return truncateToWidth(`${left}${COLUMN_GAP}${model}`, width);
}
