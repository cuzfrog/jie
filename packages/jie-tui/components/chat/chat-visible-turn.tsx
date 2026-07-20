import type { JSX } from "react";
import { Box, Text } from "@cuzfrog/jie-ink";
import type { MessageTurn } from "../../state";
import { MessageView } from "./message-view";

interface ChatVisibleTurnProps {
  readonly turn: MessageTurn;
  readonly turnIndex: number;
  readonly isFirstVisible: boolean;
  /**
  Rows of this turn's rendered box (leading separator, then content) hidden
  above the viewport top. Zero paints the whole box. For the first visible
  turn, `useChatScroll` reports how far the window top has moved into the
  box: 1 hides exactly the separator, more also clips content rows.
  */
  readonly hiddenRows: number;
  readonly thinkingExpanded: boolean;
  readonly toolCardsExpanded: boolean;
}

export function ChatVisibleTurn({
  turn,
  turnIndex,
  isFirstVisible,
  hiddenRows,
  thinkingExpanded,
  toolCardsExpanded,
}: ChatVisibleTurnProps): JSX.Element {
  const hasSeparator = turnIndex > 0;
  if (isFirstVisible && hiddenRows > 0) {
    return (
      <Box overflow="hidden" flexDirection="column" flexShrink={0}>
        <Box marginTop={-hiddenRows} flexDirection="column">
          {hasSeparator ? <Text> </Text> : null}
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
      {hasSeparator ? <Text> </Text> : null}
      <MessageView
        turn={turn}
        thinkingExpanded={thinkingExpanded}
        toolCardsExpanded={toolCardsExpanded}
      />
    </Box>
  );
}
