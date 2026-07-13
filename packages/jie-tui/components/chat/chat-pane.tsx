import { type JSX } from "react";
import { Box, Text } from "@cuzfrog/jie-ink";
import { useTuiContext } from "../context";
import { ChatHistory } from "./chat-history";
import { ChatKeyBindings } from "./chat-key-bindings";
import { ChatScrollHud } from "./chat-scroll-hud";
import { ChatWheelInput } from "./chat-wheel-input";
import { useChatScroll } from "./chat-scroll-model";

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

export function ChatPane({ width, height }: ChatPaneProps): JSX.Element {
  const { state } = useTuiContext();
  const focusedId = state.focusedAgentId;
  const focused = focusedId === null ? null : state.agents.get(focusedId) ?? null;
  if (focused === null) {
    return (
      <Box flexDirection="column" width={width} height={height} overflow="hidden" flexShrink={0}>
        <Text color="gray">no focused agent</Text>
      </Box>
    );
  }
  const stored = focusedId === null ? TAIL_PIN_OFFSET : (state.chatScrollOffsets.get(focusedId) ?? TAIL_PIN_OFFSET);
  const options = { toolCardsExpanded: state.toolCardsExpanded, thinkingExpanded: state.thinkingExpanded };
  const slice = useChatScroll(focused, width, height, stored, options);
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
          scrollOffset={stored}
          options={options}
        />
      </Box>
      <ChatScrollHud slice={slice} width={width} />
    </Box>
  );
}