import { TuiState, type StateStore, type AgentId, type AgentUiState } from "../../state";
import { type TuiComponent } from "../..";
import { Panel } from "./panel";
import { renderTeamTable, type TeamTableColumn } from "./team-table";

const PANEL_COLUMNS: ReadonlyArray<TeamTableColumn> = ["agent", "ctx", "tools", "subscribe", "model"];
const DROPPABLE_COLUMNS: ReadonlyArray<TeamTableColumn> = ["subscribe", "tools", "ctx"];

export class TeamPanel extends Panel implements TuiComponent {
  private teamId: string | null = null;
  private teamPanelVisible = false;
  private agents: ReadonlyMap<AgentId, AgentUiState> | null = null;
  private leaderAgentId: AgentId | null = null;
  private teamCursorAgentId: AgentId | null = null;
  private focusedAgentId: AgentId | null = null;

  constructor(stateStore: StateStore) {
    super(stateStore);
  }

  update(): boolean {
    const state = this.stateStore.getState();
    if (state.teamId === this.teamId && state.teamPanelVisible === this.teamPanelVisible && state.agents === this.agents && state.leaderAgentId === this.leaderAgentId && state.teamCursorAgentId === this.teamCursorAgentId && state.focusedAgentId === this.focusedAgentId) return false;
    this.teamId = state.teamId;
    this.teamPanelVisible = state.teamPanelVisible;
    this.agents = state.agents;
    this.leaderAgentId = state.leaderAgentId;
    this.teamCursorAgentId = state.teamCursorAgentId;
    this.focusedAgentId = state.focusedAgentId;
    return true;
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
