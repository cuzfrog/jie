import { Fragment, type JSX } from "react";
import { Box } from "@cuzfrog/jie-ink";
import type { AgentUiState } from "../../state";
import { useChatScroll, type ChatScrollOptions } from "./chat-scroll-model";
import { ChatVisibleTurn } from "./chat-visible-turn";
import { WorkingIndicator } from "./working-indicator";

interface ChatHistoryProps {
  readonly focused: AgentUiState;
  readonly width: number;
  readonly viewportHeight: number;
  readonly scrollOffset: number;
  readonly options: ChatScrollOptions;
}

export function ChatHistory({
  focused,
  width,
  viewportHeight,
  scrollOffset,
  options,
}: ChatHistoryProps): JSX.Element {
  const slice = useChatScroll(focused, width, viewportHeight, scrollOffset, options);
  const allTurns: ReadonlyArray<AgentUiState["history"][number]> = focused.currentTurn === null
    ? focused.history
    : [...focused.history, focused.currentTurn];
  return (
    <Box flexDirection="column" width={width} flexShrink={0}>
      {slice.visibleMetrics.map((m, i) => {
        const turn = allTurns[m.turnIndex];
        if (turn === undefined) return null;
        const hidden = slice.truncatedFirsts.get(m.turnIndex) ?? 0;
        return (
          <Fragment key={m.turnIndex}>
            <ChatVisibleTurn
              turn={turn}
              turnIndex={m.turnIndex}
              isFirstVisible={i === 0}
              hiddenRows={hidden}
              thinkingExpanded={options.thinkingExpanded}
              toolCardsExpanded={options.toolCardsExpanded}
            />
          </Fragment>
        );
      })}
      {focused.status === "busy" ? <WorkingIndicator /> : null}
    </Box>
  );
}
