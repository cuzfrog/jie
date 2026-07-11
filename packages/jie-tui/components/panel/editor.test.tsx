import { render } from "ink-testing-library";
import { Editor } from "./editor";
import { TuiContext } from "../context";
import { Actions, createStateStore } from "../../state";
import { makeContextValue } from "../../test-support";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

describe("Editor", () => {
  test("does not render a placeholder when state.editorText is empty", () => {
    const store = createStateStore();
    const ctx = makeContextValue({ stateStore: store });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    expect(lastFrame()).not.toContain("type a prompt");
    unmount();
  });

  test("renders an inline block cursor when the buffer is empty", () => {
    const store = createStateStore();
    const ctx = makeContextValue({ stateStore: store });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    const lines = lastFrame().split("\n");
    const topBorder = lines.findIndex((line) => line.includes("─"));
    const bottomBorder = (() => {
      for (let i = lines.length - 1; i > topBorder; i--) {
        if (lines[i]?.includes("─") === true) return i;
      }
      return -1;
    })();
    expect(topBorder).toBeGreaterThanOrEqual(0);
    expect(bottomBorder).toBeGreaterThan(topBorder);
    const contentLines = lines.slice(topBorder + 1, bottomBorder);
    expect(contentLines).toHaveLength(1);
    expect(contentLines[0]?.trim()).toBe("▌");
    unmount();
  });

  test("renders state.editorText when set in the store", async () => {
    const store = createStateStore();
    store.dispatch(Actions.setEditorText("hello"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(lastFrame()).toContain("hello");
    unmount();
  });

  test("Editor component uses state.editorText (no local buffer)", () => {
    const store = createStateStore();
    store.dispatch(Actions.setEditorText("abc"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    store.dispatch(Actions.setEditorText("xy"));
    expect(store.getState().editorText).toBe("xy");
    unmount();
  });

  test("Enter with empty state.editorText submits the typed chunk", async () => {
    const store = createStateStore();
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const submitted: string[] = [];
    store.subscribe((action) => {
      if (action.type === Actions.submitEditorText("").type) {
        submitted.push(action.payload.text);
      }
      return Promise.resolve();
    });
    const { stdin, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    stdin.write("/team my-team\r");
    await new Promise((r) => setTimeout(r, 30));
    expect(submitted).toContain("/team my-team");
    expect(store.getState().editorText).toBe("");
    unmount();
  });

  test("typing into an empty editor clears stale error banners", async () => {
    const store = createStateStore();
    store.dispatch(Actions.setErrorMessage("stale: previous failure"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { stdin, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    stdin.write("/");
    await new Promise((r) => setTimeout(r, 30));
    expect(store.getState().errorBanner).toBeNull();
    unmount();
  });

  test("does not render left or right border characters", () => {
    const store = createStateStore();
    const ctx = makeContextValue({ stateStore: store });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    const lines = lastFrame().split("\n");
    const offending = lines.filter((line) => line.startsWith("│") || line.endsWith("│"));
    expect(offending).toEqual([]);
    unmount();
  });

  test("renders exactly one content row when buffer is a single empty line", () => {
    const store = createStateStore();
    const ctx = makeContextValue({ stateStore: store });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    const lines = lastFrame().split("\n").filter((line) => line.length > 0);
    const top = lines.findIndex((line) => line.includes("─"));
    const bottom = (() => {
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i]?.includes("─") === true) return i;
      }
      return -1;
    })();
    expect(top).toBeGreaterThanOrEqual(0);
    expect(bottom).toBeGreaterThan(top);
    const contentCount = bottom - top - 1;
    expect(contentCount).toBe(1);
    unmount();
  });

  test("grows the content height when buffer contains newlines", () => {
    const store = createStateStore();
    store.dispatch(Actions.setEditorText("line1\nline2\nline3"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    const frame = lastFrame();
    expect(frame).toContain("line1");
    expect(frame).toContain("line2");
    expect(frame).toContain("line3");
    unmount();
  });

  test("renders an inline block cursor at the end of a single-line buffer", async () => {
    const store = createStateStore();
    store.dispatch(Actions.setEditorText("ab44ds"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    const frame = lastFrame();
    expect(frame).toContain("ab44ds▌");
    const lines = frame.split("\n");
    const contentLine = lines.find((line) => line.includes("ab44ds"));
    expect(contentLine).toBeDefined();
    expect(contentLine!.endsWith("ab44ds▌")).toBe(true);
    unmount();
  });

  test("renders the cursor block only on the trailing line of a multi-line buffer", async () => {
    const store = createStateStore();
    store.dispatch(Actions.setEditorText("line1\nline2\nline3"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    const frame = lastFrame();
    expect(frame).toContain("line3▌");
    const lines = frame.split("\n").filter((line) => line.length > 0);
    const cursorCount = lines.filter((line) => line.includes("▌")).length;
    expect(cursorCount).toBe(1);
    expect(frame).toContain("line1");
    expect(frame).toContain("line2");
    expect(frame).toContain("line3");
    unmount();
  });

  test("trailing whitespace keeps the cursor block immediately after the last character of the trailing line", async () => {
    const store = createStateStore();
    store.dispatch(Actions.setEditorText("ab44ds  "));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    const frame = lastFrame();
    const contentLine = frame.split("\n").find((line) => line.includes("ab44ds")) ?? "";
    const cursorIndex = contentLine.indexOf("▌");
    expect(cursorIndex).toBeGreaterThan(0);
    const beforeCursor = contentLine.slice(0, cursorIndex);
    expect(beforeCursor.endsWith("ab44ds  ")).toBe(true);
    unmount();
  });

  test("trailing newline puts the cursor block at column 0 of the content area", async () => {
    const store = createStateStore();
    store.dispatch(Actions.setEditorText("abc\n"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    const frame = lastFrame();
    const lines = frame.split("\n");
    const topBorder = lines.findIndex((line) => line.includes("─"));
    const bottomBorder = (() => {
      for (let i = lines.length - 1; i > topBorder; i--) {
        if (lines[i]?.includes("─") === true) return i;
      }
      return -1;
    })();
    const contentLines = lines.slice(topBorder + 1, bottomBorder);
    expect(contentLines).toHaveLength(2);
    const abcLine = contentLines[0] ?? "";
    const cursorLine = contentLines.find((line) => line.includes("▌")) ?? "";
    expect(abcLine).toContain("abc");
    expect(abcLine.includes("▌")).toBe(false);
    expect(cursorLine.trimEnd().endsWith("▌")).toBe(true);
    const cursorIndex = cursorLine.indexOf("▌");
    expect(cursorIndex).toBe(1);
    expect(cursorLine.slice(0, cursorIndex)).toBe(" ");
    unmount();
  });
});
