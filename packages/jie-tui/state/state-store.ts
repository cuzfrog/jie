import type { TuiState } from "./state";
import { reduce } from "./reducer";
import type { Action } from "./actions";

export interface StateStore {
  getState: () => TuiState;
  dispatch: (action: Action) => void;
  subscribe: (listener: () => void) => () => void;
}

export interface CreateStateStoreOptions {
  readonly initialState: TuiState;
}

export function createStateStore(options: CreateStateStoreOptions): StateStore {
  let state: TuiState = options.initialState;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    dispatch: (action) => {
      state = reduce(state, action);
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return (): void => {
        listeners.delete(listener);
      };
    },
  };
}
