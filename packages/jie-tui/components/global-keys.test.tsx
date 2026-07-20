import { useEffect, useState, type JSX } from "react";
import { Events } from "@cuzfrog/jie-platform";
import { render } from "../test-renderer";
import { GlobalKeyBindings } from "./global-keys";
import { TuiContext } from "./context";
import { Actions, createStateStore, type TuiState } from "../state";
import { makeContextValue } from "../test-support";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

describe("GlobalKeyBindings", () => {
  test("renders nothing (returns null)", () => {
    const store = createStateStore();
    const ctx = makeContextValue({ stateStore: store });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}>
        <GlobalKeyBindings />
      </TuiContext.Provider>,
    );
    expect(lastFrame()).toBe("");
    unmount();
  });

  test("single Esc interrupts the focused busy agent", async () => {
    const store = createBusyFocusedAgentStore();
    const interrupts: Array<ReturnType<typeof Actions.requestInterrupt>["payload"]> = [];
    store.subscribe((action) => {
      if (action.type === Actions.requestInterrupt("", "").type) interrupts.push(action.payload);
      return Promise.resolve();
    });
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { stdin, unmount } = render(
      <TuiContext.Provider value={ctx}>
        <GlobalKeyBindings now={() => 1000} />
      </TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    stdin.write("\x1b");
    await new Promise((r) => setTimeout(r, 30));
    expect(interrupts).toEqual([{ teamId: "demo", agentKey: "general-1" }]);
    unmount();
  });

  test("single Esc does not interrupt an idle focused agent", async () => {
    const store = createFocusedAgentStore();
    const interrupts: Array<ReturnType<typeof Actions.requestInterrupt>["payload"]> = [];
    store.subscribe((action) => {
      if (action.type === Actions.requestInterrupt("", "").type) interrupts.push(action.payload);
      return Promise.resolve();
    });
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { stdin, unmount } = render(
      <TuiContext.Provider value={ctx}>
        <GlobalKeyBindings now={() => 1000} />
      </TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    stdin.write("\x1b");
    await new Promise((r) => setTimeout(r, 30));
    expect(interrupts).toEqual([]);
    unmount();
  });

  test("double Ctrl+D within the window quits", async () => {
    const store = createFocusedAgentStore();
    const types = collectActionTypes(store);
    let clock = 1000;
    const { stdin, unmount } = renderLiveKeys(store, () => clock);
    stdin.write("\x04");
    await new Promise((r) => setTimeout(r, 30));
    expect(types).not.toContain(Actions.requestQuit().type);
    clock = 1400;
    stdin.write("\x04");
    await new Promise((r) => setTimeout(r, 30));
    expect(types).toContain(Actions.requestQuit().type);
    unmount();
  });

  test("Ctrl+C closes the session picker instead of being dead", async () => {
    const store = createFocusedAgentStore();
    store.dispatch(Actions.openSessionPicker([]));
    const types = collectActionTypes(store);
    const { stdin, unmount } = renderLiveKeys(store, () => 1000);
    stdin.write("\x03");
    await new Promise((r) => setTimeout(r, 30));
    expect(types).toContain(Actions.closeSessionPicker().type);
    expect(types).not.toContain(Actions.requestQuit().type);
    unmount();
  });

  test("Ctrl+D while the picker is open closes it and arms the quit window", async () => {
    const store = createFocusedAgentStore();
    store.dispatch(Actions.openSessionPicker([]));
    const types = collectActionTypes(store);
    let clock = 1000;
    const { stdin, unmount } = renderLiveKeys(store, () => clock);
    stdin.write("\x04");
    await new Promise((r) => setTimeout(r, 30));
    expect(types).toContain(Actions.closeSessionPicker().type);
    expect(types).not.toContain(Actions.requestQuit().type);
    clock = 1300;
    stdin.write("\x04");
    await new Promise((r) => setTimeout(r, 30));
    expect(types).toContain(Actions.requestQuit().type);
    unmount();
  });
});

function collectActionTypes(store: ReturnType<typeof createStateStore>): string[] {
  const types: string[] = [];
  store.subscribe((action) => {
    types.push(action.type);
    return Promise.resolve();
  });
  return types;
}

function LiveKeys(props: {
  readonly store: ReturnType<typeof createStateStore>;
  readonly now: () => number;
}): JSX.Element {
  const [state, setState] = useState<TuiState>(() => props.store.getState());
  useEffect(
    () =>
      props.store.subscribe((_action, afterState) => {
        setState(afterState);
        return Promise.resolve();
      }),
    [props.store],
  );
  const ctx = { state, dispatch: (action: Parameters<ReturnType<typeof makeContextValue>["dispatch"]>[0]) => props.store.dispatch(action) };
  return (
    <TuiContext.Provider value={ctx}>
      <GlobalKeyBindings now={props.now} />
    </TuiContext.Provider>
  );
}

function renderLiveKeys(
  store: ReturnType<typeof createStateStore>,
  now: () => number,
): { readonly stdin: { write: (data: string) => void }; readonly unmount: () => void } {
  const out = render(<LiveKeys store={store} now={now} />);
  return { stdin: out.stdin, unmount: out.unmount };
}

function createBusyFocusedAgentStore(): ReturnType<typeof createStateStore> {
  const store = createFocusedAgentStore();
  store.dispatch(Actions.receiveEvent(Events.agentTurnStart({ kind: "agent", teamId: "demo", agentKey: "general-1" })));
  return store;
}

function createFocusedAgentStore(): ReturnType<typeof createStateStore> {
  const store = createStateStore();
  store.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, {
    id: "demo",
    leaderKey: "general-1",
    agents: [{ teamId: "demo", role: "general", agentKey: "general-1", isLeader: true, model: null }],
  })));
  return store;
}
