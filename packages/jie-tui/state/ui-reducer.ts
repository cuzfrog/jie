import { ActionTypes, type Action } from "./actions";
import type { TuiState } from "./state";

export function reduceUiAction(state: TuiState, action: Action): TuiState {
  switch (action.type) {
    case ActionTypes.TOGGLE_TEAM_RAIL:
      return { ...state, showTeamRailPanel: !state.showTeamRailPanel };
    case ActionTypes.SWITCH_CYCLE_AGENT:
      return reduceAgentCycle(state, action.payload.direction);
    case ActionTypes.CLEAR_TUI_STATE:
      return {
        ...state,
        agents: new Map(),
        leaderAgentId: null,
        focusedAgentId: null,
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
      return state;
    case ActionTypes.REQUEST_INTERRUPT:
      return state;
    case ActionTypes.SET_ENVIRONMENT:
      return {
        ...state,
        cwd: action.payload.cwd,
        gitBranch: action.payload.gitBranch,
        gitDirty: action.payload.gitDirty,
      };
    default:
      return state;
  }
}

function reduceAgentCycle(state: TuiState, direction: 1 | -1): TuiState {
  if (!state.showTeamRailPanel) return state;
  const ids = Array.from(state.agents.keys());
  if (ids.length < 2) return state;
  const length = ids.length;
  if (state.focusedAgentId === null) {
    const fallback = direction === 1 ? 0 : length - 1;
    return { ...state, focusedAgentId: ids[fallback]! };
  }
  const currentIndex = ids.indexOf(state.focusedAgentId);
  if (currentIndex === -1) return state;
  const next = (currentIndex + direction + length) % length;
  return { ...state, focusedAgentId: ids[next]! };
}
