import { Fragment } from "react";
import { Box, Text } from "ink";
import type { AgentUiState, MessageTurn } from "../../state";
import { useTuiContext } from "../context";
import { MessageView } from "./message-view";
import { WorkingIndicator } from "./working-indicator";

export interface ChatPaneProps {
  readonly width: number;
}

export function ChatPane({ width }: ChatPaneProps): JSX.Element {
  const { state, thinkingExpanded, toolCardsExpanded } = useTuiContext();
  const focusedId = state.focusedAgentId;
  const focused = focusedId === null ? null : state.agents.get(focusedId) ?? null;
  if (focused === null) {
    return (
      <Box flexDirection="column" width={width}>
        <Text color="gray">no focused agent</Text>
      </Box>
    );
  }
  return renderTurns(focused, thinkingExpanded, toolCardsExpanded, width);
}

function renderTurns(
  focused: AgentUiState,
  thinkingExpanded: boolean,
  toolCardsExpanded: boolean,
  width: number,
): JSX.Element {
  const allTurns: ReadonlyArray<MessageTurn> = focused.currentTurn === null
    ? focused.history
    : [...focused.history, focused.currentTurn];
  const isBusy = focused.status === "busy";
  return (
    <Box flexDirection="column" width={width}>
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