import { Actions, type StateStore } from "../../state";
import { makeTuiState } from "../../test";
import { TransientAgerImpl } from "./transient-ager";

type Listener = Parameters<StateStore["subscribe"]>[0];

const CLEAR = Actions.clearTransientMessage().type;
const SET_TRANSIENT_MESSAGE = Actions.setTransientMessage("").type;

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
      if (action.type === SET_TRANSIENT_MESSAGE) transient = action.payload.text;
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

describe("TransientAger", () => {
  test("update is a no-op when the transient message is unchanged", () => {
    const { store } = createMockStateStore();
    const ager = new TransientAgerImpl(store, 30);
    store.dispatch(Actions.setTransientMessage("hello"));
    expect(ager.update()).toBe(false);
    expect(ager.update()).toBe(false);
  });

  test("clears the transient message once the ttl elapses", async () => {
    const { store, dispatched } = createMockStateStore();
    const ager = new TransientAgerImpl(store, 30);
    store.dispatch(Actions.setTransientMessage("hello"));
    ager.update();
    await sleep(60);
    expect(dispatched).toContain(CLEAR);
    expect(store.getState().transientMessage).toBeNull();
    ager.stop();
  });

  test("a newer transient message resets the timer", async () => {
    const { store, dispatched } = createMockStateStore();
    const ager = new TransientAgerImpl(store, 30);
    store.dispatch(Actions.setTransientMessage("first"));
    ager.update();
    await sleep(20);
    store.dispatch(Actions.setTransientMessage("second"));
    ager.update();
    await sleep(20);
    expect(dispatched.filter((type) => type === CLEAR)).toHaveLength(0);
    await sleep(40);
    expect(dispatched.filter((type) => type === CLEAR)).toHaveLength(1);
    ager.stop();
  });

  test("stop cancels a pending clear", async () => {
    const { store, dispatched } = createMockStateStore();
    const ager = new TransientAgerImpl(store, 30);
    store.dispatch(Actions.setTransientMessage("hello"));
    ager.update();
    ager.stop();
    await sleep(60);
    expect(dispatched.filter((type) => type === CLEAR)).toHaveLength(0);
  });

  test("actions other than setting a transient do not schedule a clear", async () => {
    const { store, dispatched } = createMockStateStore();
    const ager = new TransientAgerImpl(store, 30);
    store.dispatch(Actions.setEditorText("typed"));
    ager.update();
    await sleep(60);
    expect(dispatched.filter((type) => type === CLEAR)).toHaveLength(0);
    ager.stop();
  });
});
