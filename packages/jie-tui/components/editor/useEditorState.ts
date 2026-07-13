import { useReducer, useCallback, useEffect, useMemo, useRef } from "react";
import { reduceEditor, bufferFromText, textFromBuffer, emptyBuffer } from "./editor-reducer";
import type { EditorBuffer } from "./editor-state";

interface UseEditorStateOptions {
  readonly onChange?: (text: string) => void;
}

export interface EditorStateApi {
  readonly buffer: EditorBuffer;
  readonly value: string;
  insert(text: string): void;
  insertNewline(): void;
  backspace(): void;
  forwardDelete(): void;
  moveCursorLeft(): void;
  moveCursorRight(): void;
  moveCursorUp(): void;
  moveCursorDown(): void;
  moveLineStart(): void;
  moveLineEnd(): void;
  setValue(text: string): void;
  applyExternalValue(text: string): void;
}

export function useEditorState(initialValue: string = "", options: UseEditorStateOptions = {}): EditorStateApi {
  const { onChange } = options;
  const initial = useMemo<EditorBuffer>(() => {
    if (initialValue === "") return emptyBuffer();
    return bufferFromText(initialValue);
  }, []);

  const [state, dispatch] = useReducer(reduceEditor, initial);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const lastReportedRef = useRef<string>(textFromBuffer(state));

  useEffect(() => {
    const current = textFromBuffer(state);
    if (current === lastReportedRef.current) return;
    lastReportedRef.current = current;
    onChangeRef.current?.(current);
  }, [state]);

  const dispatchAction = useCallback((action: Parameters<typeof reduceEditor>[1]) => {
    dispatch(action);
  }, []);

  const insert = useCallback((text: string) => dispatchAction({ type: "insert", text }), [dispatchAction]);
  const insertNewline = useCallback(() => dispatchAction({ type: "insert-newline" }), [dispatchAction]);
  const backspace = useCallback(() => dispatchAction({ type: "backspace" }), [dispatchAction]);
  const forwardDelete = useCallback(() => dispatchAction({ type: "delete" }), [dispatchAction]);
  const moveCursorLeft = useCallback(() => dispatchAction({ type: "cursor-left" }), [dispatchAction]);
  const moveCursorRight = useCallback(() => dispatchAction({ type: "cursor-right" }), [dispatchAction]);
  const moveCursorUp = useCallback(() => dispatchAction({ type: "cursor-up" }), [dispatchAction]);
  const moveCursorDown = useCallback(() => dispatchAction({ type: "cursor-down" }), [dispatchAction]);
  const moveLineStart = useCallback(() => dispatchAction({ type: "line-start" }), [dispatchAction]);
  const moveLineEnd = useCallback(() => dispatchAction({ type: "line-end" }), [dispatchAction]);

  const setValue = useCallback((text: string) => {
    const lines = text.split("\n");
    const target = lines.length === 0 ? [""] : lines;
    dispatchAction({ type: "reset-value", lines: target });
  }, [dispatchAction]);

  const applyExternalValue = useCallback((text: string) => {
    const lines = text.split("\n");
    const target = lines.length === 0 ? [""] : lines;
    dispatchAction({ type: "reset-value", lines: target });
    lastReportedRef.current = text;
  }, [dispatchAction]);

  return {
    buffer: state,
    value: textFromBuffer(state),
    insert,
    insertNewline,
    backspace,
    forwardDelete,
    moveCursorLeft,
    moveCursorRight,
    moveCursorUp,
    moveCursorDown,
    moveLineStart,
    moveLineEnd,
    setValue,
    applyExternalValue,
  };
}
