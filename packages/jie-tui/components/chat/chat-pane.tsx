import { type JSX } from "react";
import { Box, Text } from "@cuzfrog/jie-ink";
import { useTuiContext } from "../context";
import { ChatHistory } from "./chat-history";
import { ChatKeyBindings } from "./chat-key-bindings";
import { ChatScrollHud } from "./chat-scroll-hud";
import { ChatWheelInput } from "./chat-wheel-input";
import { useChatScroll } from "./chat-scroll-model";
import type { AgentUiState } from "../../state";

/**
Tail-pin sentinel. Stored in the map as the offset when the user has not
scrolled away from the latest turn. The slice clamps `Infinity` to
`tailOffset`, so passing `Number.POSITIVE_INFINITY` here always produces
a tail-pinned view.
*/
const TAIL_PIN_OFFSET = Number.POSITIVE_INFINITY;

interface ChatPaneProps {
  readonly width: number;
  readonly height: number;
}

const EMPTY_OPTIONS = { toolCardsExpanded: false, thinkingExpanded: false } as const;

export function ChatPane({ width, height }: ChatPaneProps): JSX.Element {
  const { state } = useTuiContext();
  const focusedId = state.focusedAgentId;
  const focused = focusedId === null ? null : state.agents.get(focusedId) ?? null;
  // Pass a synthetic empty agent when no focus is set so the slice collapses
  // to zero rows and the hook count/order stays identical to the focused path.
  const sliceAgent = focused ?? EMPTY_FOCUSED;
  const sliceOffset = focused === null || focusedId === null
    ? TAIL_PIN_OFFSET
    : state.chatScrollOffsets.get(focusedId) ?? TAIL_PIN_OFFSET;
  const sliceOptions = focused === null
    ? EMPTY_OPTIONS
    : { toolCardsExpanded: state.toolCardsExpanded, thinkingExpanded: state.thinkingExpanded };
  const slice = useChatScroll(sliceAgent, width, height, sliceOffset, sliceOptions);

  if (focused === null) {
    return (
      <Box flexDirection="column" width={width} height={height} overflow="hidden" flexShrink={0}>
        <Text color="gray">no focused agent</Text>
      </Box>
    );
  }
  const hudHeight = slice.atTail ? 0 : 1;
  const historyHeight = Math.max(1, height - hudHeight);
  return (
    <Box flexDirection="column" width={width} height={height} overflow="hidden" flexShrink={0}>
      <ChatKeyBindings focused={focused} width={width} height={historyHeight} />
      <ChatWheelInput focused={focused} width={width} height={historyHeight} />
      <Box flexDirection="column" width={width} height={historyHeight}>
        <ChatHistory
          focused={focused}
          width={width}
          viewportHeight={historyHeight}
          scrollOffset={sliceOffset}
          options={sliceOptions}
        />
      </Box>
      <ChatScrollHud slice={slice} width={width} />
    </Box>
  );
}

const EMPTY_FOCUSED: AgentUiState = {
  agentId: ":",
  teamId: "",
  agentKey: "",
  role: "",
  isLeader: false,
  status: "idle",
  model: null,
  queue: [],
  history: [],
  currentTurn: null,
  lastStopReason: null,
  contextTokensUsed: 0,
  lastReportedTotalTokens: null,
  todos: [],
};