import { Events } from "@cuzfrog/jie-platform";
import { AgentsRail } from "./agents-rail";
import { TuiContext } from "../context";
import { Actions, createStateStore } from "../../state";
import { makeContextValue, makeFakeTui, makePlatform, renderComponent } from "../../test-harness";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

describe("AgentsRail", () => {
  test("shows leader pinned first with the leader glyph", () => {
    const stateStore = createStateStore();
    stateStore.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, "demo", [
      { role: "helper", agent_key: "helper-1", is_leader: false },
      { role: "general", agent_key: "general-1", is_leader: true },
    ])));
    const platform = makePlatform();
    const ctx = makeContextValue({ state: stateStore.getState(), platform, tui: makeFakeTui(stateStore, platform) });
    const { lastFrame, unmount } = renderComponent(
      <TuiContext.Provider value={ctx}><AgentsRail width={20} /></TuiContext.Provider>,
    );
    const frame = lastFrame();
    expect(frame).toContain("★");
    const leaderIdx = frame.indexOf("general");
    const helperIdx = frame.indexOf("helper");
    expect(leaderIdx).toBeGreaterThanOrEqual(0);
    expect(helperIdx).toBeGreaterThan(leaderIdx);
    unmount();
  });

  test("renders the idle glyph for idle agents", () => {
    const stateStore = createStateStore();
    stateStore.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, "demo", [
      { role: "general", agent_key: "general-1", is_leader: true },
    ])));
    const platform = makePlatform();
    const ctx = makeContextValue({ state: stateStore.getState(), platform, tui: makeFakeTui(stateStore, platform) });
    const { lastFrame, unmount } = renderComponent(
      <TuiContext.Provider value={ctx}><AgentsRail width={20} /></TuiContext.Provider>,
    );
    expect(lastFrame()).toContain("·");
    unmount();
  });
});