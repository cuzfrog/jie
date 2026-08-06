import { ActionTypes, type Action } from "./actions";
import { teamLoadReducer } from "./team-load-reducer";
import { TuiState } from "./state";
import { clampKanbanCursor, moveKanbanCursor, type KanbanDirection } from "./kanban-cursor";
import { reduceKanbanBoard } from "./kanban-reducer";

export function reduceUiAction(state: TuiState, action: Action): TuiState {
  switch (action.type) {
    case ActionTypes.SWITCH_TEAM:
      return teamLoadReducer(state, action.payload);
    case ActionTypes.SET_SESSION_NAME:
      return { ...state, sessionName: action.payload.name };
    case ActionTypes.SET_INSTALLED_TEAMS:
      return { ...state, installedTeams: action.payload.teams };
    case ActionTypes.TOGGLE_THINKING:
      return { ...state, thinkingExpanded: !state.thinkingExpanded };
    case ActionTypes.TOGGLE_TOOL_CARDS:
      return { ...state, toolCardsExpanded: !state.toolCardsExpanded };
    case ActionTypes.SWITCH_CYCLE_AGENT:
      return reduceTeamCursor(state, action.payload.direction);
    case ActionTypes.TOGGLE_TEAM_PANEL:
      return reduceTeamPanelToggle(state);
    case ActionTypes.TOGGLE_KANBAN_PANEL:
      return reduceKanbanPanelToggle(state);
    case ActionTypes.COMMIT_TEAM_CURSOR:
      return reduceTeamCursorCommit(state);
    case ActionTypes.CLEAR_TUI_STATE:
      return {
        ...state,
        agents: new Map(),
        sessionName: null,
        leaderAgentId: null,
        focusedAgentId: null,
        teamCursorAgentId: null,
        interruptedAgentId: null,
        infoEntries: [],
        nextEntrySeq: 0,
        transientMessage: null,
        errorBanner: null,
      };
    case ActionTypes.SET_TRANSIENT_MESSAGE:
      return { ...state, transientMessage: action.payload.text };
    case ActionTypes.CLEAR_TRANSIENT_MESSAGE:
      return { ...state, transientMessage: null };
    case ActionTypes.SET_ERROR_MESSAGE:
      return { ...state, errorBanner: action.payload.text };
    case ActionTypes.CLEAR_ERROR_MESSAGE:
      return { ...state, errorBanner: null };
    case ActionTypes.CLEAR_BANNERS:
      return { ...state, transientMessage: null, errorBanner: null };
    case ActionTypes.REQUEST_QUIT:
      if (state.pendingQuit) return state;
      return { ...state, pendingQuit: true };
    case ActionTypes.REQUEST_RENDER:
      return state;
    case ActionTypes.SET_EDITOR_TEXT:
      return { ...state, editorText: action.payload.text };
    case ActionTypes.SET_EDITOR_CURSOR_AT_START:
      if (state.editorCursorAtStart === action.payload.atStart) return state;
      return { ...state, editorCursorAtStart: action.payload.atStart };
    case ActionTypes.SUBMIT_EDITOR_TEXT:
      if (state.interruptedAgentId === null) return state;
      return { ...state, interruptedAgentId: null };
    case ActionTypes.REQUEST_INTERRUPT:
      return state;
    case ActionTypes.SET_ENVIRONMENT:
      return {
        ...state,
        cwd: action.payload.cwd,
        gitBranch: action.payload.gitBranch,
        gitDirty: action.payload.gitDirty,
        version: action.payload.version,
      };
    case ActionTypes.SHOW_HELP:
      return {
        ...state,
        infoEntries: [...state.infoEntries, { seq: state.nextEntrySeq, kind: "help" }],
        nextEntrySeq: state.nextEntrySeq + 1,
      };
    case ActionTypes.SET_KANBAN_BOARD:
      return reduceKanbanBoard(state, action.payload.board);
    case ActionTypes.MOVE_KANBAN_CURSOR:
      return reduceKanbanCursorMove(state, action.payload.direction);
    case ActionTypes.TOGGLE_KANBAN_EXPAND:
      return { ...state, kanbanExpanded: !state.kanbanExpanded };
    case ActionTypes.COMMIT_KANBAN_EDIT:
      return { ...state, kanbanEdit: action.payload.cardId };
    case ActionTypes.CANCEL_KANBAN_EDIT:
      return { ...state, kanbanEdit: null };
    case ActionTypes.SAVE_KANBAN_EDIT:
      return state;
    default:
      return state;
  }
}

function reduceTeamPanelToggle(state: TuiState): TuiState {
  const roster = TuiState.rosterOrder(state);
  if (roster.length === 0) return state;
  if (state.teamPanelVisible) return { ...state, teamPanelVisible: false, teamCursorAgentId: null };
  const cursor = state.teamCursorAgentId ?? state.focusedAgentId ?? roster[0]!.agentId;
  return { ...state, teamPanelVisible: true, teamCursorAgentId: cursor, kanbanPanelVisible: false };
}

function reduceKanbanPanelToggle(state: TuiState): TuiState {
  if (state.focusedAgentId === null) return state;
  if (state.kanbanPanelVisible) return { ...state, kanbanPanelVisible: false, kanbanEdit: null };
  return {
    ...state,
    kanbanPanelVisible: true,
    teamPanelVisible: false,
    teamCursorAgentId: null,
    kanbanCursor: clampKanbanCursor(state.kanbanBoard, state.kanbanCursor),
  };
}

function reduceKanbanCursorMove(state: TuiState, direction: KanbanDirection): TuiState {
  return { ...state, kanbanCursor: moveKanbanCursor(state.kanbanBoard, state.kanbanCursor, direction) };
}

function reduceTeamCursor(state: TuiState, direction: 1 | -1): TuiState {
  if (!state.teamPanelVisible) return state;
  const roster = TuiState.rosterOrder(state);
  if (roster.length === 0) return state;
  const current = state.teamCursorAgentId ?? state.focusedAgentId;
  const index = roster.findIndex((agent) => agent.agentId === current);
  if (index === -1) return { ...state, teamCursorAgentId: roster[0]!.agentId };
  const next = (index + direction + roster.length) % roster.length;
  return { ...state, teamCursorAgentId: roster[next]!.agentId };
}

function reduceTeamCursorCommit(state: TuiState): TuiState {
  const cursor = state.teamCursorAgentId;
  if (!state.teamPanelVisible || cursor === null || cursor === state.focusedAgentId) return state;
  if (!state.agents.has(cursor)) return { ...state, teamCursorAgentId: null };
  return { ...state, focusedAgentId: cursor };
}
