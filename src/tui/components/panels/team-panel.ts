import { TuiState, type StateStore } from "../../state";
import { Panel } from "./panel";
import { renderTeamTable, type TeamTableColumn } from "./team-table";

const PANEL_COLUMNS: ReadonlyArray<TeamTableColumn> = ["agent", "ctx", "tools", "subscribe", "model"];
const DROPPABLE_COLUMNS: ReadonlyArray<TeamTableColumn> = ["subscribe", "tools", "ctx"];

export class TeamPanel extends Panel {
  constructor(stateStore: StateStore) {
    super(stateStore);
  }

  protected isVisible(state: TuiState): boolean {
    return state.teamId !== null && state.teamPanelVisible;
  }

  protected body(state: TuiState, inner: number): string[] {
    const roster = TuiState.rosterOrder(state);
    if (roster.length === 0) return [];
    return renderTeamTable(roster, PANEL_COLUMNS, inner, {
      pointed: state.teamCursorAgentId ?? state.focusedAgentId,
      focused: state.focusedAgentId,
      droppable: DROPPABLE_COLUMNS,
    });
  }
}
