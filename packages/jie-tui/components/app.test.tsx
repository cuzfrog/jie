import { Events } from "@cuzfrog/jie-platform";
import { render } from "../test-renderer";
import { App } from "./app";
import { makeContextValue } from "../test-support";
import { Actions, createStateStore } from "../state";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

describe("App", () => {
  test("mounts and renders the editor cursor block", () => {
    const stateStore = createStateStore();
    const { lastFrame, unmount } = render(<App stateStore={stateStore} />);
    expect(lastFrame()).toContain("\u001b[7m \u001b[27m");
    unmount();
  });

  test("renders the team id after a system.team.loaded event", async () => {
    const stateStore = createStateStore();
    stateStore.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, {
      id: "demo",
      leaderKey: "general-1",
      agents: [{ teamId: "demo", role: "general", agentKey: "general-1", isLeader: true, model: null }],
    })));
    const { lastFrame, unmount } = render(<App stateStore={stateStore} />);
    await new Promise((r) => setTimeout(r, 50));
    expect(lastFrame()).toContain("general");
    unmount();
  });

  test("renders the focused agent after typing into the editor", async () => {
    const stateStore = createStateStore();
    stateStore.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, {
      id: "demo",
      leaderKey: "general-1",
      agents: [{ teamId: "demo", role: "general", agentKey: "general-1", isLeader: true, model: null }],
    })));
    stateStore.dispatch(Actions.setEnvironment("/tmp/proj", "main", false));
    const { lastFrame, unmount } = render(<App stateStore={stateStore} />);
    expect(lastFrame()).toContain("/tmp/proj");
    unmount();
  });

  test("App's TuiContext exposes the current stateStore snapshot", () => {
    const stateStore = createStateStore();
    stateStore.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, {
      id: "demo",
      leaderKey: "general-1",
      agents: [{ teamId: "demo", role: "general", agentKey: "general-1", isLeader: true, model: null }],
    })));
    const captured = makeContextValue({ stateStore });
    expect(captured.state).toBe(stateStore.getState());
  });

  test("App re-renders the layout with the new width after a SIGWINCH resize", async () => {
    const stateStore = createStateStore();
    const instance = render(<App stateStore={stateStore} />);
    const before = instance.stdout.frames.length;
    instance.stdout.resize(60, 30);
    await new Promise((r) => setTimeout(r, 50));
    expect(instance.stdout.frames.length).toBeGreaterThan(before);
    instance.unmount();
  });

  test("App test-renderer's resize() emits a 'resize' event and updates columns/rows", () => {
    const stateStore = createStateStore();
    const instance = render(<App stateStore={stateStore} />);
    let fired = 0;
    instance.stdout.on("resize", () => {
      fired += 1;
    });
    instance.stdout.resize(60, 30);
    expect(instance.stdout.columns).toBe(60);
    expect(instance.stdout.rows).toBe(30);
    expect(fired).toBe(1);
    instance.unmount();
  });
});
