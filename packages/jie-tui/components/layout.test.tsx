import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Events } from "@cuzfrog/jie-platform";
import { Layout } from "./layout";
import { TuiContext } from "./context";
import { Actions, createStateStore, type Action } from "../state";
import { render } from "../test-renderer";
import { makeContextValue } from "../test-support";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

function mountLayout(opts: {
  columns: number;
  rows: number;
  showRail: boolean;
  seed?: (dispatch: (action: Action) => void) => void;
}): {
  lastFrame: () => string;
  unmount: () => void;
  stdin: { write: (data: string) => void };
  stateStore: ReturnType<typeof createStateStore>;
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
  if (opts.seed !== undefined) opts.seed((action) => stateStore.dispatch(action));
  const state = stateStore.getState();
  const ctx = makeContextValue({ stateStore, state });
  const out = render(
    <TuiContext.Provider value={ctx}>
      <Layout columns={opts.columns} rows={opts.rows} />
    </TuiContext.Provider>,
  );
  return { lastFrame: () => out.lastFrame() ?? "", unmount: out.unmount, stdin: out.stdin, stateStore };
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

  test("renders every row of an 8-line draft without clipping", () => {
    const draft = "L1\nL2\nL3\nL4\nL5\nL6\nL7\nL8";
    const { lastFrame, unmount } = mountLayout({
      columns: 100,
      rows: 30,
      showRail: false,
      seed: (dispatch) => {
        dispatch(Actions.setEditorText(draft));
      },
    });
    const lines = lastFrame().split("\n");
    expect(lines.findIndex((line) => line.includes("L8"))).toBeGreaterThanOrEqual(0);
    const editorHeight = 8 + 2;
    expect(lines.findIndex((line) => line.includes("─"))).toBe(30 - 2 - editorHeight);
    expect(lines[30 - 3]?.includes("─")).toBe(true);
    unmount();
  });

  test("caps the editor panel at 8 content rows and keeps the cursor line visible", () => {
    const draft = "L1\nL2\nL3\nL4\nL5\nL6\nL7\nL8\nL9\nL10\nL11\nL12";
    const { lastFrame, unmount } = mountLayout({
      columns: 100,
      rows: 30,
      showRail: false,
      seed: (dispatch) => {
        dispatch(Actions.setEditorText(draft));
      },
    });
    const lines = lastFrame().split("\n").map(stripAnsi);
    expect(lines.findIndex((line) => line.includes(" L12"))).toBeGreaterThanOrEqual(0);
    expect(lines.findIndex((line) => line.includes(" L1 "))).toBe(-1);
    const maxEditorHeight = 8 + 2;
    expect(lines.findIndex((line) => line.includes("─"))).toBe(30 - 2 - maxEditorHeight);
    expect(lines[30 - 3]?.includes("─")).toBe(true);
    unmount();
  });

  test("hands the rows the editor does not use to the chat pane", () => {
    const { lastFrame, unmount } = mountLayout({
      columns: 100,
      rows: 30,
      showRail: false,
      seed: (dispatch) => {
        seedThirtyChatLines(dispatch);
      },
    });
    const lines = lastFrame().split("\n");
    const editorHeight = 1 + 2;
    expect(lines.findIndex((line) => line.includes("c30"))).toBe(30 - 2 - editorHeight - 1);
    unmount();
  });

  test("renders the transient banner as its own row above the editor and shrinks chat", () => {
    const { lastFrame, unmount } = mountLayout({
      columns: 100,
      rows: 30,
      showRail: false,
      seed: (dispatch) => {
        seedThirtyChatLines(dispatch);
        dispatch(Actions.setTransientMessage("copied"));
      },
    });
    const lines = lastFrame().split("\n");
    const bannerIndex = lines.findIndex((line) => line.includes("✓ copied"));
    expect(bannerIndex).toBeGreaterThanOrEqual(0);
    const editorTopBorder = lines.findIndex((line) => line.includes("─"));
    expect(bannerIndex).toBe(editorTopBorder - 1);
    const editorHeight = 1 + 2;
    const transientHeight = 1;
    expect(lines.findIndex((line) => line.includes("c30"))).toBe(30 - 2 - editorHeight - transientHeight - 1);
    unmount();
  });

  test("a wrapped editor line grows the editor panel and shrinks the chat pane", () => {
    const { lastFrame, unmount } = mountLayout({
      columns: 40,
      rows: 30,
      showRail: false,
      seed: (dispatch) => {
        dispatch(Actions.setEditorText("x".repeat(60)));
        seedThirtyChatLines(dispatch);
      },
    });
    const lines = lastFrame().split("\n");
    const editorHeight = 2 + 2;
    expect(lines.findIndex((line) => line.includes("c30"))).toBe(30 - 2 - editorHeight - 1);
    unmount();
  });

  test("an open slash picker takes its rows from the chat pane; footer stays pinned", () => {
    const rows = 30;
    const { lastFrame, unmount } = mountLayout({
      columns: 100,
      rows,
      showRail: false,
      seed: (dispatch) => {
        seedThirtyChatLines(dispatch);
        dispatch(Actions.setEditorText("/"));
      },
    });
    const lines = lastFrame().split("\n").map(stripAnsi);
    const editorHeight = 1 + 2;
    const pickerHeight = 2 + 1 + 8 + 1;
    const editorTopBorder = rows - 2 - pickerHeight - editorHeight;
    const pickerTopBorder = rows - 2 - pickerHeight;
    expect(lines.findIndex((line) => line.includes("─"))).toBe(editorTopBorder);
    expect(lines[pickerTopBorder]?.includes("─")).toBe(true);
    expect(lines[pickerTopBorder + 1]?.includes("slash commands")).toBe(true);
    expect(lines.findIndex((line) => line.includes("c30"))).toBe(editorTopBorder - 1);
    expect(lines.findIndex((line) => line.includes("/tmp/proj"))).toBe(rows - 2);
    unmount();
  });

  test("the slash picker clamps to the rows the terminal can spare on a short terminal", () => {
    const rows = 16;
    const { lastFrame, unmount } = mountLayout({
      columns: 100,
      rows,
      showRail: false,
      seed: (dispatch) => {
        seedThirtyChatLines(dispatch);
        dispatch(Actions.setEditorText("/"));
      },
    });
    const lines = lastFrame().split("\n").map(stripAnsi);
    const pickerHeight = 10;
    const editorTopBorder = rows - 2 - pickerHeight - 3;
    expect(lines.findIndex((line) => line.includes("─"))).toBe(editorTopBorder);
    expect(lines.some((line) => line.includes("…and 3 more"))).toBe(true);
    expect(lines.some((line) => line.includes("/team"))).toBe(false);
    expect(lines.findIndex((line) => line.includes("c30"))).toBe(0);
    expect(lines.findIndex((line) => line.includes("/tmp/proj"))).toBe(rows - 2);
    unmount();
  });

  test("mention Tab replaces the typed query token instead of appending after it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "jie-layout-mention-"));
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "main.ts"), "");
    try {
      const { stdin, unmount, stateStore } = mountLayout({
        columns: 100,
        rows: 30,
        showRail: false,
        seed: (dispatch) => {
          dispatch(Actions.setEnvironment(dir, "main", false));
          dispatch(Actions.setEditorText("fix @main"));
        },
      });
      await new Promise((r) => setTimeout(r, 30));
      stdin.write("\t");
      await new Promise((r) => setTimeout(r, 30));
      expect(stateStore.getState().editorText).toBe("fix @src/main.ts ");
      unmount();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

function seedThirtyChatLines(dispatch: (action: Action) => void): void {
  const text = Array.from({ length: 30 }, (_, i) => `c${String(i + 1).padStart(2, "0")}`).join("\n\n");
  dispatch(Actions.receiveEvent(Events.userPrompt({ kind: "user" }, "demo", "hi", "general-1")));
  dispatch(Actions.receiveEvent(Events.agentStreamChunk(
    { kind: "agent", teamId: "demo", agentKey: "general-1" }, 1, 1, "text", text,
  )));
}

const ANSI_COLOR = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*m", "g");

function stripAnsi(text: string): string {
  return text.replace(ANSI_COLOR, "");
}
