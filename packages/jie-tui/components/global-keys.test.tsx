import { Events } from "@cuzfrog/jie-platform";
import { render } from "../test-renderer";
import { GlobalKeyBindings } from "./global-keys";
import { TuiContext } from "./context";
import { Actions, createStateStore } from "../state";
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
});

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
