import type { JSX } from "react";
import { Box, Text } from "@cuzfrog/jie-ink";
import type { ChatScrollSlice } from "./chat-scroll-model";

interface ChatScrollHudProps {
  readonly slice: ChatScrollSlice;
  readonly width: number;
}

export function ChatScrollHud({ slice, width }: ChatScrollHudProps): JSX.Element | null {
  if (slice.atTail) return null;
  const hidden = slice.scrollOffset;
  return (
    <Box width={width} flexShrink={0}>
      <Text dimColor>
        scrolled up {hidden} {hidden === 1 ? "row" : "rows"} of {slice.totalRows}
        {" - "}
        End jumps to tail
      </Text>
    </Box>
  );
}
