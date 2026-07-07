import { Box, Text } from "ink";
import type { MessageBlock } from "../../state";
import { ASSISTANT_PREFIX, THINKING_LABEL, pickColor } from "../themes";

export interface TextBlockProps {
  readonly block: MessageBlock;
  readonly expanded: boolean;
}

export function TextBlock({ block, expanded }: TextBlockProps): JSX.Element {
  const lines = block.text.length === 0 ? [] : block.text.split("\n");
  if (block.kind === "thinking") {
    if (!expanded) {
      return (
        <Text color={pickColor("thinkingText")}>
          <Text italic>{THINKING_LABEL}</Text>
        </Text>
      );
    }
    return (
      <Box flexDirection="column">
        {lines.map((line, i) => (
          <Text key={`t-${i}`} color={pickColor("thinkingText")} italic>
            {i === 0 ? `  ${line}` : `  ${line}`}
          </Text>
        ))}
      </Box>
    );
  }
  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Text key={`b-${i}`} color={pickColor("text")}>
          {i === 0 ? `${ASSISTANT_PREFIX}${line}` : `  ${line}`}
        </Text>
      ))}
    </Box>
  );
}