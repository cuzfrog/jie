import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import { Box, Text, useInput } from "@cuzfrog/jie-ink";
import { filterCommands } from "./filter";

const MAX_VISIBLE = 8;

export const SLASH_COMMAND_NAMES: ReadonlyArray<string> = [
  "help",
  "clear",
  "exit",
  "login",
  "logout",
  "model",
  "team",
  "resume",
  "continue",
];

interface SlashAutocompleteProps {
  readonly editorText: string;
  readonly sessionPickerOpen: boolean;
  readonly commands: ReadonlyArray<string>;
  readonly onCommit: (command: string, args: string) => void;
}

export function SlashAutocomplete(props: SlashAutocompleteProps): JSX.Element {
  const { editorText, sessionPickerOpen, commands, onCommit } = props;
  const [focusedIndex, setFocusedIndex] = useState<number>(0);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  const parsed = useMemo<{ readonly firstWord: string; readonly args: string }>(() => {
    const stripped = editorText.startsWith("/") ? editorText.slice(1) : "";
    const spaceIdx = stripped.indexOf(" ");
    if (spaceIdx === -1) return { firstWord: stripped, args: "" };
    return { firstWord: stripped.slice(0, spaceIdx), args: stripped.slice(spaceIdx + 1) };
  }, [editorText]);

  const candidates = useMemo<ReadonlyArray<string>>(() => filterCommands(parsed.firstWord, commands), [parsed, commands]);

  useEffect(() => {
    setFocusedIndex(0);
  }, [editorText]);

  const visible = candidates.slice(0, MAX_VISIBLE);
  const isVisible = !sessionPickerOpen && editorText.startsWith("/") && candidates.length > 0;

  useInput(
    (_input, key) => {
      if (!isVisible) return;
      if (key.tab) {
        if (key.shift) {
          if (candidates.length === 0) return;
          setFocusedIndex((prev) => (prev - 1 + candidates.length) % candidates.length);
          return;
        }
        const target = candidates[focusedIndex] ?? candidates[0];
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
        <Text key={name} color={i === focusedIndex ? "cyan" : undefined}>{`/${name}${i === focusedIndex ? "  *" : ""}`}</Text>
      ))}
      {candidates.length > MAX_VISIBLE ? (
        <Text color="gray">…and {candidates.length - MAX_VISIBLE} more</Text>
      ) : null}
    </Box>
  );
}
