import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { useTuiContext } from "../context";
import { Actions } from "../../state";
import { pickColor } from "../themes";

export interface EditorProps {}

const HISTORY_LIMIT = 100;
const PLACEHOLDER = "type a prompt...";

export function Editor(_props: EditorProps): JSX.Element {
  const { state, dispatch } = useTuiContext();
  const [history, setHistory] = useState<ReadonlyArray<string>>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [draft, setDraft] = useState<string>("");
  const buffer = state.editorText;

  useInput((input, key) => {
    if (key.return) {
      const text = buffer;
      if (text.length === 0) return;
      const next = [text, ...history].slice(0, HISTORY_LIMIT);
      setHistory(next);
      setHistoryIndex(-1);
      setDraft("");
      dispatch(Actions.setEditorText(""));
      dispatch(Actions.submitEditorText(text));
      return;
    }
    if (input.endsWith("\r") && !key.ctrl && !key.meta) {
      const head = input.slice(0, -1);
      const next = buffer + head;
      if (next.length === 0) return;
      const hist = [next, ...history].slice(0, HISTORY_LIMIT);
      setHistory(hist);
      setHistoryIndex(-1);
      setDraft("");
      dispatch(Actions.setEditorText(""));
      dispatch(Actions.submitEditorText(next));
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
      dispatch(Actions.setEditorText(next));
    }
  });

  const placeholder = buffer.length === 0;
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={pickColor("borderMuted")} width="100%">
      <Box flexDirection="column" paddingX={1}>
        {placeholder ? (
          <Text color={pickColor("muted")}>{PLACEHOLDER}</Text>
        ) : (
          buffer.split("\n").map((line, i) => (
            <Text key={`l-${i}`}>{line.length === 0 ? " " : line}</Text>
          ))
        )}
      </Box>
    </Box>
  );
}
