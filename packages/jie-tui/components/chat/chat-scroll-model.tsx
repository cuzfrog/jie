import { useMemo } from "react";
import type { AgentUiState, MessageCard, MessageTurn } from "../../state";

export interface ChatScrollOptions {
  readonly toolCardsExpanded: boolean;
  readonly thinkingExpanded: boolean;
}

export interface ChatScrollTurnMetrics {
  readonly turnIndex: number;
  readonly turnHeight: number;
  readonly startRow: number;
}

export interface ChatScrollSlice {
  readonly totalRows: number;
  readonly tailOffset: number;
  readonly scrollOffset: number;
  readonly atTop: boolean;
  readonly atTail: boolean;
  readonly metrics: ReadonlyArray<ChatScrollTurnMetrics>;
  readonly visibleMetrics: ReadonlyArray<ChatScrollTurnMetrics>;
  readonly truncatedFirsts: ReadonlyMap<number, number>;
}

const BLANK_ROW_BETWEEN_TURNS = 1;
const WORKING_INDICATOR_ROWS = 1;
const MIN_WIDTH_FOR_WRAP = 8;
const PROMPT_PREFIX = "> ";
const ASSISTANT_PREFIX = "  ";
const THINKING_PREFIX = "  ";

/**
Hook counterpart for the `sliceChat` math used by `<ChatHistory>`.
Pure: takes inputs, returns the visible window. Memoized so re-renders that
do not change the relevant inputs reuse the previous slice.
*/
export function useChatScroll(
  focused: AgentUiState,
  width: number,
  viewportHeight: number,
  scrollOffset: number,
  options: ChatScrollOptions,
): ChatScrollSlice {
  return useMemo<ChatScrollSlice>(
    () => sliceChat(focused, width, viewportHeight, scrollOffset, options),
    [focused, width, viewportHeight, scrollOffset, options.toolCardsExpanded, options.thinkingExpanded],
  );
}

export function sliceChat(
  focused: AgentUiState,
  width: number,
  viewportHeight: number,
  scrollOffset: number,
  options: ChatScrollOptions,
): ChatScrollSlice {
  const { perTurn, totalRows } = measureChat(focused, width, options);
  const safeHeight = Math.max(1, viewportHeight);
  const tailOffset = Math.max(0, totalRows - safeHeight);
  const clamped = Math.max(0, Math.min(scrollOffset, tailOffset));
  const windowTop = clamped;
  const windowBottom = clamped + safeHeight - 1;
  const visibleMetrics: ChatScrollTurnMetrics[] = [];
  const truncatedFirsts = new Map<number, number>();
  for (const m of perTurn) {
    const endRow = m.startRow + m.turnHeight - 1;
    if (endRow < windowTop) continue;
    if (m.startRow > windowBottom) continue;
    visibleMetrics.push(m);
    if (m.startRow < windowTop) truncatedFirsts.set(m.turnIndex, windowTop - m.startRow);
  }
  return {
    totalRows,
    tailOffset,
    scrollOffset: clamped,
    atTop: clamped === 0,
    atTail: clamped >= tailOffset,
    metrics: perTurn,
    visibleMetrics,
    truncatedFirsts,
  };
}

export function measureChat(
  focused: AgentUiState,
  width: number,
  options: ChatScrollOptions,
): { readonly perTurn: ReadonlyArray<ChatScrollTurnMetrics>; readonly totalRows: number } {
  const allTurns: ReadonlyArray<MessageTurn> = focused.currentTurn === null
    ? focused.history
    : [...focused.history, focused.currentTurn];
  const perTurn: ChatScrollTurnMetrics[] = [];
  let cursor = 0;
  for (let i = 0; i < allTurns.length; i++) {
    const turn = allTurns[i]!;
    const height = turnHeight(turn, width, options);
    perTurn.push({ turnIndex: i, turnHeight: height, startRow: cursor });
    cursor += height;
    if (i < allTurns.length - 1) cursor += BLANK_ROW_BETWEEN_TURNS;
  }
  let totalRows = cursor;
  if (focused.status === "busy") totalRows += WORKING_INDICATOR_ROWS;
  return { perTurn, totalRows };
}

