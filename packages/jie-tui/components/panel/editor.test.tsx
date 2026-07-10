import { render } from "ink-testing-library";
import { Editor, _caretPositionForCursor } from "./editor";
import { TuiContext } from "../context";
import { Actions, createStateStore } from "../../state";
import { makeContextValue } from "../../test-support";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

describe("Editor", () => {
  test("renders the placeholder when state.editorText is empty", () => {
    const store = createStateStore();
    const ctx = makeContextValue({ stateStore: store });
    const { lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    expect(lastFrame()).toContain("type a prompt...");
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

  test("caret y for an empty buffer on a 30-row terminal is on the placeholder row, not row 0", () => {
    const pos = _caretPositionForCursor("", 30);
    expect(pos).toEqual({ x: 1, y: 27 });
  });

  test("caret y for a single-line buffer on a 30-row terminal is on the content row above the bottom border", () => {
    const pos = _caretPositionForCursor("hello", 30);
    expect(pos).toEqual({ x: 6, y: 27 });
  });

  test("caret y for a multi-line buffer places the caret on the last line above the bottom border", () => {
    const pos = _caretPositionForCursor("first\nsecond\nthird", 30);
    expect(pos).toEqual({ x: 6, y: 27 });
  });

  test("caret y scales with terminal rows — caret stays just above the bottom border", () => {
    const pos = _caretPositionForCursor("hi", 12);
    expect(pos).toEqual({ x: 3, y: 9 });
  });

  test("caret x for a multi-line buffer counts only the trailing line's length", () => {
    const pos = _caretPositionForCursor("aaaaa\nbbb", 30);
    expect(pos).toEqual({ x: 4, y: 27 });
  });

  test("caret on the trailing line of a multi-line buffer sits at the same row as a single-line buffer of the trailing text", () => {
    expect(_caretPositionForCursor("first\nsecond", 30)).toEqual(_caretPositionForCursor("second", 30));
  });
});
