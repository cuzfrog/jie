import type { EditorAction, EditorBuffer } from "./editor-state";

function prevGraphemeLength(line: string, col: number): number {
  if (col <= 0 || line.length === 0) return 0;
  const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  let cursor = 0;
  let lastLen = 0;
  for (const piece of seg.segment(line)) {
    const start = (piece as { index: number }).index;
    const length = (piece as { segment: string }).segment.length;
    if (start >= col) break;
    cursor = start;
    lastLen = length;
    if (cursor + lastLen === col) break;
    if (start + length > col) break;
  }
  return cursor === 0 && col === line.length ? line.length : lastLen;
}

function nextGraphemeLength(line: string, col: number): number {
  if (col >= line.length) return 0;
  const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  let firstLen = line.length - col;
  for (const piece of seg.segment(line)) {
    const start = (piece as { index: number }).index;
    if (start < col) continue;
    const length = (piece as { segment: string }).segment.length;
    firstLen = length;
    break;
  }
  return firstLen;
}

function normalize(text: string): ReadonlyArray<string> {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function splitInsert(text: string): ReadonlyArray<string> {
  const parts = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  return parts;
}

export function emptyBuffer(): EditorBuffer {
  return { lines: [""], cursorLine: 0, cursorCol: 0 };
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

export function reduceEditor(state: EditorBuffer, action: EditorAction): EditorBuffer {
  switch (action.type) {
    case "insert": {
      if (action.text === "") return state;
      const segs = splitInsert(action.text);
      const lines = state.lines.slice();
      if (segs.length === 1) {
        const currentLine = lines[state.cursorLine] ?? "";
        const next = currentLine.slice(0, state.cursorCol) + segs[0]! + currentLine.slice(state.cursorCol);
        lines[state.cursorLine] = next;
        return {
          lines,
          cursorLine: state.cursorLine,
          cursorCol: state.cursorCol + segs[0]!.length,
        };
      }
      const head = segs[0]!;
      const tail = segs[segs.length - 1]!;
      const middle = segs.slice(1, -1);
      const currentLine = lines[state.cursorLine] ?? "";
      const before = currentLine.slice(0, state.cursorCol);
      const after = currentLine.slice(state.cursorCol);
      const firstLine = before + head;
      const lastLine = tail + after;
      const spliced = lines.slice(0, state.cursorLine).concat([firstLine, ...middle, lastLine]);
      const lastIndex = state.cursorLine + middle.length + 1;
      return {
        lines: spliced,
        cursorLine: lastIndex,
        cursorCol: tail.length,
      };
    }
    case "insert-newline": {
      const lines = state.lines.slice();
      const currentLine = lines[state.cursorLine] ?? "";
      const before = currentLine.slice(0, state.cursorCol);
      const after = currentLine.slice(state.cursorCol);
      lines[state.cursorLine] = before;
      lines.splice(state.cursorLine + 1, 0, after);
      return {
        lines,
        cursorLine: state.cursorLine + 1,
        cursorCol: 0,
      };
    }
    case "backspace": {
      const lines = state.lines.slice();
      const currentLine = lines[state.cursorLine] ?? "";
      if (state.cursorCol > 0) {
        const len = prevGraphemeLength(currentLine, state.cursorCol);
        const next = currentLine.slice(0, state.cursorCol - len) + currentLine.slice(state.cursorCol);
        lines[state.cursorLine] = next;
        return {
          lines,
          cursorLine: state.cursorLine,
          cursorCol: state.cursorCol - len,
        };
      }
      if (state.cursorLine === 0) return state;
      const prevLine = lines[state.cursorLine - 1] ?? "";
      const seam = prevLine.length;
      lines[state.cursorLine - 1] = prevLine + currentLine;
      lines.splice(state.cursorLine, 1);
      return {
        lines,
        cursorLine: state.cursorLine - 1,
        cursorCol: seam,
      };
    }
    case "delete": {
      const lines = state.lines.slice();
      const currentLine = lines[state.cursorLine] ?? "";
      if (state.cursorCol < currentLine.length) {
        const len = nextGraphemeLength(currentLine, state.cursorCol);
        const next = currentLine.slice(0, state.cursorCol) + currentLine.slice(state.cursorCol + len);
        lines[state.cursorLine] = next;
        return {
          lines,
          cursorLine: state.cursorLine,
          cursorCol: state.cursorCol,
        };
      }
      if (state.cursorLine === lines.length - 1) return state;
      const nextLine = lines[state.cursorLine + 1] ?? "";
      lines[state.cursorLine] = currentLine + nextLine;
      lines.splice(state.cursorLine + 1, 1);
      return {
        lines,
        cursorLine: state.cursorLine,
        cursorCol: state.cursorCol,
      };
    }
    case "cursor-left": {
      const currentLine = state.lines[state.cursorLine] ?? "";
      if (state.cursorCol > 0) {
        const len = prevGraphemeLength(currentLine, state.cursorCol);
        return {
          lines: state.lines,
          cursorLine: state.cursorLine,
          cursorCol: state.cursorCol - len,
        };
      }
      if (state.cursorLine === 0) return state;
      return {
        lines: state.lines,
        cursorLine: state.cursorLine - 1,
        cursorCol: state.lines[state.cursorLine - 1]?.length ?? 0,
      };
    }
    case "cursor-right": {
      const currentLine = state.lines[state.cursorLine] ?? "";
      if (state.cursorCol < currentLine.length) {
        const len = nextGraphemeLength(currentLine, state.cursorCol);
        return {
          lines: state.lines,
          cursorLine: state.cursorLine,
          cursorCol: state.cursorCol + len,
        };
      }
      if (state.cursorLine === state.lines.length - 1) return state;
      return {
        lines: state.lines,
        cursorLine: state.cursorLine + 1,
        cursorCol: 0,
      };
    }
    case "cursor-up": {
      if (state.cursorLine === 0) return state;
      const newLine = state.lines[state.cursorLine - 1] ?? "";
      return {
        lines: state.lines,
        cursorLine: state.cursorLine - 1,
        cursorCol: clamp(state.cursorCol, 0, newLine.length),
      };
    }
    case "cursor-down": {
      if (state.cursorLine === state.lines.length - 1) return state;
      const newLine = state.lines[state.cursorLine + 1] ?? "";
      return {
        lines: state.lines,
        cursorLine: state.cursorLine + 1,
        cursorCol: clamp(state.cursorCol, 0, newLine.length),
      };
    }
    case "line-start": {
      return { lines: state.lines, cursorLine: state.cursorLine, cursorCol: 0 };
    }
    case "line-end": {
      const currentLine = state.lines[state.cursorLine] ?? "";
      return {
        lines: state.lines,
        cursorLine: state.cursorLine,
        cursorCol: currentLine.length,
      };
    }
    case "reset-value": {
      const lines = normalize(action.lines.join("\n"));
      if (lines.length === 0) return emptyBuffer();
      const rawLine = action.cursorLine ?? (lines.length - 1);
      const cursorLine = clamp(rawLine, 0, lines.length - 1);
      const lastLine = lines[cursorLine] ?? "";
      const rawCol = action.cursorCol ?? lastLine.length;
      const cursorCol = clamp(rawCol, 0, lastLine.length);
      return { lines, cursorLine, cursorCol };
    }
  }
}

export function bufferFromText(text: string): EditorBuffer {
  const lines = normalize(text);
  if (lines.length === 0) return emptyBuffer();
  const last = lines.length - 1;
  const cursorLine = last;
  const cursorCol = lines[last]?.length ?? 0;
  return { lines, cursorLine, cursorCol };
}

export function textFromBuffer(buffer: EditorBuffer): string {
  return buffer.lines.join("\n");
}