/**
Walk the scroll offset by `delta` rows. The store calls this when the user
emits PgUp/PgDn/mouse-wheel. The slice clamps to `[0, tailOffset]` at
render time so an over-shoot in either direction is auto-corrected.
*/
export function stepChatOffset(current: number, delta: number, totalRows: number, viewportHeight: number): number {
  const safeHeight = Math.max(1, viewportHeight);
  const tailOffset = Math.max(0, totalRows - safeHeight);
  return Math.max(0, Math.min(tailOffset, current + delta));
}

/**
Jump to `'top'` (returns 0) or `'tail'` (returns `tailOffset`). The reducer
uses these directly; no null sentinel is needed.
*/
export function jumpChatOffset(target: "top" | "tail", totalRows: number, viewportHeight: number): number {
  if (target === "top") return 0;
  return Math.max(0, totalRows - Math.max(1, viewportHeight));
}

/**
Approximate terminal rows a turn consumes at the given viewport width.
Implemented as a JSX-tree mirror so that virtual-scroll decisions match
what `<MessageView>` will actually paint: user-prompt prefix, block
prefix, tool-card body padding. Full-width CJK or very long tool outputs
may differ by a row or two; we over-estimate so users never lose content
while scrolling.
*/
export function turnHeight(turn: MessageTurn, width: number, options: ChatScrollOptions): number {
  let rows = 0;
  const blockWidth = Math.max(MIN_WIDTH_FOR_WRAP, width - 2);
  if (turn.userPrompt.length > 0) rows += promptHeight(turn.userPrompt, blockWidth);
  for (const card of turn.cards) rows += cardHeight(card, width, options.toolCardsExpanded);
  for (const block of turn.blocks) rows += blockHeight(block, options.thinkingExpanded, blockWidth);
  return Math.max(1, rows);
}

function promptHeight(text: string, width: number): number {
  return wrapAccountingForFirstLinePrefix(text, width, PROMPT_PREFIX);
}

function blockHeight(
  block: { kind: "text" | "thinking"; text: string },
  thinkingExpanded: boolean,
  width: number,
): number {
  if (block.text.length === 0) return 0;
  if (block.kind === "thinking" && !thinkingExpanded) return 1;
  const prefix = block.kind === "thinking" ? THINKING_PREFIX : ASSISTANT_PREFIX;
  return wrapAccountingForFirstLinePrefix(block.text, width, prefix);
}

function cardHeight(card: MessageCard, width: number, expanded: boolean): number {
  if (!expanded) return 1;
  let rows = 1;
  const innerWidth = Math.max(MIN_WIDTH_FOR_WRAP, width - 2);
  if (card.input !== undefined && card.input !== "") rows += 1 + wrapAll(card.input, innerWidth);
  if (card.output !== undefined && card.output !== null && card.output !== "") {
    rows += 1 + wrapAll(card.output, innerWidth);
  }
  const err = card.error;
  if (err !== undefined && err !== null && err !== "") rows += 1 + wrapAll(err, innerWidth);
  return rows;
}

/**
Wrap text assuming only the first line carries the prefix (subsequent lines
use the full width). Mirrors the prefix-vs-no-prefix layout in
`<TextBlock>` and the user-prompt prefix in `<MessageView>`.
*/
function wrapAccountingForFirstLinePrefix(text: string, width: number, prefix: string): number {
  const safeWidth = Math.max(1, width);
  let total = 0;
  let first = true;
  for (const line of text.split("\n")) {
    const cols = first ? line.length + prefix.length : line.length;
    const rowsForLine = line.length === 0 ? 1 : Math.max(1, Math.ceil(cols / safeWidth));
    total += rowsForLine;
    first = false;
  }
  return Math.max(1, total);
}

/**
Wrap assuming every line consumes the full width (used for tool card
bodies with their own left padding).
*/
function wrapAll(text: string, width: number): number {
  const safeWidth = Math.max(1, width);
  let total = 0;
  for (const line of text.split("\n")) {
    const rowsForLine = line.length === 0 ? 1 : Math.max(1, Math.ceil(line.length / safeWidth));
    total += rowsForLine;
  }
  return Math.max(1, total);
}
