import { useState, useEffect, useRef, useCallback, type JSX } from "react";
import { Box, Text, useInput } from "@cuzfrog/jie-ink";
import { useTuiContext } from "../context";
import { Actions } from "../../state";
import { pickColor } from "../themes";
import { useEditorState } from "./useEditorState";
import { useEditorInput, renderLines } from "./editor-view";

interface EditorProps {}

const HISTORY_LIMIT = 100;

export function Editor(_props: EditorProps): JSX.Element {
  const { state, dispatch } = useTuiContext();
  const [history, setHistory] = useState<ReadonlyArray<string>>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [draft, setDraft] = useState<string>("");
  const [mountKey, setMountKey] = useState<number>(0);
  const externalUpdate = useRef<boolean>(false);

  const errorBannerRef = useRef<string | null>(state.errorBanner);
  errorBannerRef.current = state.errorBanner;

  const api = useEditorState(state.editorText, {
    onChange: (value): void => {
      if (historyIndex !== -1) setHistoryIndex(-1);
      dispatch(Actions.setEditorText(value));
      if (errorBannerRef.current !== null && value.length > 0) {
        dispatch(Actions.clearBanners());
      }
    },
  });

  const apiRef = useRef(api);
  apiRef.current = api;

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
      apiRef.current.applyExternalValue(state.editorText);
      setMountKey((k) => k + 1);
    }
  }, [state.editorText]);

  useInput((_input, key) => {
    if (key.upArrow) {
      const { buffer } = api;
      const onTopLine = buffer.cursorLine === 0;
      const atLineStart = buffer.cursorCol === 0;
      if (onTopLine && atLineStart && history.length > 0 && historyIndex === -1) {
        setDraft(api.value);
        setHistoryIndex(0);
        externalUpdate.current = true;
        dispatch(Actions.setEditorText(history[0] ?? ""));
        return;
      }
      if (historyIndex >= 0) {
        const nextIndex = Math.min(historyIndex + 1, history.length - 1);
        setHistoryIndex(nextIndex);
        externalUpdate.current = true;
        dispatch(Actions.setEditorText(history[nextIndex] ?? ""));
        return;
      }
      if (onTopLine && atLineStart) {
        return;
      }
      api.moveCursorUp();
      return;
    }
    if (key.downArrow) {
      if (historyIndex >= 0) {
        const nextIndex = historyIndex - 1;
        setHistoryIndex(nextIndex);
        const recalled = nextIndex < 0 ? draft : history[nextIndex] ?? "";
        externalUpdate.current = true;
        dispatch(Actions.setEditorText(recalled));
        return;
      }
      const { buffer } = api;
      const lastLine = buffer.lines[buffer.cursorLine] ?? "";
      const onLastLine = buffer.cursorLine === buffer.lines.length - 1;
      const atLineEnd = buffer.cursorCol === lastLine.length;
      if (onLastLine && atLineEnd) return;
      api.moveCursorDown();
      return;
    }
    if (key.return) {
      handleSubmit(api.value);
    }
  });

  useEditorInput(api);

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
      <Box flexDirection="column" paddingX={1} key={mountKey}>
        {renderLines(api).map((line, i) => (
          <Text key={i}>{line.text}</Text>
        ))}
      </Box>
    </Box>
  );
}
