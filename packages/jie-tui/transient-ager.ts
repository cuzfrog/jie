import { Actions, type StateStore } from "./state";

const TRANSIENT_TTL_MS = 5000;
const SET_TRANSIENT_MESSAGE = Actions.setTransientMessage("").type;

export function createTransientAger(stateStore: StateStore, ttlMs: number = TRANSIENT_TTL_MS): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsubscribe = stateStore.subscribe(async (action) => {
    if (action.type !== SET_TRANSIENT_MESSAGE) return;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      stateStore.dispatch(Actions.clearTransientMessage());
    }, ttlMs);
  });
  return (): void => {
    if (timer !== null) clearTimeout(timer);
    unsubscribe();
  };
}
