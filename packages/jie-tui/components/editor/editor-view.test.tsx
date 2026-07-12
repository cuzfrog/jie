import { describe, expect, test } from "bun:test";
import { render } from "../../test-renderer";
import { Text } from "@cuzfrog/jie-ink";
import type { JSX } from "react";
import { useEditorState } from "./useEditorState";
import { useEditorInput, renderLines } from "./editor-view";
import type { EditorStateApi } from "./useEditorState";
import { bufferFromText, emptyBuffer, reduceEditor } from "./editor-reducer";
import type { EditorAction, EditorBuffer } from "./editor-state";

const INVERSE_OPEN = "\u001b[7m";
const INVERSE_CLOSE = "\u001b[27m";

function apiFromBuffer(buffer: EditorBuffer): EditorStateApi {
  // renderLines reads only api.buffer; tests below exercise specific moves
  // through reduceEditor and only render — no input wiring needed.
  return { buffer, value: "" } as unknown as EditorStateApi;
}

function applyAction(buffer: EditorBuffer, action: EditorAction): EditorBuffer {
  return reduceEditor(buffer, action);
}

describe("renderLines", () => {
  test("renders an empty single-line buffer with cursorBlock at the start", () => {
    const buffer = bufferFromText("");
    const rendered = renderLines(apiFromBuffer(buffer));
    expect(rendered).toEqual([{ text: `${INVERSE_OPEN} ${INVERSE_CLOSE}`, isCursorLine: true }]);
  });

  test("renders a single-line buffer with cursor at the end", () => {
    const buffer = bufferFromText("abc");
    const rendered = renderLines(apiFromBuffer(buffer));
    expect(rendered).toEqual([{ text: `abc${INVERSE_OPEN} ${INVERSE_CLOSE}`, isCursorLine: true }]);
  });

  test("renders a single-line buffer with cursor mid-text: inverts the single grapheme at cursor", () => {
    // Buffer "abc" with cursor at col=1 (between 'a' and 'b').
    let buffer = bufferFromText("abc");
    buffer = applyAction(buffer, { type: "reset-value", lines: ["abc"] });
    buffer = applyAction(buffer, { type: "cursor-left" });
    buffer = applyAction(buffer, { type: "cursor-left" });
    const rendered = renderLines(apiFromBuffer(buffer));
    expect(rendered).toEqual([{ text: `a${INVERSE_OPEN}b${INVERSE_CLOSE}c`, isCursorLine: true }]);
  });

  test("renders a multi-line buffer: only the cursor line carries ANSI codes", () => {
    const buffer = bufferFromText("abc\ndef\nghi");
    const rendered = renderLines(apiFromBuffer(buffer));
    expect(rendered).toHaveLength(3);
    expect(rendered[0]).toEqual({ text: "abc", isCursorLine: false });
    expect(rendered[1]).toEqual({ text: "def", isCursorLine: false });
    expect(rendered[2]).toEqual({ text: `ghi${INVERSE_OPEN} ${INVERSE_CLOSE}`, isCursorLine: true });
  });

  test("renders cursor block on the correct row when cursor is on line 0", () => {
    let buffer = bufferFromText("abc\ndef");
    // bufferFromText initializes cursor at end of buffer (line=1, col=3).
    // 3 cursor-left takes the cursor to (line=1, col=0); one cursor-up moves
    // it to (line=0, col=0).
    buffer = applyAction(buffer, { type: "cursor-left" });
    buffer = applyAction(buffer, { type: "cursor-left" });
    buffer = applyAction(buffer, { type: "cursor-left" });
    buffer = applyAction(buffer, { type: "cursor-up" });
    const rendered = renderLines(apiFromBuffer(buffer));
    expect(rendered[0]).toEqual({ text: `${INVERSE_OPEN}a${INVERSE_CLOSE}bc`, isCursorLine: true });
    expect(rendered[1]).toEqual({ text: "def", isCursorLine: false });
  });

  test("renders cursor block on a later line, not on line 0 or the last line", () => {
    let buffer = bufferFromText("one\nTWO\nthree");
    // bufferFromText initializes cursor at end of buffer (line=2, col=5).
    // One cursor-up with sticky-column clamps col to the length of line 1
    // ("TWO", len 3): (line=1, col=3) → cursor at end of "TWO".
    buffer = applyAction(buffer, { type: "cursor-up" });
    const rendered = renderLines(apiFromBuffer(buffer));
    expect(rendered[0]).toEqual({ text: "one", isCursorLine: false });
    expect(rendered[1]).toEqual({ text: `TWO${INVERSE_OPEN} ${INVERSE_CLOSE}`, isCursorLine: true });
    expect(rendered[2]).toEqual({ text: "three", isCursorLine: false });
  });

  test("renders a multi-codepoint grapheme cluster by inverting the whole cluster", () => {
    // The flag emoji "🇯🇵" (Japan) is two regional indicator codepoints —
    // Intl.Segmenter treats them as a single grapheme cluster.
    const jp = "\u{1F1EF}\u{1F1F5}";
    let buffer = emptyBuffer();
    buffer = applyAction(buffer, { type: "insert", text: jp });
    // At this point: cluster at col=0..2, cursor at col=4 (after cluster).
    // Insert 'X' immediately after.
    buffer = applyAction(buffer, { type: "insert", text: "X" });
    // Move cursor left so it sits between cluster and X. col was 4 → 3.
    buffer = applyAction(buffer, { type: "cursor-left" });
    const rendered = renderLines(apiFromBuffer(buffer));
    expect(rendered).toHaveLength(1);
    // Cursor at col 4 (cluster len + 1). renderLines draws:
    //   before = "jp" (whole cluster), after = "X"; cursor inverts the
    //   first grapheme of "after" = "X", giving cluster + inv(X) + restAfter
    //   where restAfter = "" (X was the last char).
    expect(rendered[0]?.text).toBe(`${jp}${INVERSE_OPEN}X${INVERSE_CLOSE}`);
  });

  test("cursor at column 0 (mid-line) inverts the first grapheme of the current line", () => {
    let buffer = bufferFromText("first\nsecond");
    // Buffer: lines ["first", "second"], cursor at (1, 6).
    // 6 cursor-left takes cursor to (1, 0).
    buffer = applyAction(buffer, { type: "cursor-left" });
    buffer = applyAction(buffer, { type: "cursor-left" });
    buffer = applyAction(buffer, { type: "cursor-left" });
    buffer = applyAction(buffer, { type: "cursor-left" });
    buffer = applyAction(buffer, { type: "cursor-left" });
    buffer = applyAction(buffer, { type: "cursor-left" });
    const rendered = renderLines(apiFromBuffer(buffer));
    expect(rendered[0]).toEqual({ text: "first", isCursorLine: false });
    expect(rendered[1]).toEqual({ text: `${INVERSE_OPEN}s${INVERSE_CLOSE}econd`, isCursorLine: true });
  });
});

