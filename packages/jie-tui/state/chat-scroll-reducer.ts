import type { AgentId, TuiState } from "./state";

/**
Sentinel stored when the user is at the tail and has not scrolled away.
Reads as `Infinity` and clamps to `tailOffset` inside the slice; acts as
the default whenever a per-agent entry is absent.
*/
export const TAIL_PIN_OFFSET = Number.POSITIVE_INFINITY;

/**
Apply an absolute scroll-offset move for `agentId`. The keyboard and
wheel handlers compute the clamped target themselves (using
`slice.tailOffset`), so the reducer just records it. `newOffsetRows` is
floored at 0; tail-pin is a separate reducer (see `reduceChatJump`).
*/
export function reduceChatScroll(state: TuiState, agentId: AgentId, newOffsetRows: number): TuiState {
  const clamped = newOffsetRows < 0 ? 0 : newOffsetRows;
  const current = state.chatScrollOffsets.get(agentId);
  if (current !== undefined && current === clamped) return state;
  const draft = new Map(state.chatScrollOffsets);
  draft.set(agentId, clamped);
  return { ...state, chatScrollOffsets: draft };
}

/**
Apply a jump-to-anchor request. `'top'` sets offset to 0; `'tail'` clears
the entry so the next read defaults to `TAIL_PIN_OFFSET`.
*/
export function reduceChatJump(state: TuiState, agentId: AgentId, target: "top" | "tail"): TuiState {
  if (target === "tail") {
    if (!state.chatScrollOffsets.has(agentId)) return state;
    const draft = new Map(state.chatScrollOffsets);
    draft.delete(agentId);
    return { ...state, chatScrollOffsets: draft };
  }
  const current = state.chatScrollOffsets.get(agentId) ?? TAIL_PIN_OFFSET;
  if (current === 0) return state;
  const draft = new Map(state.chatScrollOffsets);
  draft.set(agentId, 0);
  return { ...state, chatScrollOffsets: draft };
}
