import { useState, useEffect, useRef, useCallback, type JSX } from "react";
import { Box, useInput } from "ink";
import { TextInput } from "@inkjs/ui";
import { useTuiContext } from "../context";
import { Actions } from "../../state";
import { pickColor } from "../themes";

interface EditorProps { }

const HISTORY_LIMIT = 100;

export function Editor(_props: EditorProps): JSX.Element {
  const { state, dispatch } = useTuiContext();
  const [history, setHistory] = useState<ReadonlyArray<string>>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [draft, setDraft] = useState<string>("");
  const [mountKey, setMountKey] = useState<number>(0);
  // When true, the upcoming state.editorText change came from outside the input
  // (history walk or post-submit clear). We must remount <TextInput> so its
  // internal tiState.value picks up the new defaultValue; otherwise the next
  // keystroke would append to the stale tiState.value.
  const externalUpdate = useRef<boolean>(false);

  const handleChange = useCallback((value: string): void => {
    if (historyIndex !== -1) setHistoryIndex(-1);
    dispatch(Actions.setEditorText(value));
    if (state.errorBanner !== null && value.length > 0) {
      dispatch(Actions.clearBanners());
    }
  }, [historyIndex, dispatch, state.errorBanner]);

  const handleSubmit = useCallback((value: string): void => {
    const text = value.replace(/[\r\n]+$/, "");
    if (text.length === 0) return;
    const next = [text, ...history].slice(0, HISTORY_LIMIT);
    setHistory(next);
    setHistoryIndex(-1);
    setDraft("");
    externalUpdate.current = true;
    dispatch(Actions.setEditorText(""));
    dispatch(Actions.submitEditorText(text));
  }, [history, dispatch]);

  useEffect(() => {
    if (externalUpdate.current) {
      externalUpdate.current = false;
      setMountKey((k) => k + 1);
    }
  }, [state.editorText]);

  useInput((_input, key) => {
    if (key.upArrow && history.length > 0 && historyIndex === -1) {
      setDraft(state.editorText);
      setHistoryIndex(0);
      externalUpdate.current = true;
      dispatch(Actions.setEditorText(history[0] ?? ""));
      return;
    }
    if (key.upArrow && historyIndex >= 0) {
      const nextIndex = Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(nextIndex);
      externalUpdate.current = true;
      dispatch(Actions.setEditorText(history[nextIndex] ?? ""));
      return;
    }
    if (key.downArrow && historyIndex >= 0) {
      const nextIndex = historyIndex - 1;
      setHistoryIndex(nextIndex);
      const recalled = nextIndex < 0 ? draft : history[nextIndex] ?? "";
      externalUpdate.current = true;
      dispatch(Actions.setEditorText(recalled));
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
        <TextInput
          key={mountKey}
          defaultValue={state.editorText}
          onChange={handleChange}
          onSubmit={handleSubmit}
        />
      </Box>
    </Box>
  );
}