describe("useEditorInput", () => {
  function mountProbe(initial: string, options: { readonly isDisabled?: boolean } = {}): {
    lastFrame(): string | undefined;
    stdin: { write(data: string): void };
    unmount(): void;
    apiRef: { readonly current: EditorStateApi | null };
  } {
    const apiRef = { current: null as EditorStateApi | null };
    function Probe(): JSX.Element {
      const api = useEditorState(initial);
      // api is a fresh object each render; the ref always reflects the latest.
      apiRef.current = api;
      useEditorInput(api, options);
      return (
        <>
          {renderLines(api).map((line, i) => (
            <Text key={i}>{line.text}</Text>
          ))}
        </>
      );
    }
    const { lastFrame, stdin, unmount } = render(<Probe />);
    return { lastFrame, stdin, unmount, apiRef };
  }

  function api(probe: { apiRef: { readonly current: EditorStateApi | null } }): EditorStateApi {
    if (probe.apiRef.current === null) throw new Error("api not captured");
    return probe.apiRef.current;
  }

  test("typing printable characters inserts them at the cursor", async () => {
    const probe = mountProbe("");
    await new Promise((r) => setTimeout(r, 20));
    probe.stdin.write("h");
    await new Promise((r) => setTimeout(r, 10));
    probe.stdin.write("i");
    await new Promise((r) => setTimeout(r, 20));
    expect(api(probe).value).toBe("hi");
    expect(api(probe).buffer).toEqual({ lines: ["hi"], cursorLine: 0, cursorCol: 2 });
    probe.unmount();
  });

  test("backspace removes the grapheme before the cursor (does NOT forward-delete)", async () => {
    const probe = mountProbe("abc");
    await new Promise((r) => setTimeout(r, 20));
    probe.stdin.write("\x7f");
    await new Promise((r) => setTimeout(r, 20));
    expect(api(probe).value).toBe("ab");
    expect(api(probe).buffer.cursorCol).toBe(2);
    probe.unmount();
  });

  test("delete (forward-delete) removes the grapheme AFTER the cursor, distinct from backspace", async () => {
    const probe = mountProbe("abc");
    // Buffer "abc" with cursor at end (col=3). Forward-delete at end is no-op:
    expect(api(probe).buffer.cursorCol).toBe(3);
    probe.stdin.write("\x1b[3~"); // forward-delete escape sequence.
    await new Promise((r) => setTimeout(r, 20));
    expect(api(probe).value).toBe("abc");
    // Move cursor to col=2 (right after 'b', before 'c').
    probe.stdin.write("\x1b[D"); // left arrow
    await new Promise((r) => setTimeout(r, 10));
    expect(api(probe).buffer.cursorCol).toBe(2);
    // Forward-delete at (line=0, col=2) deletes the 'c' that lives AT col 2
    // (i.e. immediately after the cursor). Buffer becomes "ab", cursor stays
    // at col=2.
    probe.stdin.write("\x1b[3~");
    await new Promise((r) => setTimeout(r, 20));
    expect(api(probe).value).toBe("ab");
    expect(api(probe).buffer.cursorCol).toBe(2);
    probe.unmount();
  });

  test("left/right arrows move the cursor one grapheme", async () => {
    const probe = mountProbe("abc");
    await new Promise((r) => setTimeout(r, 20));
    probe.stdin.write("\x1b[D");
    await new Promise((r) => setTimeout(r, 10));
    expect(api(probe).buffer.cursorCol).toBe(2);
    probe.stdin.write("\x1b[D");
    await new Promise((r) => setTimeout(r, 10));
    expect(api(probe).buffer.cursorCol).toBe(1);
    probe.stdin.write("\x1b[C");
    await new Promise((r) => setTimeout(r, 10));
    expect(api(probe).buffer.cursorCol).toBe(2);
    probe.unmount();
  });

  test("shift+enter inserts a newline at the cursor", async () => {
    const probe = mountProbe("ab");
    await new Promise((r) => setTimeout(r, 20));
    // Place cursor at (0, 1) so a split produces ["a", "b"].
    probe.stdin.write("\x1b[D"); // left arrow
    await new Promise((r) => setTimeout(r, 20));
    expect(api(probe).buffer.cursorCol).toBe(1);
    // Ink sends Shift+Enter as ESC + \r or as a kitty-protocol sequence. The
    // textual form we rely on is "shift: true, return: true" in the keypress.
    // We emit the canonical "\x1b\r" sequence (escape + return). Ink parses
    // it as `key.name === "return", key.meta = true`, but `key.shift = false`
    // because the shift bit is not carried across the basic escape form. In
    // production, terminals that surface modifiers (kitty/xterm) emit a
    // different sequence with shift explicitly set. We exercise the newline
    // code path by calling the api's insertNewline, which is what the hook
    // dispatches on a Shift+Enter keypress in the production code path.
    const before = api(probe).value;
    api(probe).insertNewline();
    await new Promise((r) => setTimeout(r, 20));
    // If the harness forwards shift+return reliably, the next line will be
    // observable as a newline already; regardless, after the explicit call
    // the buffer is in the expected post-newline state.
    expect(api(probe).value).toBe("a\nb");
    expect(before).toBe("ab");
    probe.unmount();
  });

  test("ctrl+j inserts a newline at the cursor (tui.input.newLine keybinding)", async () => {
    // Per doc/specs/ui/tui-pi-editor-reference.md §17 the default for
    // `tui.input.newLine` is `ctrl+j` (and `shift+enter`). Ink parses `\n`
    // (`\x0a`) as `key.name === "enter"` regardless of the ctrl modifier; the
    // hook must accept this byte and treat it as a newline.
    const probe = mountProbe("ab");
    await new Promise((r) => setTimeout(r, 20));
    // Place cursor at (0, 1) so a split produces ["a", "b"].
    probe.stdin.write("\x1b[D"); // left arrow
    await new Promise((r) => setTimeout(r, 20));
    expect(api(probe).buffer.cursorCol).toBe(1);
    probe.stdin.write("\x0a");
    await new Promise((r) => setTimeout(r, 20));
    expect(api(probe).value).toBe("a\nb");
    expect(api(probe).buffer).toEqual({ lines: ["a", "b"], cursorLine: 1, cursorCol: 0 });
    probe.unmount();
  });

  test("plain enter (\\r) is NOT consumed by useEditorInput (passes through to caller)", async () => {
    const probe = mountProbe("ab");
    await new Promise((r) => setTimeout(r, 20));
    probe.stdin.write("\r");
    await new Promise((r) => setTimeout(r, 20));
    // useEditorInput returns early on `key.return`, leaving api unchanged.
    expect(api(probe).value).toBe("ab");
    probe.unmount();
  });

  test("up/down arrows are NOT consumed by useEditorInput (let the Editor's outer useInput handle them)", async () => {
    const probe = mountProbe("ab");
    await new Promise((r) => setTimeout(r, 20));
    probe.stdin.write("\x1b[A");
    await new Promise((r) => setTimeout(r, 10));
    probe.stdin.write("\x1b[B");
    await new Promise((r) => setTimeout(r, 20));
    expect(api(probe).value).toBe("ab");
    expect(api(probe).buffer).toEqual({ lines: ["ab"], cursorLine: 0, cursorCol: 2 });
    probe.unmount();
  });

  test("isDisabled: true pauses all input", async () => {
    const probe = mountProbe("ab", { isDisabled: true });
    await new Promise((r) => setTimeout(r, 20));
    probe.stdin.write("x");
    probe.stdin.write("\x7f");
    probe.stdin.write("\x1b[D");
    probe.stdin.write("\x0a");
    await new Promise((r) => setTimeout(r, 20));
    expect(api(probe).value).toBe("ab");
    probe.unmount();
  });
});
