import { Events } from "@cuzfrog/jie-platform";
import { render } from "ink-testing-library";
import { App } from "./app";
import { makeContextValue } from "../test-support";
import { Actions, createStateStore } from "../state";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

describe("App", () => {
  test("mounts and renders the editor placeholder", () => {
    const stateStore = createStateStore();
    const { lastFrame, unmount } = render(<App stateStore={stateStore} />);
    expect(lastFrame()).toContain("type a prompt...");
    unmount();
  });

  test("renders the team id after a system.team.loaded event", async () => {
    const stateStore = createStateStore();
    stateStore.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, "demo", [
      { role: "general", agent_key: "general-1", is_leader: true },
    ])));
    const { lastFrame, unmount } = render(<App stateStore={stateStore} />);
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
    const { lastFrame, unmount } = render(<App stateStore={stateStore} />);
    expect(lastFrame()).toContain("/tmp/proj");
    unmount();
  });

  test("App's TuiContext exposes the current stateStore snapshot", () => {
    const stateStore = createStateStore();
    stateStore.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, "demo", [
      { role: "general", agent_key: "general-1", is_leader: true },
    ])));
    const captured = makeContextValue({ stateStore });
    expect(captured.state).toBe(stateStore.getState());
  });
});