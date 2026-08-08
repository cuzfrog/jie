import { TuiState, type StateStore } from "./state";

const THINKING_TICK_MS = 200;

export function createThinkingTicker(stateStore: StateStore, requestRender: () => void, tickMs: number = THINKING_TICK_MS): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  const sync = (state: TuiState): void => {
    const thinking = TuiState.anyAgentThinking(state);
    if (thinking && timer === null) {
      timer = setInterval(() => requestRender(), tickMs);
    } else if (!thinking && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
  const unsubscribe = stateStore.subscribe(async (_action, afterState) => {
    sync(afterState);
  });
  sync(stateStore.getState());
  return (): void => {
    if (timer !== null) clearInterval(timer);
    unsubscribe();
  };
}
