import { ActionTypes, type Action } from "./actions";
import { teamLoadReducer } from "./team-load-reducer";
import { TuiState } from "./state";

export function reduceUiAction(state: TuiState, action: Action): TuiState {
  switch (action.type) {
    case ActionTypes.SWITCH_TEAM:
      return teamLoadReducer(state, action.payload);
    case ActionTypes.TOGGLE_THINKING:
      return { ...state, thinkingExpanded: !state.thinkingExpanded };
    case ActionTypes.TOGGLE_TOOL_CARDS:
      return { ...state, toolCardsExpanded: !state.toolCardsExpanded };
    case ActionTypes.SWITCH_CYCLE_AGENT:
      return reduceAgentCursor(state, action.payload.direction);
    case ActionTypes.CLEAR_TUI_STATE:
      return {
        ...state,
        agents: new Map(),
        leaderAgentId: null,
        focusedAgentId: null,
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
      };
    case ActionTypes.SHOW_HELP:
      return {
        ...state,
        infoEntries: [...state.infoEntries, { seq: state.nextEntrySeq, kind: "help" }],
        nextEntrySeq: state.nextEntrySeq + 1,
      };
    default:
      return state;
  }
}

function reduceAgentCursor(state: TuiState, direction: 1 | -1): TuiState {
  const roster = TuiState.rosterOrder(state);
  if (roster.length === 0) return state;
  if (!state.teamPanelVisible) {
    const focused = state.focusedAgentId ?? roster[direction === 1 ? 0 : roster.length - 1]!.agentId;
    return { ...state, teamPanelVisible: true, focusedAgentId: focused };
  }
  const index = roster.findIndex((agent) => agent.agentId === state.focusedAgentId);
  if (index === -1) return { ...state, focusedAgentId: roster[0]!.agentId };
  if (direction === -1 && index === 0) return { ...state, teamPanelVisible: false };
  const next = direction === 1 && index === roster.length - 1 ? 0 : index + direction;
  return { ...state, focusedAgentId: roster[next]!.agentId };
}
