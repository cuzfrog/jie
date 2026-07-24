import { Actions, type StateStore } from "./state";
import { makeTuiState } from "./test";
import { createTransientAger } from "./transient-ager";

type Listener = Parameters<StateStore["subscribe"]>[0];

const CLEAR = Actions.clearTransientMessage().type;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createMockStateStore(): { readonly store: StateStore; readonly dispatched: string[] } {
  let listener: Listener | null = null;
  let transient: string | null = null;
  const dispatched: string[] = [];
  const store = vi.mocked<StateStore>({
    getState: () => makeTuiState({ transientMessage: transient }),
    dispatch: (action) => {
      dispatched.push(action.type);
      if (action.type === CLEAR) transient = null;
      void listener?.(action, makeTuiState({ transientMessage: transient }), makeTuiState());
    },
    subscribe: (next) => {
      listener = next;
      return (): void => {
        listener = null;
      };
    },
  });
  return { store, dispatched };
}

describe("createTransientAger", () => {
  test("clears the transient message once the ttl elapses", async () => {
    const { store, dispatched } = createMockStateStore();
    createTransientAger(store, 30);
    store.dispatch(Actions.setTransientMessage("hello"));
    await sleep(60);
    expect(dispatched).toContain(CLEAR);
    expect(store.getState().transientMessage).toBeNull();
  });

  test("a newer transient message resets the timer", async () => {
    const { store, dispatched } = createMockStateStore();
    createTransientAger(store, 30);
    store.dispatch(Actions.setTransientMessage("first"));
    await sleep(20);
    store.dispatch(Actions.setTransientMessage("second"));
    await sleep(20);
    expect(dispatched.filter((type) => type === CLEAR)).toHaveLength(0);
    await sleep(40);
    expect(dispatched.filter((type) => type === CLEAR)).toHaveLength(1);
  });

  test("unsubscribe cancels a pending clear", async () => {
    const { store, dispatched } = createMockStateStore();
    const unsubscribe = createTransientAger(store, 30);
    store.dispatch(Actions.setTransientMessage("hello"));
    unsubscribe();
    await sleep(60);
    expect(dispatched.filter((type) => type === CLEAR)).toHaveLength(0);
  });

  test("actions other than setting a transient do not schedule a clear", async () => {
    const { store, dispatched } = createMockStateStore();
    createTransientAger(store, 30);
    store.dispatch(Actions.setEditorText("typed"));
    await sleep(60);
    expect(dispatched.filter((type) => type === CLEAR)).toHaveLength(0);
  });
});
