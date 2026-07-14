import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { Box, Text, useInput } from "@cuzfrog/jie-ink";
import { filterFiles, type FileEntry } from "./filter";

const MAX_VISIBLE = 8;

interface FileMentionProps {
  readonly editorText: string;
  readonly sessionPickerOpen: boolean;
  readonly files: ReadonlyArray<FileEntry>;
  readonly onInsert: (filePath: string) => void;
}

export function FileMention(props: FileMentionProps): JSX.Element {
  const { editorText, sessionPickerOpen, files, onInsert } = props;
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const onInsertRef = useRef(onInsert);
  onInsertRef.current = onInsert;

  const atIndex = editorText.lastIndexOf("@");
  const mentionRange = atIndex === -1 ? -1 : mentionEnd(editorText, atIndex);
  const query = atIndex === -1 || mentionRange === -1 ? "" : editorText.slice(atIndex + 1, mentionRange);

  const candidates = useMemo<ReadonlyArray<FileEntry>>(() => filterFiles(query, files), [query, files]);

  useEffect(() => {
    setFocusedIndex(0);
  }, [query, files]);

  const visible = candidates.slice(0, MAX_VISIBLE);
  const isVisible =
    !sessionPickerOpen && atIndex !== -1 && mentionRange !== -1 && candidates.length > 0;

  useInput(
    (_input, key) => {
      if (!isVisible) return;
      if (key.tab) {
        if (key.shift) {
          if (candidates.length === 0) return;
          setFocusedIndex((prev) => (prev - 1 + candidates.length) % candidates.length);
          return;
        }
        const target = candidates[focusedIndex];
        if (target !== undefined) onInsertRef.current(target.path);
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
        <Text key={entry.path} color={i === focusedIndex ? "cyan" : undefined}>
          {`${entry.path}${i === focusedIndex ? "  *" : ""}`}
        </Text>
      ))}
      {candidates.length > MAX_VISIBLE ? (
        <Text color="gray">…and {candidates.length - MAX_VISIBLE} more</Text>
      ) : null}
    </Box>
  );
}

function mentionEnd(text: string, atIndex: number): number {
  for (let i = atIndex + 1; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === " " || ch === "\t" || ch === "\n") return i;
  }
  return text.length;
}
