import { Events } from "@cuzfrog/jie-platform";
import { render } from "ink-testing-library";
import { AgentsRail } from "./agents-rail";
import { TuiContext } from "../context";
import { Actions, createStateStore } from "../../state";
import { makeContextValue } from "../../test-support";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

describe("AgentsRail", () => {
  test("shows leader pinned first with the leader glyph", () => {
    const stateStore = createStateStore();
    stateStore.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, {
      id: "demo",
      leaderKey: "general-1",
      agents: [
        { teamId: "demo", role: "helper", agentKey: "helper-1", isLeader: false, model: null },
        { teamId: "demo", role: "general", agentKey: "general-1", isLeader: true, model: null },
      ],
    })));
    const state = stateStore.getState();
    const ctx = makeContextValue({ stateStore, state });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><AgentsRail width={20} /></TuiContext.Provider>,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("★");
    const leaderIdx = frame.indexOf("general");
    const helperIdx = frame.indexOf("helper");
    expect(leaderIdx).toBeGreaterThanOrEqual(0);
    expect(helperIdx).toBeGreaterThan(leaderIdx);
    unmount();
  });

  test("renders the idle glyph for idle agents", () => {
    const stateStore = createStateStore();
    stateStore.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, {
      id: "demo",
      leaderKey: "general-1",
      agents: [{ teamId: "demo", role: "general", agentKey: "general-1", isLeader: true, model: null }],
    })));
    const state = stateStore.getState();
    const ctx = makeContextValue({ stateStore, state });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><AgentsRail width={20} /></TuiContext.Provider>,
    );
    expect(lastFrame()).toContain("·");
    unmount();
  });
});