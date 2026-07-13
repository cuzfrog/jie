import { useInput } from "@cuzfrog/jie-ink";
import { useTuiContext } from "../context";
import { Actions, type AgentUiState } from "../../state";

type AgentId = ReturnType<typeof Actions.scrollChat>["payload"]["agentId"];
import { useChatScroll } from "./chat-scroll-model";
import { planNavigation } from "./chat-navigate";

interface ChatKeyBindingsProps {
  readonly focused: AgentUiState;
  readonly width: number;
  readonly height: number;
}

/**
PgUp/PgDn/Home/End bindings for the chat viewport. The handlers
read the same slice the pane renders so the navigation math does
not fight the tail-pin sentinel — `planNavigation` returns either a
finite `scrollChat(newOffsetRows)`, a `jumpChat('tail')` re-pin, or
a `noop`. The reducer is no longer asked to add a delta to Infinity,
which is the root cause of the prior "scroll only works when not at
tail" symptom.
*/
export function ChatKeyBindings({ focused, width, height }: ChatKeyBindingsProps): null {
  const { state, dispatch } = useTuiContext();
  const options = { toolCardsExpanded: state.toolCardsExpanded, thinkingExpanded: state.thinkingExpanded };
  const stored = state.chatScrollOffsets.get(focused.agentId) ?? Number.POSITIVE_INFINITY;
  const safeHeight = Math.max(1, height);
  const slice = useChatScroll(focused, width, safeHeight, stored, options);
  useInput((_input, key) => {
    if (key.pageUp) {
      navigate(dispatch, focused.agentId, slice, -(safeHeight - 1));
      return;
    }
    if (key.pageDown) {
      navigate(dispatch, focused.agentId, slice, safeHeight - 1);
      return;
    }
    if (key.home) {
      dispatch(Actions.jumpChat(focused.agentId, "top"));
      return;
    }
    if (key.end) {
      dispatch(Actions.jumpChat(focused.agentId, "tail"));
      return;
    }
  });
  return null;
}

function navigate(
  dispatch: (action: ReturnType<typeof Actions.scrollChat | typeof Actions.jumpChat>) => void,
  agentId: AgentId,
  slice: ReturnType<typeof useChatScroll>,
  delta: number,
): void {
  const outcome = planNavigation(slice, delta);
  if (outcome.kind === "noop") return;
  if (outcome.kind === "repin-tail") {
    dispatch(Actions.jumpChat(agentId, "tail"));
    return;
  }
  dispatch(Actions.scrollChat(agentId, outcome.newOffsetRows));
}