import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { Box, Text, useInput } from "@cuzfrog/jie-ink";
import { filterCommands } from "./filter";

const MAX_VISIBLE = 8;
const PICKER_CHROME_ROWS = 3;
const OVERFLOW_ROWS = 1;
const DEFAULT_MAX_ROWS = PICKER_CHROME_ROWS + MAX_VISIBLE + OVERFLOW_ROWS;

interface SlashAutocompleteProps {
  readonly editorText: string;
  readonly sessionPickerOpen: boolean;
  readonly commands: ReadonlyArray<string>;
  readonly onCommit: (command: string, args: string) => void;
  readonly maxRows?: number;
}

export function slashAutocompleteHeight(
  editorText: string,
  sessionPickerOpen: boolean,
  commands: ReadonlyArray<string>,
  maxRows: number,
): number {
  if (sessionPickerOpen || !editorText.startsWith("/")) return 0;
  return pickerRowCount(filterCommands(parseSlash(editorText).firstWord, commands).length, maxRows);
}

export function SlashAutocomplete(props: SlashAutocompleteProps): JSX.Element {
  const { editorText, sessionPickerOpen, commands, onCommit } = props;
  const maxRows = props.maxRows ?? DEFAULT_MAX_ROWS;
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const parsed = useMemo<{ readonly firstWord: string; readonly args: string }>(() => parseSlash(editorText), [editorText]);

  const candidates = useMemo<ReadonlyArray<string>>(() => filterCommands(parsed.firstWord, commands), [parsed, commands]);

  useEffect(() => {
    setFocusedIndex(0);
  }, [editorText]);

  const visibleCount = pickerVisibleCount(candidates.length, maxRows);
  const visible = candidates.slice(0, visibleCount);
  const activeIndex = Math.min(focusedIndex, Math.max(0, visibleCount - 1));
  const isVisible = !sessionPickerOpen && editorText.startsWith("/") && visibleCount > 0;

  useInput(
    (_input, key) => {
      if (!isVisible) return;
      if (key.tab) {
        if (key.shift) {
          if (visibleCount === 0) return;
          setFocusedIndex((prev) => (Math.min(prev, visibleCount - 1) - 1 + visibleCount) % visibleCount);
          return;
        }
        const target = candidates[activeIndex];
        if (target !== undefined) onCommitRef.current(target, parsed.args);
        return;
      }
    },
    { isActive: isVisible },
  );

  if (!isVisible) return <></>;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan">slash commands (Tab commit · Shift+Tab cycle back)</Text>
      {visible.map((name, i) => (
        <Text key={name} color={i === activeIndex ? "cyan" : undefined}>{`/${name}${i === activeIndex ? "  *" : ""}`}</Text>
      ))}
      {candidates.length > visibleCount ? (
        <Text color="gray">…and {candidates.length - visibleCount} more</Text>
      ) : null}
    </Box>
  );
}

function parseSlash(editorText: string): { readonly firstWord: string; readonly args: string } {
  const stripped = editorText.startsWith("/") ? editorText.slice(1) : "";
  const spaceIdx = stripped.indexOf(" ");
  if (spaceIdx === -1) return { firstWord: stripped, args: "" };
  return { firstWord: stripped.slice(0, spaceIdx), args: stripped.slice(spaceIdx + 1) };
}

function pickerVisibleCount(candidateCount: number, maxRows: number): number {
  if (candidateCount === 0) return 0;
  let shown = Math.min(candidateCount, MAX_VISIBLE, Math.max(0, maxRows - PICKER_CHROME_ROWS));
  if (candidateCount > shown && PICKER_CHROME_ROWS + shown + OVERFLOW_ROWS > maxRows) shown -= 1;
  return Math.max(0, shown);
}

function pickerRowCount(candidateCount: number, maxRows: number): number {
  const shown = pickerVisibleCount(candidateCount, maxRows);
  if (shown === 0) return 0;
  return PICKER_CHROME_ROWS + shown + (candidateCount > shown ? OVERFLOW_ROWS : 0);
}
