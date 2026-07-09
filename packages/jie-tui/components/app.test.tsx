import { Events } from "@cuzfrog/jie-platform";
import { render } from "ink-testing-library";
import { App } from "./app";
import { TuiContext } from "./context";
import { makeContextValue } from "../test-support";
import { Actions, createStateStore } from "../state";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

describe("App", () => {
  test("mounts and renders the editor placeholder", () => {
    const stateStore = createStateStore();
    const state = stateStore.getState();
    const ctx = makeContextValue({ stateStore, state });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}>
        <App state={state} dispatch={(a) => stateStore.dispatch(a)} />
      </TuiContext.Provider>,
    );
    expect(lastFrame()).toContain("type a prompt...");
    unmount();
  });

  test("renders the team id after a system.team.loaded event", async () => {
    const stateStore = createStateStore();
    stateStore.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, "demo", [
      { role: "general", agent_key: "general-1", is_leader: true },
    ])));
    const state = stateStore.getState();
    const ctx = makeContextValue({ stateStore, state });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}>
        <App state={state} dispatch={(a) => stateStore.dispatch(a)} />
      </TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(lastFrame()).toContain("general");
    unmount();
  });

  test("renders the focused agent after typing into the editor", async () => {
    const stateStore = createStateStore();
    stateStore.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, "demo", [
      { role: "general", agent_key: "general-1", is_leader: true },
    ])));
    stateStore.dispatch(Actions.setEnvironment("/tmp/proj", "main", false));
    const state = stateStore.getState();
    const ctx = makeContextValue({ stateStore, state });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}>
        <App state={state} dispatch={(a) => stateStore.dispatch(a)} />
      </TuiContext.Provider>,
    );
    expect(lastFrame()).toContain("/tmp/proj");
    unmount();
  });

  test("exposes a TuiContext value derived from the current state", () => {
    const stateStore = createStateStore();
    stateStore.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, "demo", [
      { role: "general", agent_key: "general-1", is_leader: true },
    ])));
    const state = stateStore.getState();
    const ctx = makeContextValue({ stateStore, state });
    const Probe = (): null => {
      const captured = makeContextValue({ stateStore, state });
      expect(captured.state).toBe(state);
      return null;
    };
    const { unmount } = render(
      <TuiContext.Provider value={ctx}><Probe /></TuiContext.Provider>,
    );
    unmount();
  });
});