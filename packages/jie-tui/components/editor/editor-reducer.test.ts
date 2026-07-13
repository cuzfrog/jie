import { reduceEditor } from "./editor-reducer";
import type { EditorBuffer } from "./editor-state";

declare const test: (name: string, fn: () => void) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

function buf(lines: string[], cursorLine = lines.length - 1, cursorCol = lines[cursorLine]?.length ?? 0): EditorBuffer {
  return { lines, cursorLine, cursorCol };
}

describe("reduceEditor > insert", () => {
  test("appends text at the cursor and advances the cursor", () => {
    const next = reduceEditor(buf([""]), { type: "insert", text: "abc" });
    expect(next).toEqual(buf(["abc"], 0, 3));
  });

  test("inserts in the middle of a line and advances the cursor past the inserted text", () => {
    const next = reduceEditor(buf(["ace"], 0, 1), { type: "insert", text: "b" });
    expect(next).toEqual(buf(["abce"], 0, 2));
  });

  test("inserts a newline by splitting the current line at the cursor", () => {
    const next = reduceEditor(buf(["ab cd"], 0, 2), { type: "insert-newline" });
    expect(next).toEqual(buf(["ab", " cd"], 1, 0));
  });

  test("insert with embedded newlines splits into multiple lines", () => {
    const next = reduceEditor(buf(["hello"], 0, 5), { type: "insert", text: "\nworld" });
    expect(next).toEqual(buf(["hello", "world"], 1, 5));
  });

  test("insert at the start of a non-first line preserves the cursor line", () => {
    const next = reduceEditor(buf(["foo", "bar"], 1, 0), { type: "insert", text: "X" });
    expect(next).toEqual(buf(["foo", "Xbar"], 1, 1));
  });
});

describe("reduceEditor > backspace", () => {
  test("removes the grapheme before the cursor on a non-empty line", () => {
    const next = reduceEditor(buf(["ab"]), { type: "backspace" });
    expect(next).toEqual(buf(["a"], 0, 1));
  });

  test("at col=0 of a non-first line joins the current line with the previous and places the cursor at the seam", () => {
    const next = reduceEditor(buf(["foo", "bar"], 1, 0), { type: "backspace" });
    expect(next).toEqual(buf(["foobar"], 0, 3));
  });

  test("at col=0 of the first line is a no-op (does not delete the first character)", () => {
    const next = reduceEditor(buf(["abc"], 0, 0), { type: "backspace" });
    expect(next).toEqual(buf(["abc"], 0, 0));
  });

  test("at col=0 of the first line of a multi-line buffer is also a no-op", () => {
    const next = reduceEditor(buf(["abc", "def"], 0, 0), { type: "backspace" });
    expect(next).toEqual(buf(["abc", "def"], 0, 0));
  });

  test("removes a multi-codepoint grapheme (emoji) as a unit", () => {
    const next = reduceEditor(buf(["a👨‍👩‍👧‍👦b"]), { type: "backspace" });
    expect(next).toEqual(buf(["a👨‍👩‍👧‍👦"], 0, "a".length + "👨‍👩‍👧‍👦".length));
  });
});

describe("reduceEditor > delete (forward delete)", () => {
  test("removes the grapheme at the cursor, advancing nothing", () => {
    const next = reduceEditor(buf(["abc"], 0, 1), { type: "delete" });
    expect(next).toEqual(buf(["ac"], 0, 1));
  });

  test("at end of a non-last line joins with the next line and the cursor stays put", () => {
    const next = reduceEditor(buf(["foo", "bar"], 0, 3), { type: "delete" });
    expect(next).toEqual(buf(["foobar"], 0, 3));
  });

  test("at end of the last line is a no-op (does not delete the trailing character)", () => {
    const next = reduceEditor(buf(["abc"]), { type: "delete" });
    expect(next).toEqual(buf(["abc"], 0, 3));
  });

  test("at end of the last line of a multi-line buffer is also a no-op", () => {
    const next = reduceEditor(buf(["abc", "def"]), { type: "delete" });
    expect(next).toEqual(buf(["abc", "def"], 1, 3));
  });
});

