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
    const lines = (lastFrame() ?? "").split("\n");
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
    // TextInput renders an empty cursor as an ANSI inverse-space block.
    expect(contentLines[0]).toContain("\u001b[7m \u001b[27m");
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
    // Send the chunk and the Enter keystroke as separate events so that
    // TextInput processes the chunk as typed text before seeing key.return.
    // (ink-testing-library passes each stdin.write as a single chunk; a
    // combined "/team my-team\r" would be parsed as one input where key.return
    // is true, bypassing the text insertion and submitting an empty value.)
    stdin.write("/team my-team");
    await new Promise((r) => setTimeout(r, 30));
    stdin.write("\r");
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
    const lines = (lastFrame() ?? "").split("\n");
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
    const lines = (lastFrame() ?? "").split("\n").filter((line) => line.length > 0);
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
    const frame = lastFrame() ?? "";
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
    const frame = lastFrame() ?? "";
    expect(frame).toContain("ab44ds");
    expect(frame).toContain("\u001b[7m \u001b[27m");
    const lines = frame.split("\n");
    const contentLine = lines.find((line) => line.includes("ab44ds"));
    expect(contentLine).toBeDefined();
    // cursor block is rendered as ANSI inverse space, placed after "ab44ds"
    expect(contentLine!.replace(/\u001b\[[0-9;]*m/g, "")).toMatch(/^ ab44ds $/);
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
    const frame = lastFrame() ?? "";
    expect(frame).toContain("line1");
    expect(frame).toContain("line2");
    expect(frame).toContain("line3");
    // The trailing line carries the cursor block (inverse-space) directly after
    // its content. Earlier lines must not contain the cursor.
    const cursorRe = /\u001b\[7m \u001b\[27m/;
    const lines = frame.split("\n");
    const trailing = lines.find((line) => line.includes("line3"));
    expect(trailing).toBeDefined();
    expect(cursorRe.test(trailing!)).toBe(true);
    for (const line of lines) {
      if (line.includes("line1") || line.includes("line2")) {
        expect(cursorRe.test(line)).toBe(false);
      }
    }
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
    const frame = lastFrame() ?? "";
    const contentLine = frame.split("\n").find((line) => line.includes("ab44ds")) ?? "";
    const cursorIndex = contentLine.indexOf("\u001b[7m");
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
    const frame = lastFrame() ?? "";
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
    expect(abcLine).toContain("abc");
    expect(abcLine).not.toContain("\u001b[7m");
    const cursorLine = contentLines.find((line) => line.includes("\u001b[7m")) ?? "";
    expect(cursorLine).toBeDefined();
    // Cursor block sits at the column after the box's left padding (column 1
    // of the visible content area), directly under the previous line.
    const cursorIndex = cursorLine.indexOf("\u001b[7m");
    expect(cursorIndex).toBe(1);
    expect(cursorLine.slice(0, cursorIndex)).toBe(" ");
    unmount();
  });

  test("left arrow at start of buffer is a no-op (cursor stays at col 0)", async () => {
    const store = createStateStore();
    store.dispatch(Actions.setEditorText("abc"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { stdin, lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    stdin.write("\x1b[D");
    await new Promise((r) => setTimeout(r, 10));
    stdin.write("\x1b[D");
    await new Promise((r) => setTimeout(r, 10));
    stdin.write("\x1b[D");
    await new Promise((r) => setTimeout(r, 10));
    stdin.write("\x1b[D");
    await new Promise((r) => setTimeout(r, 30));
    const frame = lastFrame() ?? "";
    const contentLine = frame.split("\n").find((line) => line.includes("c")) ?? "";
    const highlightIdx = contentLine.indexOf("\x1b[7m");
    const highlightedChar = contentLine.slice(highlightIdx + 4, highlightIdx + 5);
    expect(highlightedChar).toBe("a");
    unmount();
  });

  test("backspace in the middle of a single-line buffer removes the char before the cursor", async () => {
    const store = createStateStore();
    store.dispatch(Actions.setEditorText("abcde"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { stdin, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    stdin.write("\x1b[D");
    await new Promise((r) => setTimeout(r, 10));
    stdin.write("\x1b[D");
    await new Promise((r) => setTimeout(r, 10));
    stdin.write("\x7f");
    await new Promise((r) => setTimeout(r, 30));
    expect(store.getState().editorText).toBe("abde");
    unmount();
  });

  test("backspace at the end of a line removes the trailing character (does NOT join lines)", async () => {
    const store = createStateStore();
    store.dispatch(Actions.setEditorText("foo\nbar"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { stdin, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    stdin.write("\x7f");
    await new Promise((r) => setTimeout(r, 30));
    expect(store.getState().editorText).toBe("foo\nba");
    unmount();
  });

  test("delete in the middle of a single-line buffer removes the character AT the cursor (forward delete)", async () => {
    // Delete (forward delete) removes the grapheme at the cursor. This differs
    // from Backspace, which removes the grapheme BEFORE the cursor. The Editor
    // owns both semantics; see tui-pi-editor-reference.md §8.
    const store = createStateStore();
    store.dispatch(Actions.setEditorText("abcde"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { stdin, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    // Move cursor from end (col=5) to col=1 (between "a" and "b"). Then Delete.
    stdin.write("\x1b[D");
    await new Promise((r) => setTimeout(r, 10));
    stdin.write("\x1b[D");
    await new Promise((r) => setTimeout(r, 10));
    stdin.write("\x1b[D");
    await new Promise((r) => setTimeout(r, 10));
    stdin.write("\x1b[D");
    await new Promise((r) => setTimeout(r, 10));
    stdin.write("\x1b[3~");
    await new Promise((r) => setTimeout(r, 30));
    expect(store.getState().editorText).toBe("acde");
    unmount();
  });

  test("delete at the start of the buffer removes the first character", async () => {
    // Forward delete at col=0 deletes the first grapheme of the line. The
    // cursor stays put so subsequent insertions place text before the deletion.
    const store = createStateStore();
    store.dispatch(Actions.setEditorText("abcde"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { stdin, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    // Move cursor from end (col=5) to col=0. Then Delete.
    for (let i = 0; i < 5; i++) {
      stdin.write("\x1b[D");
      await new Promise((r) => setTimeout(r, 10));
    }
    stdin.write("\x1b[3~");
    await new Promise((r) => setTimeout(r, 30));
    expect(store.getState().editorText).toBe("bcde");
    unmount();
  });

  test("delete at the end of a non-last line joins it with the next line (forward-delete line merge)", async () => {
    // At end-of-line, forward delete joins with the next line — the symmetric
    // operation to backspace-joining with the previous line at col=0.
    const store = createStateStore();
    store.dispatch(Actions.setEditorText("foo\nbar"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { stdin, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    // Move cursor up one line; the cursor lands at end of "foo" (col=3).
    stdin.write("\x1b[A");
    await new Promise((r) => setTimeout(r, 10));
    stdin.write("\x1b[3~");
    await new Promise((r) => setTimeout(r, 30));
    expect(store.getState().editorText).toBe("foobar");
    unmount();
  });

  test("backspace at the start of the buffer is a no-op (does not delete the first character)", async () => {
    // Backspace at (line=0, col=0) is a no-op. There is nothing to delete
    // before the cursor and there is no previous line to join with. The cursor
    // stays put.
    const store = createStateStore();
    store.dispatch(Actions.setEditorText("abc"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { stdin, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    stdin.write("\x1b[D");
    await new Promise((r) => setTimeout(r, 10));
    stdin.write("\x1b[D");
    await new Promise((r) => setTimeout(r, 10));
    stdin.write("\x1b[D");
    await new Promise((r) => setTimeout(r, 10));
    stdin.write("\x7f");
    await new Promise((r) => setTimeout(r, 30));
    expect(store.getState().editorText).toBe("abc");
    unmount();
  });

  test("delete at the end of the last line of a single-line buffer is a no-op", async () => {
    // Forward delete at end-of-last-line of a single-line buffer is a no-op.
    // There is no character at the cursor to delete, and no next line to
    // join with.
    const store = createStateStore();
    store.dispatch(Actions.setEditorText("abc"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { stdin, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    stdin.write("\x1b[3~");
    await new Promise((r) => setTimeout(r, 30));
    expect(store.getState().editorText).toBe("abc");
    unmount();
  });

  test("backspace at the end of a non-last line removes the char before the cursor (not join lines)", async () => {
    // Example 1 from tmp/issue-example.md:
    // cursor at end of last non-empty line in "abc\n\nabc" should remove the 'c'
    // before the cursor, NOT join with the previous (empty) line.
    const store = createStateStore();
    store.dispatch(Actions.setEditorText("abc\n\nabc"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { stdin, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    stdin.write("\x7f");
    await new Promise((r) => setTimeout(r, 30));
    expect(store.getState().editorText).toBe("abc\n\nab");
    unmount();
  });

  test("backspace at the start of a non-first line joins the current line with the previous line", async () => {
    // Example 2 from tmp/issue-example.md:
    // cursor at start of line 1 in "abc\nabc" should join with line 0.
    const store = createStateStore();
    store.dispatch(Actions.setEditorText("abc\nabc"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { stdin, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    // cursor starts at (line=1, col=3). Move left 3 times to reach col 0 of line 1.
    stdin.write("\x1b[D");
    await new Promise((r) => setTimeout(r, 10));
    stdin.write("\x1b[D");
    await new Promise((r) => setTimeout(r, 10));
    stdin.write("\x1b[D");
    await new Promise((r) => setTimeout(r, 10));
    stdin.write("\x7f");
    await new Promise((r) => setTimeout(r, 30));
    expect(store.getState().editorText).toBe("abcabc");
    unmount();
  });

  test("backspace at the start of the last line joins it with the previous line", async () => {
    const store = createStateStore();
    store.dispatch(Actions.setEditorText("abc\nbar"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { stdin, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    // cursor is at line=1, col=3 (end of "bar"). Move to col 0.
    stdin.write("\x1b[D");
    await new Promise((r) => setTimeout(r, 10));
    stdin.write("\x1b[D");
    await new Promise((r) => setTimeout(r, 10));
    stdin.write("\x1b[D");
    await new Promise((r) => setTimeout(r, 10));
    stdin.write("\x7f");
    await new Promise((r) => setTimeout(r, 30));
    expect(store.getState().editorText).toBe("abcbar");
    unmount();
  });

  test("delete at the end of the last line of a multi-line buffer is a no-op", async () => {
    // Forward delete at end-of-last-line of a multi-line buffer is also a no-op.
    const store = createStateStore();
    store.dispatch(Actions.setEditorText("abc\nxyz"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { stdin, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    stdin.write("\x1b[3~");
    await new Promise((r) => setTimeout(r, 30));
    expect(store.getState().editorText).toBe("abc\nxyz");
    unmount();
  });

  test("down arrow moves the cursor from line 0 to line 1", async () => {
    // Multi-line cursor positioning: down arrow from end of line 0 places the
    // cursor at end of line 1. See tui-pi-editor-reference.md §9.
    const store = createStateStore();
    store.dispatch(Actions.setEditorText("abc\ndef"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { stdin, lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    stdin.write("\x1b[B");
    await new Promise((r) => setTimeout(r, 30));
    const frame = lastFrame() ?? "";
    const lines = frame.split("\n");
    const defLine = lines.find((line) => line.includes("def")) ?? "";
    expect(defLine).toContain("\u001b[7m");
    // After stripping ANSI, "def" must be followed by a single trailing space —
    // the cursor block sits on the immediately-after position.
    const stripped = defLine.replace(/\u001b\[[0-9;]*m/g, "");
    expect(stripped).toMatch(/^.*def $/);
    unmount();
  });

  test("up arrow moves the cursor from line 1 to line 0", async () => {
    const store = createStateStore();
    store.dispatch(Actions.setEditorText("abc\ndef"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { stdin, lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    stdin.write("\x1b[A");
    await new Promise((r) => setTimeout(r, 30));
    const frame = lastFrame() ?? "";
    const lines = frame.split("\n");
    const abcLine = lines.find((line) => line.includes("abc")) ?? "";
    expect(abcLine).toContain("\u001b[7m");
    unmount();
  });

  test("up arrow on a single-line buffer clamps to the first line", async () => {
    const store = createStateStore();
    store.dispatch(Actions.setEditorText("abc"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { stdin, lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    stdin.write("\x1b[A");
    await new Promise((r) => setTimeout(r, 30));
    const frame = lastFrame() ?? "";
    const contentLine = frame.split("\n").find((line) => line.includes("abc")) ?? "";
    expect(contentLine).toContain("\u001b[7m");
    expect(contentLine.indexOf("\u001b[7m")).toBe(contentLine.lastIndexOf("c") + 1);
    unmount();
  });

  test("down arrow on a single-line buffer clamps to the last line", async () => {
    const store = createStateStore();
    store.dispatch(Actions.setEditorText("abc"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { stdin, lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    stdin.write("\x1b[B");
    await new Promise((r) => setTimeout(r, 30));
    const frame = lastFrame() ?? "";
    const contentLine = frame.split("\n").find((line) => line.includes("abc")) ?? "";
    expect(contentLine).toContain("\u001b[7m");
    expect(contentLine.indexOf("\u001b[7m")).toBe(contentLine.lastIndexOf("c") + 1);
    unmount();
  });

  test("up arrow clamps cursorCol when the line above is shorter", async () => {
    const store = createStateStore();
    store.dispatch(Actions.setEditorText("ab\nabcd"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { stdin, lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    stdin.write("\x1b[A");
    await new Promise((r) => setTimeout(r, 30));
    const frame = lastFrame() ?? "";
    const lines = frame.split("\n");
    const shortLine = lines.find((line) => line.includes("ab") && !line.includes("abcd")) ?? "";
    expect(shortLine).toContain("\u001b[7m");
    expect(shortLine.indexOf("\u001b[7m")).toBe("ab".length + 1);
    unmount();
  });

  test("left arrow at col=0 of a non-first line jumps to end of previous line", async () => {
    // Symmetric to right-arrow at end-of-line: see tui-pi-editor-reference.md
    // §9.
    const store = createStateStore();
    store.dispatch(Actions.setEditorText("abc\ndef"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { stdin, lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    for (let i = 0; i < 4; i++) {
      stdin.write("\x1b[D");
      await new Promise((r) => setTimeout(r, 10));
    }
    const frame = lastFrame() ?? "";
    const lines = frame.split("\n");
    const abcLine = lines.find((line) => line.includes("abc")) ?? "";
    expect(abcLine).toContain("\u001b[7m");
    expect(abcLine.replace(/\u001b\[[0-9;]*m/g, "")).toContain("abc ");
    unmount();
  });

  test("ctrl+j inserts a newline at the cursor (tui.input.newLine keybinding)", async () => {
    // Per tui-pi-editor-reference.md §17, the default for `tui.input.newLine`
    // is `ctrl+j` (and `shift+enter`). Ink parses ctrl+j as `\n` and reports
    // it as a keypress with `input = "j"` and `key.ctrl = true`, NOT as a
    // `key.return`. The Editor must accept both forms.
    const store = createStateStore();
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { stdin, lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    // Ctrl+J sends `\n` (LF, 0x0A). Ink parses it as `key.ctrl = true,
    // input = "j"`.
    stdin.write("\x0a");
    await new Promise((r) => setTimeout(r, 30));
    expect(store.getState().editorText).toBe("\n");
    const frame = lastFrame() ?? "";
    // The cursor block should be on a new line, below the empty line.
    const lines = frame.split("\n");
    const topBorder = lines.findIndex((line) => line.includes("─"));
    const bottomBorder = (() => {
      for (let i = lines.length - 1; i > topBorder; i--) {
        if (lines[i]?.includes("─") === true) return i;
      }
      return -1;
    })();
    const contentLines = lines.slice(topBorder + 1, bottomBorder);
    expect(contentLines.length).toBe(2);
    const emptyLine = contentLines[0] ?? "";
    expect(emptyLine).not.toContain("\u001b[7m");
    const cursorLine = contentLines[1] ?? "";
    expect(cursorLine).toContain("\u001b[7m");
    expect(cursorLine.indexOf("\u001b[7m")).toBe(1);
    unmount();
  });

  test("up arrow from (line=1, col=0) moves the cursor to (line=0, col=0)", async () => {
    // tmp/issue-examples.md Example 2:
    //   abc
    //  |abc        <- initial cursor at (1, 0)
    //   ...        <- after Up, cursor should be on line 0
    //  |abc        <- expected
    //   abc
    const store = createStateStore();
    store.dispatch(Actions.setEditorText("abc\nabc"));
    const ctx = makeContextValue({ stateStore: store, state: store.getState() });
    const { stdin, lastFrame, unmount } = render(
      <TuiContext.Provider value={ctx}><Editor /></TuiContext.Provider>,
    );
    await new Promise((r) => setTimeout(r, 30));
    // Move cursor from (1, 3) (end of buffer) to (1, 0) with three left arrows.
    stdin.write("\x1b[D");
    await new Promise((r) => setTimeout(r, 10));
    stdin.write("\x1b[D");
    await new Promise((r) => setTimeout(r, 10));
    stdin.write("\x1b[D");
    await new Promise((r) => setTimeout(r, 10));
    await new Promise((r) => setTimeout(r, 30));
    // Sanity: cursor is now on line 1 (the second 'abc' row), at col 0.
    {
      const frame = lastFrame() ?? "";
      const lines = frame.split("\n");
      const topBorder = lines.findIndex((line) => line.includes("─"));
      const bottomBorder = (() => {
        for (let i = lines.length - 1; i > topBorder; i--) {
          if (lines[i]?.includes("─") === true) return i;
        }
        return -1;
      })();
      const contentLines = lines.slice(topBorder + 1, bottomBorder);
      expect(contentLines.length).toBe(2);
      // Line 0: "abc", no cursor block.
      const topLine = contentLines[0] ?? "";
      expect(topLine).not.toContain("\u001b[7m");
      // Line 1: cursor block at col 1 (after the left padding).
      const cursorLine = contentLines[1] ?? "";
      expect(cursorLine).toContain("\u001b[7m");
      expect(cursorLine.indexOf("\u001b[7m")).toBe(1);
    }
    // Now press Up. Cursor should move to line 0, col 0.
    stdin.write("\x1b[A");
    await new Promise((r) => setTimeout(r, 30));
    const frame = lastFrame() ?? "";
    const lines = frame.split("\n");
    const topBorder = lines.findIndex((line) => line.includes("─"));
    const bottomBorder = (() => {
      for (let i = lines.length - 1; i > topBorder; i--) {
        if (lines[i]?.includes("─") === true) return i;
      }
      return -1;
    })();
    const contentLines = lines.slice(topBorder + 1, bottomBorder);
    expect(contentLines.length).toBe(2);
    const topLine = contentLines[0] ?? "";
    expect(topLine).toContain("\u001b[7m");
    // Cursor block sits at col 1 (immediately after the left padding column).
    expect(topLine.indexOf("\u001b[7m")).toBe(1);
    const bottomLine = contentLines[1] ?? "";
    expect(bottomLine).not.toContain("\u001b[7m");
    unmount();
  });
});
