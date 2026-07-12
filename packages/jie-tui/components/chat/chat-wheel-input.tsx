import { type JSX, useEffect } from "react";
import { Box, useInput, useStdout } from "@cuzfrog/jie-ink";
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
const CSI = String.fromCharCode(0x1b) + "[";

/**
SGR mouse-tracking enable/disable for the chat viewport. The whole TUI
runs in alt-screen (`tui.tsx` passes `alternateScreen: true` to render),
so DECSET 1000/1006 only affects wheel routing inside our chat pane
and does not pollute the terminal scrollback. We intentionally use
`1000` (button-press + wheel) rather than `1002`/`1003` so plain drag
without buttons stays untracked.

Alt-screen apps never expose terminal-native drag selection — that's a
property of the alt-screen mode itself, not of DECSET. Future in-app
text selection (à la claude-code's `use-selection`) is the path for
copying chat content from inside the TUI. See
`doc/specs/ui/tui-claude-code-reference.md` §7.9.
*/
function writeMouseTracking(stdout: NodeJS.WriteStream, action: "on" | "off"): void {
  if (!stdout.isTTY) return;
  if (action === "on") {
    stdout.write(`${CSI}?1000h`);
    stdout.write(`${CSI}?1006h`);
  } else {
    stdout.write(`${CSI}?1000l`);
    stdout.write(`${CSI}?1006l`);
  }
}

/**
Mouse-wheel bindings for the chat viewport. While mounted, the
terminal emits SGR mouse sequences; parseKeypress in jie-ink
translates buttons 64/65 into `key.wheelUp`/`key.wheelDown` and
suppresses press/release events from leaking into the editor
(`name === 'mouse'`, listed in `nonAlphanumericKeys`). This
component then routes the wheel event through the same navigation
planner the keyboard bindings use, so wheel + keys share a single
clamp / re-pin policy.
*/
export function ChatWheelInput({ focused, width, height, linesPerNotch }: ChatWheelInputProps): JSX.Element {
  const { state, dispatch } = useTuiContext();
  const { stdout } = useStdout();
  const options = { toolCardsExpanded: state.toolCardsExpanded, thinkingExpanded: state.thinkingExpanded };
  const stored = state.chatScrollOffsets.get(focused.agentId) ?? Number.POSITIVE_INFINITY;
  const safeHeight = Math.max(1, height);
  const slice = useChatScroll(focused, width, safeHeight, stored, options);
  const notch = linesPerNotch ?? DEFAULT_LINES_PER_NOTCH;
  useEffect(() => {
    writeMouseTracking(stdout, "on");
    return () => writeMouseTracking(stdout, "off");
  }, [stdout]);
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