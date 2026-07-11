import { Events } from "@cuzfrog/jie-platform";
import { Layout } from "./layout";
import { TuiContext } from "./context";
import { Actions, createStateStore } from "../state";
import { render } from "ink-testing-library";
import { makeContextValue } from "../test-support";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

function mountLayout(opts: { columns: number; rows: number; showRail: boolean }): {
  lastFrame: () => string;
  unmount: () => void;
} {
  const stateStore = createStateStore();
  stateStore.dispatch(Actions.receiveEvent(Events.teamLoaded({ kind: "system" }, {
    id: "demo",
    leaderKey: "general-1",
    agents: [
      { teamId: "demo", role: "general", agentKey: "general-1", isLeader: true, model: null },
      { teamId: "demo", role: "helper", agentKey: "helper-1", isLeader: false, model: null },
    ],
  })));
  stateStore.dispatch(Actions.setEnvironment("/tmp/proj", "main", false));
  if (opts.showRail) stateStore.dispatch(Actions.toggleTeamRail());
  const state = stateStore.getState();
  const ctx = makeContextValue({ stateStore, state });
  const { lastFrame, unmount } = render(
    <TuiContext.Provider value={ctx}>
      <Layout columns={opts.columns} rows={opts.rows} />
    </TuiContext.Provider>,
  );
  return { lastFrame: () => lastFrame() ?? "", unmount };
}

describe("Layout", () => {
  test("mounts with the cursor block before any agent activity", () => {
    const { lastFrame, unmount } = mountLayout({ columns: 100, rows: 30, showRail: false });
    expect(lastFrame()).toContain("\u001b[7m \u001b[27m");
    unmount();
  });

  test("renders the editor cursor block when the buffer is empty", () => {
    const { lastFrame, unmount } = mountLayout({ columns: 100, rows: 30, showRail: false });
    expect(lastFrame()).toContain("\u001b[7m \u001b[27m");
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

  test("pins the footer to the last two rows of the terminal", () => {
    const rows = 30;
    const { lastFrame, unmount } = mountLayout({ columns: 100, rows, showRail: false });
    const lines = lastFrame().split("\n");
    const footerLeftIndex = lines.findIndex((line) => line.includes("/tmp/proj"));
    expect(footerLeftIndex).toBe(rows - 2);
    const footerRightIndex = lines.findIndex((line) => line.includes("demo:general-1"));
    expect(footerRightIndex).toBe(footerLeftIndex);
    unmount();
  });

  test("editor content height equals 1 plus the number of newlines in the buffer", () => {
    const { lastFrame, unmount } = mountLayout({ columns: 100, rows: 30, showRail: false });
    const lines = lastFrame().split("\n");
    const cursorIndex = lines.findIndex((line) => line.includes("\u001b[7m \u001b[27m"));
    expect(cursorIndex).toBeGreaterThanOrEqual(0);
    const editorTopBorderIndex = cursorIndex - 1;
    const editorBottomBorderIndex = (() => {
      for (let i = cursorIndex + 1; i < lines.length; i++) {
        if (lines[i]?.includes("─") === true) return i;
      }
      return -1;
    })();
    expect(editorTopBorderIndex).toBeGreaterThanOrEqual(0);
    expect(editorBottomBorderIndex).toBeGreaterThan(cursorIndex);
    const editorContentHeight = editorBottomBorderIndex - editorTopBorderIndex - 1;
    expect(editorContentHeight).toBe(1);
    unmount();
  });
});