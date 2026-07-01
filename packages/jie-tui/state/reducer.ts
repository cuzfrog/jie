import { ActionTypes, type Action } from "./actions";
import type { TuiState } from "./state";
import { reduce as reduceEvent } from "./event-reducer";
import { reduceUiAction } from "./ui-reducer";

export function reduce(state: TuiState, action: Action): TuiState {
  if (action.type !== ActionTypes.RECEIVE_EVENT) return reduceUiAction(state, action);
  return reduceEvent(state, action.payload);
}
