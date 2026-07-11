import { useState, type JSX } from "react";
import { Box, Text, useInput } from "ink";
import { useTuiContext } from "../context";
import { Actions } from "../../state";
import { pickColor } from "../themes";

interface EditorProps { }

const HISTORY_LIMIT = 100;
const CURSOR_BLOCK = "▌";

export function Editor(_props: EditorProps): JSX.Element {
  const { state, dispatch } = useTuiContext();
  const [history, setHistory] = useState<ReadonlyArray<string>>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [draft, setDraft] = useState<string>("");
  const buffer = state.editorText;
  const lines = buffer.split("\n");

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
        {buffer.length === 0 ? (
          <Text>{CURSOR_BLOCK}</Text>
        ) : (
          lines.map((line, i) => {
            const isCursorLine = i === lines.length - 1;
            const display = line.length === 0 ? " " : line;
            if (!isCursorLine) return <Text key={`l-${i}`}>{display}</Text>;
            return (
              <Text key={`l-${i}`}>
                {display}
                <Text>{CURSOR_BLOCK}</Text>
              </Text>
            );
          })
        )}
      </Box>
    </Box>
  );
}