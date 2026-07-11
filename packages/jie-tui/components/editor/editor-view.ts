import { useInput } from "ink";
import { useCallback } from "react";
import type { EditorStateApi } from "./useEditorState";

const ANSI_INVERSE_OPEN = "\u001b[7m";
const ANSI_INVERSE_CLOSE = "\u001b[27m";

function cursorBlock(): string {
  return `${ANSI_INVERSE_OPEN} ${ANSI_INVERSE_CLOSE}`;
}

function invertGrapheme(grapheme: string): string {
  return `${ANSI_INVERSE_OPEN}${grapheme}${ANSI_INVERSE_CLOSE}`;
}

interface RenderedLine {
  readonly text: string;
  readonly isCursorLine: boolean;
}

export function renderLines(api: EditorStateApi): ReadonlyArray<RenderedLine> {
  const { buffer } = api;
  return buffer.lines.map((line, index) => {
    if (index !== buffer.cursorLine) {
      // Ink drops a `<Text>` whose content is `""` (the box collapses and
      // the row vanishes), so emit a single-space sentinel for empty
      // non-cursor rows to keep the visual line count truthful.
      return { text: line.length === 0 ? " " : line, isCursorLine: false };
    }
    const before = line.slice(0, buffer.cursorCol);
    const after = line.slice(buffer.cursorCol);
    if (after.length === 0) {
      return { text: `${before}${cursorBlock()}`, isCursorLine: true };
    }
    const seg = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    let firstGrapheme = after;
    let firstGraphemeLen = after.length;
    for (const piece of seg.segment(after)) {
      firstGrapheme = (piece as { segment: string }).segment;
      firstGraphemeLen = (piece as { segment: string }).segment.length;
      break;
    }
    const restAfter = after.slice(firstGraphemeLen);
    return {
      text: `${before}${invertGrapheme(firstGrapheme)}${restAfter}`,
      isCursorLine: true,
    };
  });
}

interface UseEditorInputOptions {
  readonly isDisabled?: boolean;
}

export function useEditorInput(api: EditorStateApi, options: UseEditorInputOptions = {}): void {
  const { isDisabled = false } = options;

  const onShiftReturn = useCallback((): void => {
    api.insertNewline();
  }, [api]);

  const onBackspace = useCallback((): void => {
    api.backspace();
  }, [api]);

  const onDelete = useCallback((): void => {
    api.forwardDelete();
  }, [api]);

  const onLeft = useCallback((): void => {
    api.moveCursorLeft();
  }, [api]);

  const onRight = useCallback((): void => {
    api.moveCursorRight();
  }, [api]);

  useInput(
    (input, key) => {
      if (key.upArrow || key.downArrow) return;
      if ((key.ctrl && input === "c") || key.tab || (key.shift && key.tab)) return;
      // Shift+Enter (CR with shift held): insert newline.
      if (key.shift && key.return) {
        onShiftReturn();
        return;
      }
      // Ink parses `\n` (LF, 0x0A) — the byte Ctrl+J sends, and the byte
      // terminals use for plain Enter when `icrnl` is on — as `key.name ===
      // "enter"` (private API). The public `Key` type doesn't expose `.name`,
      // so we detect LF via `input === '\n'`. We treat the byte as a newline
      // per the `tui.input.newLine` keybinding (pi default: shift+enter and
      // ctrl+j). CR (0x0D) parses as `key.return` and is left to the caller's
      // outer useInput for the submit path.
      if (input === "\n") {
        onShiftReturn();
        return;
      }
      if (key.return) return;
      if (key.leftArrow) {
        onLeft();
      } else if (key.rightArrow) {
        onRight();
      } else if (key.backspace) {
        onBackspace();
      } else if (key.delete) {
        onDelete();
      } else if (input.length > 0) {
        api.insert(input);
      }
    },
    { isActive: !isDisabled },
  );
}
