import { Events } from "@cuzfrog/jie-platform";
import type { ReactElement } from "react";
import { App } from "../app";
import { Actions, createStateStore, type TuiStateStore } from "../../state";
import { render } from "../../test-renderer";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

interface LiveInstance {
  readonly frames: string[];
  readonly stateStore: TuiStateStore;
  waitFlush(): Promise<void>;
  unmount(): void;
}

function mountLive(opts: { turns: number; initialScrollOffset: number; editorLines: number }): LiveInstance {
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
  return mountLiveFillHistory(stateStore, opts);
}

function mountLiveFillHistory(stateStore: TuiStateStore, opts: { turns: number; initialScrollOffset: number; editorLines: number }): LiveInstance {
  const sender = { kind: "agent", teamId: "demo", agentKey: "general-1" } as const;
  for (let i = 0; i < opts.turns; i++) {
    stateStore.dispatch(Actions.receiveEvent(Events.userPrompt({ kind: "user" }, "demo", `prompt-${i}`, "general-1")));
    stateStore.dispatch(Actions.receiveEvent(Events.agentTurnStart(sender)));
    stateStore.dispatch(Actions.receiveEvent(Events.agentStreamChunk(sender, i + 1, 0, "text", `reply-${i}`)));
    stateStore.dispatch(Actions.receiveEvent(Events.agentIdle(sender, "stop")));
  }
  if (opts.initialScrollOffset === 0) {
    stateStore.dispatch(Actions.jumpChat("demo:general-1", "top"));
  } else if (opts.initialScrollOffset === Number.POSITIVE_INFINITY) {
    stateStore.dispatch(Actions.jumpChat("demo:general-1", "tail"));
  } else {
    stateStore.dispatch(Actions.scrollChat("demo:general-1", opts.initialScrollOffset));
  }
  if (opts.editorLines > 0) {
    stateStore.dispatch(Actions.setEditorText(new Array(opts.editorLines).fill("x").join("\n")));
  }
  const tree: ReactElement = <App stateStore={stateStore} />;
  const instance = render(tree, { liveMode: true, stdoutIsTTY: true });
  return {
    frames: instance.stdout.frames,
    stateStore,
    waitFlush: instance.waitUntilRenderFlush,
    unmount: (): void => { instance.unmount(); instance.cleanup(); },
  };
}

