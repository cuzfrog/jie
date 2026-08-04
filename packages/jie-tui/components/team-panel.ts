import { truncateToWidth, type Component } from "@earendil-works/pi-tui";
import { TuiState, type StateStore } from "../state";
import { renderTeamTable, type TeamTableColumn } from "./team-table";
import { style } from "./themes";

const PANEL_COLUMNS: ReadonlyArray<TeamTableColumn> = ["agent", "ctx", "tools", "subscribe", "model"];
const DROPPABLE_COLUMNS: ReadonlyArray<TeamTableColumn> = ["subscribe", "tools", "ctx"];
const PANEL_PADDING = 1;

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
    const inner = Math.max(1, w - 2 - PANEL_PADDING * 2);
    const rows = renderTeamTable(roster, PANEL_COLUMNS, inner, {
      pointed: state.teamCursorAgentId ?? state.focusedAgentId,
      focused: state.focusedAgentId,
      droppable: DROPPABLE_COLUMNS,
    });
    const border = style("borderMuted");
    const horizontal = "─".repeat(Math.max(0, w - 2));
    const framed = rows.map((row) => truncateToWidth(`${border("│")} ${row} ${border("│")}`, w));
    return [
      truncateToWidth(border(`┌${horizontal}┐`), w),
      ...framed,
      truncateToWidth(border(`└${horizontal}┘`), w),
    ];
  }

  invalidate(): void {}
}
