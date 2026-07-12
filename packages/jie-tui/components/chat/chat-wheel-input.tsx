import { type JSX } from "react";
import { Box, useInput } from "@cuzfrog/jie-ink";
import { Actions, type AgentUiState } from "../../state";
import { useTuiContext } from "../context";
import { useChatScroll } from "./chat-scroll-model";
import { planNavigation } from "./chat-navigate";

interface ChatWheelInputProps {
  readonly focused: AgentUiState;
  readonly width: number;
  readonly height: number;
  readonly linesPerNotch?: number;
}

const DEFAULT_LINES_PER_NOTCH = 3;

/**
Mouse-wheel bindings for the chat viewport. DECSET 1002/1006 enable is now
owned by jie-ink (the engine there listens on the global input emitter), so
this component only routes wheel events into the same navigation planner
the keyboard bindings use.

`parseKeypress` in jie-ink translates buttons 64/65 into `key.wheelUp` /
`key.wheelDown` and suppresses press/release events from leaking into the
editor (`name === 'mouse'`, listed in `nonAlphanumericKeys`).
*/
export function ChatWheelInput({ focused, width, height, linesPerNotch }: ChatWheelInputProps): JSX.Element {
  const { state, dispatch } = useTuiContext();
  const options = { toolCardsExpanded: state.toolCardsExpanded, thinkingExpanded: state.thinkingExpanded };
  const stored = state.chatScrollOffsets.get(focused.agentId) ?? Number.POSITIVE_INFINITY;
  const safeHeight = Math.max(1, height);
  const slice = useChatScroll(focused, width, safeHeight, stored, options);
  const notch = linesPerNotch ?? DEFAULT_LINES_PER_NOTCH;
  useInput((_input, key) => {
    let delta = 0;
    if (key.wheelUp) delta = -notch;
    else if (key.wheelDown) delta = notch;
    else return;
    const outcome = planNavigation(slice, delta);
    if (outcome.kind === "noop") return;
    if (outcome.kind === "repin-tail") {
      dispatch(Actions.jumpChat(focused.agentId, "tail"));
      return;
    }
    dispatch(Actions.scrollChat(focused.agentId, outcome.newOffsetRows));
  });
  return <Box flexShrink={0} />;
}