import { useReducer, useCallback, useEffect, useRef } from "react";
import { reduceEditor, bufferFromText, textFromBuffer } from "./editor-reducer";
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
  readValue(): string;
}

export function useEditorState(initialValue: string = "", options: UseEditorStateOptions = {}): EditorStateApi {
  const { onChange } = options;
  const [state, dispatch] = useReducer(reduceEditor, initialValue, bufferFromText);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const lastReportedRef = useRef<string>(textFromBuffer(state));
  const lastSeededRef = useRef<string>(initialValue);

  // A synchronous mirror of the buffer. Input events from one stdin chunk are
  // handled back-to-back in a single task, before React re-renders, so the
  // render snapshot (`state`) lags behind dispatched updates. `dispatchAction`
  // advances the mirror immediately, letting a later event in the same task
  // (e.g. Enter right after typed text) read the up-to-date buffer.
  const bufferRef = useRef<EditorBuffer>(state);
  bufferRef.current = state;

  const dispatchAction = useCallback((action: Parameters<typeof reduceEditor>[1]) => {
    bufferRef.current = reduceEditor(bufferRef.current, action);
    dispatch(action);
  }, []);

  // When `initialValue` changes from outside (e.g. a reducer
  // dispatching `setEditorText` from a slash-command completion),
  // re-seed the buffer so the user sees the new text.
  useEffect(() => {
    if (initialValue === lastSeededRef.current) return;
    lastSeededRef.current = initialValue;
    const lines = initialValue.split("\n");
    const target = lines.length === 0 ? [""] : lines;
    dispatchAction({ type: "reset-value", lines: target });
  }, [initialValue, dispatchAction]);

  useEffect(() => {
    const current = textFromBuffer(state);
    if (current === lastReportedRef.current) return;
    lastReportedRef.current = current;
    lastSeededRef.current = current;
    onChangeRef.current?.(current);
  }, [state]);

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
    lastSeededRef.current = text;
    dispatchAction({ type: "reset-value", lines: target });
  }, [dispatchAction]);

  const applyExternalValue = useCallback((text: string) => {
    const lines = text.split("\n");
    const target = lines.length === 0 ? [""] : lines;
    lastSeededRef.current = text;
    lastReportedRef.current = text;
    dispatchAction({ type: "reset-value", lines: target });
  }, [dispatchAction]);

  const readValue = useCallback((): string => textFromBuffer(bufferRef.current), []);

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
    readValue,
  };
}
