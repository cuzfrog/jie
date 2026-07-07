import { Events } from "@cuzfrog/jie-platform";
import { Layout } from "./layout";
import { TuiContext } from "../context";
import { Actions, createStateStore } from "../../state";
import { makeContextValue, makeFakeTui, makePlatform, renderComponent } from "../../test-harness";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

function mountLayout(opts: { columns: number; rows: number; showRail: boolean }): {
  lastFrame: () => string;
  unmount: () => void;
} {
  const stateStore = createStateStore();
  stateStore.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, "demo", [
    { role: "general", agent_key: "general-1", is_leader: true },
  ])));
  if (opts.showRail) stateStore.dispatch(Actions.toggleTeamRail());
  const platform = makePlatform();
  const ctx = makeContextValue({ stateStore, platform, tui: makeFakeTui(stateStore, platform) });
  const { lastFrame, unmount } = renderComponent(
    <TuiContext.Provider value={ctx}>
      <Layout
        columns={opts.columns}
        rows={opts.rows}
        cwd="/tmp/proj"
        gitBranch="main"
        gitDirty={false}
        stateStore={stateStore}
        onSubmit={() => undefined}
      />
    </TuiContext.Provider>,
  );
  return { lastFrame, unmount };
}

describe("Layout", () => {
  test("mounts with the placeholder before any agent activity", () => {
    const { lastFrame, unmount } = mountLayout({ columns: 100, rows: 30, showRail: false });
    expect(lastFrame()).toContain("type a prompt...");
    unmount();
  });

  test("renders the editor placeholder", () => {
    const { lastFrame, unmount } = mountLayout({ columns: 100, rows: 30, showRail: false });
    expect(lastFrame()).toContain("type a prompt...");
    unmount();
  });

  test("renders the footer line with cwd and team:agent", () => {
    const { lastFrame, unmount } = mountLayout({ columns: 100, rows: 30, showRail: false });
    const frame = lastFrame();
    expect(frame).toContain("/tmp/proj");
    expect(frame).toContain("demo:general-1");
    unmount();
  });

  test("shows the rail glyph when team rail panel is visible", () => {
    const { lastFrame, unmount } = mountLayout({ columns: 100, rows: 30, showRail: true });
    expect(lastFrame()).toContain("★");
    unmount();
  });
});