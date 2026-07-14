import { Box, Text } from "@cuzfrog/jie-ink";
import type { JSX } from "react";
import type { MessageBlock } from "../../state";
import { ASSISTANT_PREFIX, THINKING_LABEL, pickColor } from "../themes";
import { Markdown } from "../markdown";

interface TextBlockProps {
  readonly block: MessageBlock;
  readonly expanded: boolean;
}

export function TextBlock({ block, expanded }: TextBlockProps): JSX.Element {
  if (block.kind === "thinking") {
    if (!expanded) {
      return (
        <Text color={pickColor("thinkingText")}>
          <Text italic>{THINKING_LABEL}</Text>
        </Text>
      );
    }
    const lines = block.text.length === 0 ? [] : block.text.split("\n");
    return (
      <Box flexDirection="column">
        {lines.map((line, i) => (
          <Text key={`t-${i}`} color={pickColor("thinkingText")} italic>
            {`  ${line}`}
          </Text>
        ))}
      </Box>
    );
  }
  if (block.text.length === 0) {
    return <></>;
  }
  return (
    <Markdown
      source={block.text}
      prefix={{ text: ASSISTANT_PREFIX, color: pickColor("assistantMessageIcon") }}
    />
  );
}
