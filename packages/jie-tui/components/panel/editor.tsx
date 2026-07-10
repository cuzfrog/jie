import { useState, type JSX } from "react";
import { Box, Text, useCursor, useInput, useWindowSize } from "ink";
import { useTuiContext } from "../context";
import { Actions } from "../../state";
import { pickColor } from "../themes";

interface EditorProps { }

const HISTORY_LIMIT = 100;
const PLACEHOLDER = "type a prompt...";

export function Editor(_props: EditorProps): JSX.Element {
  const { state, dispatch } = useTuiContext();
  const [history, setHistory] = useState<ReadonlyArray<string>>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [draft, setDraft] = useState<string>("");
  const { rows } = useWindowSize();
  const buffer = state.editorText;
  const lines = buffer.split("\n");
  const placeholder = buffer.length === 0;

  const { setCursorPosition } = useCursor();
  setCursorPosition(caretPositionForCursor(buffer, rows));

  useInput((input, key) => {
    if (key.return || (input.endsWith("\r") && !key.ctrl && !key.meta)) {
      const head = key.return ? input : input.slice(0, -1);
      const raw = buffer + head;
      const text = raw.replace(/[\r\n]+$/, "");
      if (text.length === 0) return;
      const hist = [text, ...history].slice(0, HISTORY_LIMIT);
      setHistory(hist);
      setHistoryIndex(-1);
      setDraft("");
      dispatch(Actions.setEditorText(""));
      dispatch(Actions.submitEditorText(text));
      return;
    }
    if (key.upArrow && history.length > 0) {
      const nextIndex = historyIndex < 0 ? 0 : Math.min(historyIndex + 1, history.length - 1);
      const recalled = history[nextIndex] ?? "";
      if (historyIndex === -1) setDraft(buffer);
      setHistoryIndex(nextIndex);
      dispatch(Actions.setEditorText(recalled));
      return;
    }
    if (key.downArrow && historyIndex >= 0) {
      const nextIndex = historyIndex - 1;
      const recalled = nextIndex < 0 ? draft : history[nextIndex] ?? "";
      setHistoryIndex(nextIndex);
      dispatch(Actions.setEditorText(recalled));
      return;
    }
    if (key.backspace || key.delete) {
      if (buffer.length === 0) return;
      const next = buffer.slice(0, -1);
      dispatch(Actions.setEditorText(next));
      return;
    }
    if (input.length > 0 && !key.ctrl && !key.meta) {
      const next = buffer + input;
      if (buffer.length === 0) dispatch(Actions.clearBanners());
      dispatch(Actions.setEditorText(next));
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderTop={true}
      borderBottom={true}
      borderLeft={false}
      borderRight={false}
      borderColor={pickColor("borderMuted")}
      width="100%"
    >
      <Box flexDirection="column" paddingX={1}>
        {placeholder ? (
          <Text color={pickColor("muted")}>{PLACEHOLDER}</Text>
        ) : (
          lines.map((line, i) => (
            <Text key={`l-${i}`}>{line.length === 0 ? " " : line}</Text>
          ))
        )}
      </Box>
    </Box>
  );
}

interface CaretPosition {
  readonly x: number;
  readonly y: number;
}

const EDITOR_PADDING_X = 1;
const EDITOR_BORDER_LINES = 2;
const FOOTER_LINES = 2;

function caretPositionForCursor(buffer: string, totalRows: number): CaretPosition {
  const lines = buffer.split("\n");
  const lastLineIndex = lines.length - 1;
  const currentLine = lines[lastLineIndex] ?? "";
  const x = EDITOR_PADDING_X + currentLine.length;
  const lastContentRow = Math.max(0, totalRows - FOOTER_LINES - EDITOR_BORDER_LINES);
  const y = Math.max(1, lastContentRow + 1 - (lines.length - 1 - lastLineIndex));
  return { x, y };
}

export {
  caretPositionForCursor as _caretPositionForCursor
}
