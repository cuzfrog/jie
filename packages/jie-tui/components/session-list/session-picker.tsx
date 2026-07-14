import { useMemo, type JSX } from "react";
import { Box, Text, useInput } from "@cuzfrog/jie-ink";
import type { SessionSummary } from "@cuzfrog/jie-platform";
import { pickColor } from "../themes";
import { SessionList } from "./session-list";
import { filterSessions } from "./filter";

interface SessionPickerProps {
  readonly sessions: ReadonlyArray<SessionSummary>;
  readonly query: string;
  readonly focusedIndex: number;
  readonly width: number;
  readonly height: number;
  readonly onQueryChange: (next: string) => void;
  readonly onFocusChange: (delta: 1 | -1) => void;
  readonly onSelect: (session: SessionSummary) => void;
  readonly onClose: () => void;
}

export function SessionPicker(props: SessionPickerProps): JSX.Element {
  const { sessions, query, focusedIndex, width, height } = props;
  const filtered = useMemo(() => filterSessions(query, sessions), [query, sessions]);
  const visibleCount = Math.max(0, height - 4);
  const visible = filtered.slice(0, visibleCount);

  useInput((input, key) => {
    if (key.upArrow) {
      props.onFocusChange(-1);
      return;
    }
    if (key.downArrow) {
      props.onFocusChange(1);
      return;
    }
    if (key.return || input === "\n") {
      const target = filtered[focusedIndex];
      if (target !== undefined) props.onSelect(target);
      return;
    }
    if (key.escape) {
      props.onClose();
      return;
    }
    if (key.backspace) {
      props.onQueryChange(query.slice(0, -1));
      return;
    }
    if (key.ctrl || key.meta) return;
    if (input.length > 0) {
      props.onQueryChange(query + input);
    }
  });

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="round"
      borderColor={pickColor("border")}
      paddingX={1}
    >
      <Text color={pickColor("accent")}>Resume session (Esc close · Enter select · ↑↓ move · type to filter)</Text>
      <Box>
        <Text color={pickColor("muted")}>filter: </Text>
        <Text>{query === "" ? " " : query}</Text>
      </Box>
      <SessionList sessions={visible} width={width - 4} focusedIndex={focusedIndex} />
      {filtered.length > visibleCount ? (
        <Text color={pickColor("muted")}>…and {filtered.length - visibleCount} more</Text>
      ) : null}
    </Box>
  );
}
