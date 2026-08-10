import { Actions, type StateStore, type TuiState } from "./state";
import { makeTuiState } from "./test";
import type { TuiRoot } from "./tui-component";
import { TuiRendererImpl } from "./renderer";

const INERT_ACTION = Actions.setEnvironment("/tmp", "main", false, "");
const state: TuiState = makeTuiState({});
const unsubscribe = vi.fn();
const stateStore = vi.mocked<StateStore>({
  getState: vi.fn(),
  dispatch: vi.fn(),
  subscribe: vi.fn(() => unsubscribe),
});
const requestRender = vi.fn();
const root = vi.mocked<TuiRoot>({ update: vi.fn() });

function notify(): Promise<void> {
  const listener = stateStore.subscribe.mock.calls[0]![0];
  return listener(INERT_ACTION, state, state);
}

describe("TuiRendererImpl", () => {
  test("start subscribes to the state store", () => {
    const renderer = new TuiRendererImpl(stateStore, requestRender, root);
    renderer.start();
    expect(stateStore.subscribe).toHaveBeenCalledTimes(1);
  });

  test("requests a render when the root is dirty after a state change", async () => {
    const renderer = new TuiRendererImpl(stateStore, requestRender, root);
    renderer.start();
    root.update.mockReturnValue(true);
    await notify();
    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  test("skips rendering when the root is not dirty", async () => {
    const renderer = new TuiRendererImpl(stateStore, requestRender, root);
    renderer.start();
    root.update.mockReturnValue(false);
    await notify();
    expect(requestRender).not.toHaveBeenCalled();
  });

  test("stop unsubscribes", () => {
    const renderer = new TuiRendererImpl(stateStore, requestRender, root);
    renderer.start();
    renderer.stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  test("does not render before start", () => {
    new TuiRendererImpl(stateStore, requestRender, root);
    root.update.mockReturnValue(true);
    expect(requestRender).not.toHaveBeenCalled();
  });
});