const ANSI_CSI = /\[\d+[A-Za-z]/g;
const ANSI_DEC = /\[\?\d+[a-z]/g;
const stripAnsi = (s: string): string => s.replace(ANSI_CSI, "").replace(ANSI_DEC, "");

function pickContentFrame(frames: ReadonlyArray<string>): string {
  let best = "";
  for (const f of frames) {
    const stripped = stripAnsi(f);
    if (stripped.length > best.length) best = stripped;
  }
  return best;
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
    console.log(`[${r}] ${JSON.stringify(lines[r] ?? "")}`);
  }
}

describe("ChatPane overflow in live render mode", () => {
  test("initial mount, scrolled to top: no chat bleed into editor/footer", async () => {
    const live = mountLive({ turns: 30, initialScrollOffset: 0, editorLines: 0 });
    await live.waitFlush();
    await new Promise<void>((r) => setTimeout(r, 400));
    const lastFrame = pickContentFrame(live.frames);
    dumpFrame("initial mount, scrolled to top (best frame)", lastFrame);
    const lines = lastFrame.split("\n");
    const editorTopBorder = findEditorTopBorder(lines);
    expect(editorTopBorder).toBeGreaterThan(0);
    for (let r = editorTopBorder; r < lines.length; r++) {
      const row = lines[r] ?? "";
      expect(row).not.toContain("prompt-");
      expect(row).not.toContain("reply-");
    }
    live.unmount();
  });

  test("editor shrinks from 12 lines to 1 line (append-mode shrink path): no leaked rows remain", async () => {
    const live = mountLive({ turns: 30, initialScrollOffset: 0, editorLines: 12 });
    await live.waitFlush();
    await new Promise<void>((r) => setTimeout(r, 400));
    live.stateStore.dispatch(Actions.setEditorText(""));
    await live.waitFlush();
    await new Promise<void>((r) => setTimeout(r, 400));
    let largeFrameCount = 0;
    let leakCount = 0;
    for (let i = 0; i < live.frames.length; i++) {
      const stripped = stripAnsi(live.frames[i] ?? "");
      if (stripped.length < 200) continue;
      largeFrameCount++;
      const lines = stripped.split("\n");
      const editorTopBorder = findEditorTopBorder(lines);
      if (editorTopBorder < 0) continue;
      for (let r = editorTopBorder; r < lines.length; r++) {
        const row = lines[r] ?? "";
        if (row.includes("prompt-") || row.includes("reply-")) {
          leakCount++;
          dumpFrame(`frame ${i} (len=${stripped.length}) leaks at row ${r}`, stripped);
        }
      }
    }
    console.log(`Shrink-path: ${largeFrameCount} large frames, ${leakCount} leaks`);
    expect(leakCount).toBe(0);
    live.unmount();
  });

  test("scroll sequence with 12-line editor: chat content stays above editor in every frame", async () => {
    const live = mountLive({ turns: 30, initialScrollOffset: 0, editorLines: 12 });
    await live.waitFlush();
    await new Promise<void>((r) => setTimeout(r, 400));
    live.stateStore.dispatch(Actions.jumpChat("demo:general-1", "tail"));
    await live.waitFlush();
    await new Promise<void>((r) => setTimeout(r, 400));
    live.stateStore.dispatch(Actions.scrollChat("demo:general-1", -5));
    await live.waitFlush();
    await new Promise<void>((r) => setTimeout(r, 400));
    live.stateStore.dispatch(Actions.scrollChat("demo:general-1", -5));
    await live.waitFlush();
    await new Promise<void>((r) => setTimeout(r, 400));
    live.stateStore.dispatch(Actions.jumpChat("demo:general-1", "top"));
    await live.waitFlush();
    await new Promise<void>((r) => setTimeout(r, 400));
    let largeFrameCount = 0;
    let leakCount = 0;
    for (let i = 0; i < live.frames.length; i++) {
      const stripped = stripAnsi(live.frames[i] ?? "");
      if (stripped.length < 200) continue;
      largeFrameCount++;
      const lines = stripped.split("\n");
      const editorTopBorder = findEditorTopBorder(lines);
      if (editorTopBorder < 0) continue;
      for (let r = editorTopBorder; r < lines.length; r++) {
        const row = lines[r] ?? "";
        if (row.includes("prompt-") || row.includes("reply-")) {
          leakCount++;
          dumpFrame(`frame ${i} (len=${stripped.length}) leaks at row ${r}`, stripped);
        }
      }
    }
    console.log(`Saw ${largeFrameCount} large frames, ${leakCount} leaks`);
    expect(leakCount).toBe(0);
    live.unmount();
  });

  test("scroll sequence: every accumulated frame keeps chat content above editor", async () => {
    const live = mountLive({ turns: 30, initialScrollOffset: 0, editorLines: 0 });
    await live.waitFlush();
    await new Promise<void>((r) => setTimeout(r, 300));
    live.stateStore.dispatch(Actions.jumpChat("demo:general-1", "tail"));
    await live.waitFlush();
    await new Promise<void>((r) => setTimeout(r, 300));
    live.stateStore.dispatch(Actions.scrollChat("demo:general-1", -5));
    await live.waitFlush();
    await new Promise<void>((r) => setTimeout(r, 300));
    live.stateStore.dispatch(Actions.scrollChat("demo:general-1", -5));
    await live.waitFlush();
    await new Promise<void>((r) => setTimeout(r, 300));
    live.stateStore.dispatch(Actions.scrollChat("demo:general-1", -5));
    await live.waitFlush();
    await new Promise<void>((r) => setTimeout(r, 300));
    live.stateStore.dispatch(Actions.jumpChat("demo:general-1", "top"));
    await live.waitFlush();
    await new Promise<void>((r) => setTimeout(r, 300));
    let largeFrameCount = 0;
    for (let i = 0; i < live.frames.length; i++) {
      const stripped = stripAnsi(live.frames[i] ?? "");
      if (stripped.length < 200) continue;
      largeFrameCount++;
      const lines = stripped.split("\n");
      const editorTopBorder = findEditorTopBorder(lines);
      if (editorTopBorder < 0) continue;
      for (let r = editorTopBorder; r < lines.length; r++) {
        const row = lines[r] ?? "";
        if (row.includes("prompt-") || row.includes("reply-")) {
          dumpFrame(`frame ${i} (len=${stripped.length}) has chat at row ${r}`, stripped);
          expect(row).not.toContain("prompt-");
          expect(row).not.toContain("reply-");
        }
      }
    }
    console.log(`Saw ${largeFrameCount} large frames out of ${live.frames.length} total`);
    expect(largeFrameCount).toBeGreaterThan(1);
    live.unmount();
  });
});