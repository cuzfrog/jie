import { Fragment, type JSX } from "react";
import { Box, Text } from "@cuzfrog/jie-ink";
import type { AgentUiState, MessageTurn } from "../../state";
import { useTuiContext } from "../context";
import { MessageView } from "./message-view";
import { WorkingIndicator } from "./working-indicator";

interface ChatPaneProps {
  readonly width: number;
  readonly height: number;
}

export function ChatPane({ width, height }: ChatPaneProps): JSX.Element {
  const { state } = useTuiContext();
  const focusedId = state.focusedAgentId;
  const focused = focusedId === null ? null : state.agents.get(focusedId) ?? null;
  if (focused === null) {
    return (
      <Box flexDirection="column" width={width} height={height} overflow="scrollBottom" flexShrink={0}>
        <Text color="gray">no focused agent</Text>
      </Box>
    );
  }
  return renderTurns(focused, state.thinkingExpanded, state.toolCardsExpanded, width, height);
}

function renderTurns(
  focused: AgentUiState,
  thinkingExpanded: boolean,
  toolCardsExpanded: boolean,
  width: number,
  height: number,
): JSX.Element {
  const allTurns: ReadonlyArray<MessageTurn> = focused.currentTurn === null
    ? focused.history
    : [...focused.history, focused.currentTurn];
  const isBusy = focused.status === "busy";
  return (
    <Box flexDirection="column" width={width} height={height} overflow="scrollBottom" flexShrink={0}>
      {allTurns.map((turn, i) => (
        <Fragment key={`t-${i}`}>
          {i > 0 ? <Text> </Text> : null}
          <MessageView
            turn={turn}
            thinkingExpanded={thinkingExpanded}
            toolCardsExpanded={toolCardsExpanded}
          />
        </Fragment>
      ))}
      {isBusy ? <WorkingIndicator /> : null}
    </Box>
  );
}