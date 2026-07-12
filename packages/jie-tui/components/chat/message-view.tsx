import { Box, Text } from "@cuzfrog/jie-ink";
import type { JSX } from "react";
import type { MessageTurn } from "../../state";
import { USER_PROMPT_PREFIX, pickColor } from "../themes";
import { TextBlock } from "./text-block";
import { ToolCard } from "./tool-card";

interface MessageViewProps {
  readonly turn: MessageTurn;
  readonly thinkingExpanded: boolean;
  readonly toolCardsExpanded: boolean;
}

export function MessageView({
  turn,
  thinkingExpanded,
  toolCardsExpanded,
}: MessageViewProps): JSX.Element {
  const userLines = turn.userPrompt.length === 0 ? [] : turn.userPrompt.split("\n");
  return (
    <Box flexDirection="column">
      {userLines.length > 0 ? (
        <Box flexDirection="column">
          {userLines.map((line, i) => (
            <Text key={`u-${i}`} color={pickColor("userMessageIcon")}>
              {i === 0 ? `${USER_PROMPT_PREFIX}${line}` : `  ${line}`}
            </Text>
          ))}
        </Box>
      ) : null}
      {turn.cards.map((card, i) => (
        <ToolCard key={`c-${i}`} card={card} expanded={toolCardsExpanded} />
      ))}
      {turn.blocks.map((block, i) => (
        <TextBlock key={`b-${i}`} block={block} expanded={thinkingExpanded || block.kind !== "thinking"} />
      ))}
    </Box>
  );
}
