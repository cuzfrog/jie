import { type JSX } from "react";
import { Box, Text } from "@cuzfrog/jie-ink";
import { useTuiContext } from "../context";
import { pickColor } from "../themes";
import { parseBashCommand } from "../../bash";

export function BashModeIndicator(): JSX.Element {
  const { state } = useTuiContext();
  const parsed = parseBashCommand(state.editorText);
  if (parsed === null) return <Box />;
  const label = parsed.mode === "exclude" ? BASH_MODE_EXCLUDE_LABEL : BASH_MODE_LABEL;
  return (
    <Box width="100%">
      <Text color={pickColor("warning")}>{label}</Text>
    </Box>
  );
}

export function bashModeIndicatorHeight(editorText: string): number {
  return parseBashCommand(editorText) === null ? 0 : 1;
}

const BASH_MODE_LABEL = "! bash mode · command runs in the shell · output kept in context";
const BASH_MODE_EXCLUDE_LABEL = "!! bash mode · command runs in the shell · excluded from context";
