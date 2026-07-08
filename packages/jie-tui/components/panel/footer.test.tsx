import { Events } from "@cuzfrog/jie-platform";
import { Footer } from "./footer";
import { TuiContext } from "../context";
import { Actions, createStateStore } from "../../state";
import { makeContextValue, renderComponent } from "../../test-harness";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

describe("Footer", () => {
  test("shows cwd on the left and team:agent on the right", () => {
    const stateStore = createStateStore();
    stateStore.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, "demo", [
      { role: "general", agent_key: "general-1", is_leader: true },
    ])));
    const state = stateStore.getState();
    const ctx = makeContextValue({ stateStore, state });
    const { lastFrame, unmount } = renderComponent(
      <TuiContext.Provider value={ctx}>
        <Footer cwd="/tmp/proj" gitBranch="main" gitDirty={false} />
      </TuiContext.Provider>,
    );
    const frame = lastFrame();
    expect(frame).toContain("/tmp/proj");
    expect(frame).toContain("demo:general-1");
    unmount();
  });

  test("falls back to '(main)' when no branch is given", () => {
    const ctx = makeContextValue();
    const { lastFrame, unmount } = renderComponent(
      <TuiContext.Provider value={ctx}>
        <Footer cwd="/p" gitBranch="" gitDirty={false} />
      </TuiContext.Provider>,
    );
    expect(lastFrame()).toContain("(main)");
    unmount();
  });

  test("shows 'no-team:—' when no team is loaded", () => {
    const ctx = makeContextValue();
    const { lastFrame, unmount } = renderComponent(
      <TuiContext.Provider value={ctx}>
        <Footer cwd="/p" gitBranch="" gitDirty={false} />
      </TuiContext.Provider>,
    );
    expect(lastFrame()).toContain("no-team:—");
    unmount();
  });
});