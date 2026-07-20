import { Events } from "@cuzfrog/jie-platform";
import { Box } from "@cuzfrog/jie-ink";
import { render } from "../../test-renderer";
import { AgentsRail } from "./agents-rail";
import { TuiContext } from "../context";
import { Actions, createStateStore } from "../../state";
import { makeContextValue } from "../../test-support";
import { SPINNER_FRAMES } from "../themes";

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

  test("renders a spinner frame for busy agents", () => {
    const stateStore = createStateStore();
    const sender = { kind: "agent", teamId: "demo", agentKey: "general-1" } as const;
    stateStore.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, {
      id: "demo",
      leaderKey: "general-1",
      agents: [{ teamId: "demo", role: "general", agentKey: "general-1", isLeader: true, model: null }],
    })));
    stateStore.dispatch(Actions.receiveEvent(Events.agentTurnStart(sender)));
    const state = stateStore.getState();
    const ctx = makeContextValue({ stateStore, state });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><AgentsRail width={20} /></TuiContext.Provider>,
    );
    const frame = lastFrame() ?? "";
    const hasFrame = SPINNER_FRAMES.some((glyph) => frame.includes(glyph));
    expect(hasFrame).toBe(true);
    unmount();
  });

  test("renders no box borders around the agent list", () => {
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
    try {
      const frame = lastFrame() ?? "";
      for (const glyph of ["┌", "┐", "└", "┘", "─", "│"]) {
        expect(frame).not.toContain(glyph);
      }
    } finally {
      unmount();
    }
  });

  test("vertically centers the agent block within the container height", () => {
    const stateStore = createStateStore();
    stateStore.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, {
      id: "demo",
      leaderKey: "general-1",
      agents: [{ teamId: "demo", role: "general", agentKey: "general-1", isLeader: true, model: null }],
    })));
    const state = stateStore.getState();
    const ctx = makeContextValue({ stateStore, state });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}>
        <Box height={7} width={20}>
          <AgentsRail width={20} />
        </Box>
      </TuiContext.Provider>,
    );
    try {
      const lines = (lastFrame() ?? "").split("\n");
      expect(lines[0] ?? "").not.toContain("general");
      expect(lines[3] ?? "").toContain("general");
    } finally {
      unmount();
    }
  });
});
