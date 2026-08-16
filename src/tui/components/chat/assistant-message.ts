import { Markdown, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import type { MessageBlock, MessageCard, MessageTurn, StateStore } from "../../state";
import { ASSISTANT_PREFIX, jieMarkdownTheme, style, THINKING_LABEL } from "../themes";
import { formatDuration, formatDurationAsSeconds } from "./format-duration";
import { ThinkingBlock } from "./thinking-block";
import { ToolCard } from "./tool-card";

const MARKDOWN_THEME = jieMarkdownTheme();
const PREFIX_WIDTH = visibleWidth(ASSISTANT_PREFIX);

export class AssistantMessage implements Component {
  private readonly stateStore: StateStore;
  private turn: MessageTurn | null;
  private readonly markdowns: Markdown[] = [];
  private readonly thinkings: ThinkingBlock[] = [];
  private readonly cards: ToolCard[] = [];
  private liveBlockIndex: number | null = null;
  private liveStartedAt: number = 0;

  constructor(turn: MessageTurn | null, stateStore: StateStore) {
    this.turn = turn;
    this.stateStore = stateStore;
  }

  update(turn: MessageTurn | null): void {
    this.turn = turn;
  }

  render(width: number): string[] {
    const turn = this.turn;
    if (turn === null) return [];
    const w = Math.max(1, width);
    const { thinkingExpanded, toolCardsExpanded } = this.stateStore.getState();
    const lines: string[] = [];
    let textOrdinal = 0;
    let thinkingOrdinal = 0;
    let cardOrdinal = 0;
    let prefixed = false;
    const run: RunState = { thinkingMs: null, cards: [], liveBlockIndex: null };
    for (let i = 0; i < turn.entries.length; i += 1) {
      const entry = turn.entries[i]!;
      if (isInvisibleEntry(entry)) continue;
      if (entry.kind === "text") {
        this.flushRun(lines, w, run);
        const rendered = this.markdownAt(textOrdinal, entry.text).render(prefixed ? w : Math.max(1, w - PREFIX_WIDTH));
        textOrdinal += 1;
        if (!prefixed && rendered.length > 0) {
          lines.push(style("assistantMessageIcon")(ASSISTANT_PREFIX) + rendered[0]);
          lines.push(...rendered.slice(1));
        } else {
          lines.push(...rendered);
        }
        prefixed = true;
        continue;
      }
      if (entry.kind === "thinking") {
        if (thinkingExpanded && entry.text !== "") {
          this.flushRun(lines, w, run);
          lines.push(...this.thinkingAt(thinkingOrdinal, entry).render(w));
          thinkingOrdinal += 1;
          continue;
        }
        if (entry.durationMs !== undefined) {
          run.thinkingMs = (run.thinkingMs ?? 0) + entry.durationMs;
        } else if (entry.text !== "") {
          run.liveBlockIndex = i;
        }
        continue;
      }
      if (!isCard(entry)) continue;
      if (toolCardsExpanded || !isAggregatableCard(entry)) {
        this.flushRun(lines, w, run);
        lines.push(...this.cardAt(cardOrdinal, entry).render(w));
        cardOrdinal += 1;
        continue;
      }
      run.cards.push(entry);
    }
    this.flushRun(lines, w, run);
    return lines;
  }

  private flushRun(lines: string[], width: number, run: RunState): void {
    if (run.thinkingMs === null && run.cards.length === 0 && run.liveBlockIndex === null) return;
    const liveElapsedMs = this.liveElapsedFor(run.liveBlockIndex);
    const summary = summarizeWork(run.thinkingMs, run.cards, liveElapsedMs);
    if (summary !== null) lines.push(truncateToWidth(style("thinkingText")(summary), width));
    run.thinkingMs = null;
    run.cards.length = 0;
    run.liveBlockIndex = null;
  }

  invalidate(): void {
    for (const markdown of this.markdowns) markdown.invalidate();
    for (const thinking of this.thinkings) thinking.invalidate();
    for (const card of this.cards) card.invalidate();
  }

  private liveElapsedFor(liveBlockIndex: number | null): number | null {
    if (liveBlockIndex === null) {
      this.liveBlockIndex = null;
      return null;
    }
    const now = Date.now();
    if (this.liveBlockIndex !== liveBlockIndex) {
      this.liveBlockIndex = liveBlockIndex;
      this.liveStartedAt = now;
    }
    return now - this.liveStartedAt;
  }

  private markdownAt(ordinal: number, text: string): Markdown {
    const existing = this.markdowns[ordinal];
    if (existing === undefined) {
      const created = new Markdown(text, 0, 0, MARKDOWN_THEME);
      this.markdowns.push(created);
      return created;
    }
    existing.setText(text);
    return existing;
  }

  private thinkingAt(ordinal: number, block: MessageBlock): ThinkingBlock {
    const existing = this.thinkings[ordinal];
    if (existing === undefined) {
      const created = new ThinkingBlock(block, this.stateStore);
      this.thinkings.push(created);
      return created;
    }
    existing.update(block);
    return existing;
  }

  private cardAt(ordinal: number, card: MessageCard): ToolCard {
    const existing = this.cards[ordinal];
    if (existing === undefined) {
      const created = new ToolCard(card, this.stateStore);
      this.cards.push(created);
      return created;
    }
    existing.update(card);
    return existing;
  }
}

interface RunState {
  thinkingMs: number | null;
  cards: MessageCard[];
  liveBlockIndex: number | null;
}

function isInvisibleEntry(entry: MessageBlock | MessageCard): boolean {
  if (entry.kind === "text") return entry.text === "";
  if (entry.kind === "thinking") return entry.text === "" && entry.durationMs === undefined;
  return false;
}

function isCard(entry: MessageBlock | MessageCard): entry is MessageCard {
  return entry.kind === "toolCall" || entry.kind === "toolResult";
}

function isAggregatableCard(card: MessageCard): boolean {
  if (card.kind !== "toolResult") return false;
  if (card.error !== undefined && card.error !== null && card.error !== "") return false;
  return !hasDiffDetail(card.details);
}

function hasDiffDetail(details: MessageCard["details"]): boolean {
  return details !== null && details !== undefined && "kind" in details && details.kind === "diff";
}

function summarizeWork(thinkingMs: number | null, cards: ReadonlyArray<MessageCard>, liveElapsedMs: number | null): string | null {
  if (thinkingMs === null && cards.length === 0 && liveElapsedMs === null) return null;
  const parts: string[] = [];
  if (liveElapsedMs !== null) {
    parts.push(`${THINKING_LABEL} (${formatDurationAsSeconds((thinkingMs ?? 0) + liveElapsedMs)})`);
  } else if (thinkingMs !== null) {
    parts.push(`Thought for ${formatDuration(thinkingMs)}`);
  }
  const usageCounts = new Map<string, number>();
  for (const card of cards) usageCounts.set(card.name, (usageCounts.get(card.name) ?? 0) + 1);
  for (const [name, count] of usageCounts) parts.push(`used ${name} ${count} ${count === 1 ? "time" : "times"}`);
  return parts.join(", ");
}

export { summarizeWork as _summarizeWork };
