import { useState, useEffect, useRef, useCallback, type JSX } from "react";
import { Box, Text, useInput, usePaste } from "@cuzfrog/jie-ink";
import { useTuiContext } from "../context";
import { Actions } from "../../state";
import { pickColor, RAIL_ERROR_GLYPH } from "../themes";
import { useEditorState } from "./useEditorState";
import { useEditorInput, renderLines, editorViewport } from "./editor-view";

interface EditorProps {
  readonly width?: number;
  readonly maxContentRows?: number;
}

const HISTORY_LIMIT = 100;
const DEFAULT_WIDTH = 100;
const DEFAULT_MAX_CONTENT_ROWS = 8;
const PADDING_COLS = 2;

export function Editor({ width = DEFAULT_WIDTH, maxContentRows = DEFAULT_MAX_CONTENT_ROWS }: EditorProps): JSX.Element {
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
  const externalUpdateValue = useRef<string | null>(null);

  const handleSubmit = useCallback((value: string): void => {
    const text = value.replace(/[\r\n]+$/, "");
    if (text.length === 0) return;
    const next = [text, ...history].slice(0, HISTORY_LIMIT);
    setHistory(next);
    setHistoryIndex(-1);
    setDraft("");
    api.applyExternalValue("");
    dispatch(Actions.setEditorText(""));
    dispatch(Actions.submitEditorText(text));
  }, [api, history, dispatch]);

  useEffect(() => {
    if (externalUpdate.current) {
      externalUpdate.current = false;
      const target = externalUpdateValue.current ?? state.editorText;
      externalUpdateValue.current = null;
      apiRef.current.applyExternalValue(target);
      setMountKey((k) => k + 1);
    }
  }, [state.editorText]);

  useInput((_input, key) => {
    if (state.sessionPickerOpen) return;
    if (key.upArrow) {
      const { buffer } = api;
      const onTopLine = buffer.cursorLine === 0;
      const atLineStart = buffer.cursorCol === 0;
      if (onTopLine && atLineStart && history.length > 0 && historyIndex === -1) {
        setDraft(api.value);
        setHistoryIndex(0);
        externalUpdate.current = true;
        const recalled = history[0] ?? "";
        externalUpdateValue.current = recalled;
        dispatch(Actions.setEditorText(recalled));
        return;
      }
      if (historyIndex >= 0) {
        const nextIndex = Math.min(historyIndex + 1, history.length - 1);
        setHistoryIndex(nextIndex);
        externalUpdate.current = true;
        const recalled = history[nextIndex] ?? "";
        externalUpdateValue.current = recalled;
        dispatch(Actions.setEditorText(recalled));
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
        externalUpdateValue.current = recalled;
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
    if (key.return && !key.shift) {
      handleSubmit(api.readValue());
    }
  });

  useEditorInput(api, { isDisabled: state.sessionPickerOpen });

  usePaste((text) => {
    if (text.length > 0) api.insert(text);
  }, { isActive: !state.sessionPickerOpen });

  const bannerText = state.errorBanner;
  const showErrorBanner = bannerText !== null && bannerText !== "";
  const innerWidth = Math.max(1, width - PADDING_COLS);
  const bannerRows = showErrorBanner ? 1 : 0;
  const textMaxRows = Math.max(1, maxContentRows - bannerRows);
  const visibleLines = editorViewport(renderLines(api), api.buffer.cursorLine, textMaxRows, innerWidth);

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
      flexShrink={0}
    >
      <Box flexDirection="column" paddingX={1} key={mountKey}>
        {showErrorBanner ? (
          <Text color={pickColor("error")}>{`${RAIL_ERROR_GLYPH} ${bannerText}`}</Text>
        ) : null}
        {visibleLines.map((line, i) => (
          <Text key={i}>{line.text}</Text>
        ))}
      </Box>
    </Box>
  );
}
