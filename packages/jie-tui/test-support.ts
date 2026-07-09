import { createStateStore, type StateStore } from "./state";
import { type TuiContextValue } from "./components";

interface ContextOverrides {
  readonly stateStore?: StateStore;
  readonly state?: TuiContextValue["state"];
  readonly dispatch?: TuiContextValue["dispatch"];
}

export function makeContextValue(overrides: ContextOverrides = {}): TuiContextValue {
  const stateStore = overrides.stateStore ?? createStateStore();
  const state = overrides.state ?? stateStore.getState();
  return {
    state,
    dispatch: overrides.dispatch ?? ((action) => stateStore.dispatch(action)),
  };
}
