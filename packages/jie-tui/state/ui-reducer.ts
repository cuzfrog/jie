import { ActionTypes, type Action } from "./actions";
import type { TuiState } from "./state";

export function reduceUiAction(state: TuiState, action: Action): TuiState {
  switch (action.type) {
    case ActionTypes.TOGGLE_TEAM_RAIL:
      return reduceRailToggle(state);
    case ActionTypes.SWITCH_CYCLE_AGENT:
      return reduceAgentCycle(state, action.payload.direction);
    case ActionTypes.CLEAR_TUI_STATE:
      return reduceClear(state);
    case ActionTypes.SET_TRANSIENT_MESSAGE:
      return reduceUiTransient(state, action.payload.text);
    case ActionTypes.CLEAR_TRANSIENT_MESSAGE:
      return reduceUiTransientClear(state);
    case ActionTypes.SET_ERROR_MESSAGE:
      return reduceUiError(state, action.payload.text);
    case ActionTypes.CLEAR_ERROR_MESSAGE:
      return reduceUiErrorClear(state);
    default:
      return state;
  }
}

function reduceRailToggle(state: TuiState): TuiState {
  return { ...state, showTeamRailPanel: !state.showTeamRailPanel };
}

function reduceAgentCycle(state: TuiState, direction: 1 | -1): TuiState {
  if (!state.showTeamRailPanel) return state;
  const ids = Array.from(state.agents.keys());
  if (ids.length < 2) return state;
  const currentIndex = state.focusedAgentId === null ? -1 : ids.indexOf(state.focusedAgentId);
  const length = ids.length;
  const next = ((currentIndex + direction) % length + length) % length;
  return { ...state, focusedAgentId: ids[next] ?? state.focusedAgentId };
}

function reduceClear(state: TuiState): TuiState {
  return {
    ...state,
    agents: new Map(),
    leaderAgentId: null,
    focusedAgentId: null,
    transientMessage: null,
    errorBanner: null,
  };
}

function reduceUiTransient(state: TuiState, text: string): TuiState {
  return { ...state, transientMessage: { text } };
}

function reduceUiTransientClear(state: TuiState): TuiState {
  return { ...state, transientMessage: null };
}

function reduceUiError(state: TuiState, text: string): TuiState {
  return { ...state, errorBanner: { text } };
}

function reduceUiErrorClear(state: TuiState): TuiState {
  return { ...state, errorBanner: null };
}
