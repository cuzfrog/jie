import { ActionTypes, type Action } from "./actions";
import type { TuiState } from "./state";
import { reduce as reduceEvent } from "./event-reducer";
import { reduceUiAction } from "./ui-reducer";
import { logger } from "@cuzfrog/jie-platform";

const log = logger.getSubLogger({ name: "jie.tui.state" });

export function reduce(state: TuiState, action: Action): TuiState {
  log.trace("action", action);
  if (action.type !== ActionTypes.RECEIVE_EVENT) {
    return reduceUiAction(state, action);
  }
  return reduceEvent(state, action.payload);
}