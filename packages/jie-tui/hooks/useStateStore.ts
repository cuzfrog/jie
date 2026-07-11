import { useCallback, useEffect, useState } from "react";
import type { TuiState, StateStore, Action } from "../state";

interface StateStoreSnapshot {
  readonly state: TuiState;
  readonly dispatch: (action: Action) => void;
}

export function useStateStore(stateStore: StateStore): StateStoreSnapshot {
  const [state, setState] = useState<TuiState>(stateStore.getState());
  useEffect(
    () => stateStore.subscribe(async () => {
      setState(stateStore.getState());
    }),
    [stateStore],
  );
  const dispatch = useCallback((action: Action) => stateStore.dispatch(action), [stateStore]);
  return { state, dispatch };
}
