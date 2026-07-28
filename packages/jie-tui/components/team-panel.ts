import { truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import { TuiState, type AgentId, type AgentUiState, type StateStore } from "../state";
import { contextPercentColor, formatContextPercent } from "./footer";
import { SPINNER_FRAMES, SPINNER_INTERVAL_MS, style } from "./themes";

type RowCells = readonly [string, string, string, string, string];

const POINTER_GLYPH = "▸";
const LEADER_MARK = "★";
const COLUMN_GAP = "  ";
const EMPTY_CELL = "—";

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
    const pointed = state.teamCursorAgentId ?? state.focusedAgentId;
    const rows = roster.map((agent) => rowCells(agent, pointed, state.focusedAgentId));
    const widths = columnWidths(rows);
    return rows.map((cells) => truncateToWidth(layoutRow(cells, widths), Math.max(1, width)));
  }

  invalidate(): void {}
}

function rowCells(agent: AgentUiState, pointed: AgentId | null, focused: AgentId | null): RowCells {
  const isPointed = agent.agentId === pointed;
  const isFocused = agent.agentId === focused;
  const pointer = isPointed ? style("accent")(POINTER_GLYPH) : " ";
  const mark = agent.isLeader ? `${style("accent")(LEADER_MARK)} ` : "";
  const key = isPointed || isFocused ? style("accent")(agent.agentKey) : agent.agentKey;
  const identity = `${pointer} ${mark}${key} ${statusGlyph(agent)} ${style("muted")(statusDetail(agent))}`;
  return [identity, listCell(agent.tools), listCell(agent.subscribe), agent.model?.id ?? EMPTY_CELL, contextCell(agent)];
}

function statusGlyph(agent: AgentUiState): string {
  if (agent.status === "busy") return style("accent")(spinnerFrame());
  if (agent.lastStopReason === "error") return style("error")("✗");
  return style("muted")("·");
}

function spinnerFrame(): string {
  return SPINNER_FRAMES[Math.floor(Date.now() / SPINNER_INTERVAL_MS) % SPINNER_FRAMES.length];
}

function statusDetail(agent: AgentUiState): string {
  return agent.queue.length > 0 ? `${agent.role} · q${agent.queue.length}` : agent.role;
}

function listCell(values: ReadonlyArray<string>): string {
  return style("muted")(values.length === 0 ? EMPTY_CELL : values.join(" "));
}

function contextCell(agent: AgentUiState): string {
  const window = agent.model?.contextWindow ?? null;
  return style(contextPercentColor(agent.contextTokensUsed, window))(formatContextPercent(agent.contextTokensUsed, window));
}

function columnWidths(rows: ReadonlyArray<RowCells>): number[] {
  const widths: number[] = [];
  for (let i = 0; i < rows[0].length - 1; i++) {
    widths.push(Math.max(...rows.map((cells) => visibleWidth(cells[i]))));
  }
  return widths;
}

function layoutRow(cells: RowCells, widths: number[]): string {
  let row = "";
  for (let i = 0; i < cells.length; i++) {
    if (i > 0) row += COLUMN_GAP;
    const width = widths[i] ?? 0;
    const padding = width - visibleWidth(cells[i]);
    row += padding > 0 ? cells[i] + " ".repeat(padding) : cells[i];
  }
  return row;
}
