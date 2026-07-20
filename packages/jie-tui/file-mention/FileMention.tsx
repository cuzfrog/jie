import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { Box, Text, useInput } from "@cuzfrog/jie-ink";
import { filterFiles, type FileEntry } from "./filter";

const MAX_VISIBLE = 8;
const PICKER_CHROME_ROWS = 3;
const OVERFLOW_ROWS = 1;
const DEFAULT_MAX_ROWS = PICKER_CHROME_ROWS + MAX_VISIBLE + OVERFLOW_ROWS;

interface FileMentionProps {
  readonly editorText: string;
  readonly sessionPickerOpen: boolean;
  readonly files: ReadonlyArray<FileEntry>;
  readonly onInsert: (filePath: string, tokenStart: number, tokenEnd: number) => void;
  readonly maxRows?: number;
}

export function fileMentionHeight(
  editorText: string,
  sessionPickerOpen: boolean,
  files: ReadonlyArray<FileEntry>,
  maxRows: number,
): number {
  if (sessionPickerOpen || editorText.startsWith("/")) return 0;
  const mention = mentionToken(editorText);
  if (mention === null) return 0;
  return pickerRowCount(filterFiles(mention.text, files).length, maxRows);
}

export function FileMention(props: FileMentionProps): JSX.Element {
  const { editorText, sessionPickerOpen, files, onInsert } = props;
  const maxRows = props.maxRows ?? DEFAULT_MAX_ROWS;
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const onInsertRef = useRef(onInsert);
  onInsertRef.current = onInsert;

  const mention = mentionToken(editorText);

  const candidates = useMemo<ReadonlyArray<FileEntry>>(() => filterFiles(mention?.text ?? "", files), [mention?.text, files]);

  useEffect(() => {
    setFocusedIndex(0);
  }, [mention?.text, files]);

  const visibleCount = pickerVisibleCount(candidates.length, maxRows);
  const visible = candidates.slice(0, visibleCount);
  const activeIndex = Math.min(focusedIndex, Math.max(0, visibleCount - 1));
  const isVisible = !sessionPickerOpen && !editorText.startsWith("/") && mention !== null && visibleCount > 0;

  useInput(
    (_input, key) => {
      if (!isVisible || mention === null) return;
      if (key.tab) {
        if (key.shift) {
          if (visibleCount === 0) return;
          setFocusedIndex((prev) => (Math.min(prev, visibleCount - 1) - 1 + visibleCount) % visibleCount);
          return;
        }
        const target = candidates[activeIndex];
        if (target !== undefined) onInsertRef.current(target.path, mention.start, mention.end);
        return;
      }
    },
    { isActive: isVisible },
  );

  if (!isVisible) return <></>;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan">file mentions (Tab insert)</Text>
      {visible.map((entry, i) => (
        <Text key={entry.path} color={i === activeIndex ? "cyan" : undefined}>
          {`${entry.path}${i === activeIndex ? "  *" : ""}`}
        </Text>
      ))}
      {candidates.length > visibleCount ? (
        <Text color="gray">…and {candidates.length - visibleCount} more</Text>
      ) : null}
    </Box>
  );
}

interface MentionToken {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

function mentionToken(editorText: string): MentionToken | null {
  const start = editorText.lastIndexOf("@");
  if (start === -1) return null;
  const end = mentionEnd(editorText, start);
  return { text: editorText.slice(start + 1, end), start, end };
}

function mentionEnd(text: string, atIndex: number): number {
  for (let i = atIndex + 1; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === " " || ch === "\t" || ch === "\n") return i;
  }
  return text.length;
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
