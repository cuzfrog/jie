import type { JSX } from "react";
import { Box, Text } from "@cuzfrog/jie-ink";
import type { MessageTurn } from "../../state";
import { MessageView } from "./message-view";

interface ChatVisibleTurnProps {
  readonly turn: MessageTurn;
  readonly turnIndex: number;
  readonly isFirstVisible: boolean;
  /**
  Number of rows of this turn's content that should be hidden above the
  viewport top. Zero means render the turn flush at the top of the visible
  window. Positive values are produced by `useChatScroll` when the user has
  scrolled up by a non-integer number of turns.
  */
  readonly hiddenRows: number;
  readonly thinkingExpanded: boolean;
  readonly toolCardsExpanded: boolean;
}

export function ChatVisibleTurn({
  turn,
  isFirstVisible,
  hiddenRows,
  thinkingExpanded,
  toolCardsExpanded,
}: ChatVisibleTurnProps): JSX.Element {
  if (isFirstVisible && hiddenRows > 0) {
    return (
      <Box overflow="hidden" flexDirection="column" flexShrink={0}>
        <Box marginTop={-hiddenRows} flexDirection="column">
          <MessageView
            turn={turn}
            thinkingExpanded={thinkingExpanded}
            toolCardsExpanded={toolCardsExpanded}
          />
        </Box>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" flexShrink={0}>
      {isFirstVisible ? null : <Text> </Text>}
      <MessageView
        turn={turn}
        thinkingExpanded={thinkingExpanded}
        toolCardsExpanded={toolCardsExpanded}
      />
    </Box>
  );
}
