import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { Actions, type StateStore } from "../../state";
import { pickColor } from "../themes";

export interface EditorProps {
  readonly stateStore: StateStore;
  readonly onSubmit: (text: string) => void;
}

const HISTORY_LIMIT = 100;
const PLACEHOLDER = "type a prompt...";

export function Editor({ stateStore, onSubmit }: EditorProps): JSX.Element {
  const [buffer, setBuffer] = useState<string>("");
  const [history, setHistory] = useState<ReadonlyArray<string>>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [draft, setDraft] = useState<string>("");

  useInput((input, key) => {
    if (key.return) {
      const text = buffer;
      if (text.length === 0) return;
      const next = [text, ...history].slice(0, HISTORY_LIMIT);
      setHistory(next);
      setHistoryIndex(-1);
      setDraft("");
      setBuffer("");
      stateStore.dispatch(Actions.setEditorText(""));
      onSubmit(text);
      return;
    }
    if (key.upArrow && history.length > 0) {
      const nextIndex = historyIndex < 0 ? 0 : Math.min(historyIndex + 1, history.length - 1);
      const recalled = history[nextIndex] ?? "";
      if (historyIndex === -1) setDraft(buffer);
      setHistoryIndex(nextIndex);
      setBuffer(recalled);
      stateStore.dispatch(Actions.setEditorText(recalled));
      return;
    }
    if (key.downArrow && historyIndex >= 0) {
      const nextIndex = historyIndex - 1;
      const recalled = nextIndex < 0 ? draft : history[nextIndex] ?? "";
      setHistoryIndex(nextIndex);
      setBuffer(recalled);
      stateStore.dispatch(Actions.setEditorText(recalled));
      return;
    }
    if (key.backspace || key.delete) {
      if (buffer.length === 0) return;
      const next = buffer.slice(0, -1);
      setBuffer(next);
      stateStore.dispatch(Actions.setEditorText(next));
      return;
    }
    if (input.length > 0 && !key.ctrl && !key.meta) {
      const next = buffer + input;
      setBuffer(next);
      stateStore.dispatch(Actions.setEditorText(next));
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