describe("reduceEditor > cursor movement", () => {
  test("cursor-left decrements cursorCol", () => {
    expect(reduceEditor(buf(["abc"], 0, 2), { type: "cursor-left" })).toEqual(buf(["abc"], 0, 1));
  });

  test("cursor-left at col=0 of a non-first line moves to end of previous line", () => {
    expect(reduceEditor(buf(["abc", "def"], 1, 0), { type: "cursor-left" })).toEqual(buf(["abc", "def"], 0, 3));
  });

  test("cursor-left at col=0 of the first line is a no-op", () => {
    expect(reduceEditor(buf(["abc"], 0, 0), { type: "cursor-left" })).toEqual(buf(["abc"], 0, 0));
  });

  test("cursor-left removes one grapheme (multi-codepoint clusters)", () => {
    expect(reduceEditor(buf(["a👨‍👩‍👧‍👦"], 0, "a".length + 11), { type: "cursor-left" })).toEqual(buf(["a👨‍👩‍👧‍👦"], 0, "a".length));
  });

  test("cursor-right increments cursorCol", () => {
    expect(reduceEditor(buf(["abc"], 0, 1), { type: "cursor-right" })).toEqual(buf(["abc"], 0, 2));
  });

  test("cursor-right at end of a non-last line moves to start of next line", () => {
    expect(reduceEditor(buf(["abc", "def"], 0, 3), { type: "cursor-right" })).toEqual(buf(["abc", "def"], 1, 0));
  });

  test("cursor-right at end of the last line is a no-op", () => {
    expect(reduceEditor(buf(["abc"]), { type: "cursor-right" })).toEqual(buf(["abc"], 0, 3));
  });

  test("line-start moves the cursor to col 0", () => {
    expect(reduceEditor(buf(["abc"], 0, 2), { type: "line-start" })).toEqual(buf(["abc"], 0, 0));
  });

  test("line-end moves the cursor to end of current line", () => {
    expect(reduceEditor(buf(["abc", "def"], 0, 0), { type: "line-end" })).toEqual(buf(["abc", "def"], 0, 3));
  });

  test("cursor-up from a non-first line clamps cursorCol to the new line's length", () => {
    expect(reduceEditor(buf(["abc", "def"], 1, 3), { type: "cursor-up" })).toEqual(buf(["abc", "def"], 0, 3));
  });

  test("cursor-up from cursorCol beyond the line above clamps to that line's end", () => {
    expect(reduceEditor(buf(["ab", "def"], 1, 3), { type: "cursor-up" })).toEqual(buf(["ab", "def"], 0, 2));
  });

  test("cursor-up on the first line is a no-op", () => {
    expect(reduceEditor(buf(["abc"], 0, 2), { type: "cursor-up" })).toEqual(buf(["abc"], 0, 2));
  });

  test("cursor-down from a non-last line moves down and clamps cursorCol", () => {
    expect(reduceEditor(buf(["abc", "def"], 0, 3), { type: "cursor-down" })).toEqual(buf(["abc", "def"], 1, 3));
    expect(reduceEditor(buf(["abcd", "ab"], 0, 4), { type: "cursor-down" })).toEqual(buf(["abcd", "ab"], 1, 2));
  });

  test("cursor-down on the last line is a no-op", () => {
    expect(reduceEditor(buf(["abc", "def"], 1, 3), { type: "cursor-down" })).toEqual(buf(["abc", "def"], 1, 3));
  });
});

describe("reduceEditor > reset", () => {
  test("reset-value replaces the buffer and places the cursor at the end of the last line", () => {
    const next = reduceEditor(buf(["abc", "def"], 1, 3), {
      type: "reset-value",
      lines: ["line1", "line2"],
    });
    expect(next).toEqual(buf(["line1", "line2"], 1, 5));
  });

  test("reset-value with empty string resets to a single empty line", () => {
    const next = reduceEditor(buf(["abc"]), { type: "reset-value", lines: [""] });
    expect(next).toEqual(buf([""], 0, 0));
  });
});
