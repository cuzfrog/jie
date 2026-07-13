import { Events } from "@cuzfrog/jie-platform";
import { Layout } from "./layout";
import { TuiContext } from "./context";
import { Actions, createStateStore } from "../state";
import { render } from "../test-renderer";
import { makeContextValue } from "../test-support";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

function mountLayoutWithScroll(opts: {
  columns: number;
  rows: number;
  showRail: boolean;
  turns: number;
  scrollOffset: number;
  editorLines: number;
}): { lastFrame: () => string; unmount: () => void } {
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
  const sender = { kind: "agent", teamId: "demo", agentKey: "general-1" } as const;
  for (let i = 0; i < opts.turns; i++) {
    stateStore.dispatch(Actions.receiveEvent(Events.userPrompt({ kind: "user" }, "demo", `prompt-${i}`, "general-1")));
    stateStore.dispatch(Actions.receiveEvent(Events.agentTurnStart(sender)));
    stateStore.dispatch(Actions.receiveEvent(Events.agentStreamChunk(sender, i + 1, 0, "text", `reply-${i}`)));
    stateStore.dispatch(Actions.receiveEvent(Events.agentIdle(sender, "stop")));
  }
  if (opts.scrollOffset === 0) {
    stateStore.dispatch(Actions.jumpChat("demo:general-1", "top"));
  } else if (opts.scrollOffset === Number.POSITIVE_INFINITY) {
    stateStore.dispatch(Actions.jumpChat("demo:general-1", "tail"));
  } else {
    stateStore.dispatch(Actions.scrollChat("demo:general-1", opts.scrollOffset));
  }
  if (opts.editorLines > 0) {
    const text = new Array(opts.editorLines).fill("x").join("\n");
    stateStore.dispatch(Actions.setEditorText(text));
  }
  const state = stateStore.getState();
  const ctx = makeContextValue({ stateStore, state });
  const { lastFrame, unmount } = render(
    <TuiContext.Provider value={ctx}>
      <Layout columns={opts.columns} rows={opts.rows} />
    </TuiContext.Provider>,
  );
  return { lastFrame: () => lastFrame() ?? "", unmount };
}

function findEditorTopBorder(lines: ReadonlyArray<string>): number {
  for (let r = 0; r < lines.length; r++) {
    if ((lines[r] ?? "").includes("─")) return r;
  }
  return -1;
}

function dumpFrame(label: string, frame: string): void {
  const lines = frame.split("\n");
  console.log(`--- ${label} (lines=${lines.length}) ---`);
  for (let r = 0; r < lines.length; r++) {
    console.log(`[${r}] ${JSON.stringify(lines[r])}`);
  }
}

describe("Layout with chat scrolled up", () => {
  test("scrolled-to-top: latest turn does not render past chat pane border", () => {
    const rows = 30;
    const { lastFrame, unmount } = mountLayoutWithScroll({
      columns: 100,
      rows,
      showRail: false,
      turns: 30,
      scrollOffset: 0,
      editorLines: 0,
    });
    const lines = lastFrame().split("\n");
    expect(lines.findIndex((l) => l.includes("prompt-29"))).toBe(-1);
    unmount();
  });

  test("scrolled-to-top with 4-line editor at 100x30: chat content stays above editor", () => {
    const rows = 30;
    const { lastFrame, unmount } = mountLayoutWithScroll({
      columns: 100,
      rows,
      showRail: false,
      turns: 30,
      scrollOffset: 0,
      editorLines: 4,
    });
    const lines = lastFrame().split("\n");
    const editorTopBorder = findEditorTopBorder(lines);
    expect(editorTopBorder).toBeGreaterThan(0);
    for (let r = editorTopBorder; r < lines.length; r++) {
      expect(lines[r] ?? "").not.toContain("prompt-");
      expect(lines[r] ?? "").not.toContain("reply-");
    }
    unmount();
  });

  test("scrolled-to-top with 6-line editor at 80x24: chat content stays above editor", () => {
    const rows = 24;
    const { lastFrame, unmount } = mountLayoutWithScroll({
      columns: 80,
      rows,
      showRail: false,
      turns: 30,
      scrollOffset: 0,
      editorLines: 6,
    });
    const frame = lastFrame();
    dumpFrame("80x24 editor=6 scrolled to top", frame);
    const lines = frame.split("\n");
    const editorTopBorder = findEditorTopBorder(lines);
    expect(editorTopBorder).toBeGreaterThan(0);
    for (let r = editorTopBorder; r < lines.length; r++) {
      expect(lines[r] ?? "").not.toContain("prompt-");
      expect(lines[r] ?? "").not.toContain("reply-");
    }
    unmount();
  });

  test("scrolled mid-way (offset 1, hiddenRows>0): chat content stays above editor", () => {
    const rows = 24;
    const { lastFrame, unmount } = mountLayoutWithScroll({
      columns: 80,
      rows,
      showRail: false,
      turns: 30,
      scrollOffset: 1,
      editorLines: 0,
    });
    const frame = lastFrame();
    dumpFrame("80x24 offset=1", frame);
    const lines = frame.split("\n");
    const editorTopBorder = findEditorTopBorder(lines);
    expect(editorTopBorder).toBeGreaterThan(0);
    for (let r = editorTopBorder; r < lines.length; r++) {
      expect(lines[r] ?? "").not.toContain("prompt-");
      expect(lines[r] ?? "").not.toContain("reply-");
    }
    unmount();
  });

  test("scrolled mid-way (offset 30): chat content stays above editor", () => {
    const rows = 24;
    const { lastFrame, unmount } = mountLayoutWithScroll({
      columns: 80,
      rows,
      showRail: false,
      turns: 30,
      scrollOffset: 30,
      editorLines: 0,
    });
    const frame = lastFrame();
    dumpFrame("80x24 offset=30", frame);
    const lines = frame.split("\n");
    const editorTopBorder = findEditorTopBorder(lines);
    expect(editorTopBorder).toBeGreaterThan(0);
    for (let r = editorTopBorder; r < lines.length; r++) {
      expect(lines[r] ?? "").not.toContain("prompt-");
      expect(lines[r] ?? "").not.toContain("reply-");
    }
    unmount();
  });

  test("scrolled-to-top at 60x20 (tight): chat content stays above editor", () => {
    const rows = 20;
    const { lastFrame, unmount } = mountLayoutWithScroll({
      columns: 60,
      rows,
      showRail: false,
      turns: 30,
      scrollOffset: 0,
      editorLines: 0,
    });
    const frame = lastFrame();
    dumpFrame("60x20 scrolled to top", frame);
    const lines = frame.split("\n");
    const editorTopBorder = findEditorTopBorder(lines);
    expect(editorTopBorder).toBeGreaterThan(0);
    for (let r = editorTopBorder; r < lines.length; r++) {
      expect(lines[r] ?? "").not.toContain("prompt-");
      expect(lines[r] ?? "").not.toContain("reply-");
    }
    unmount();
  });
});