import { Markdown, visibleWidth, type Component } from "@earendil-works/pi-tui";
import type { MessageCard, MessageTurn, StateStore } from "../../state";
import { ASSISTANT_PREFIX, jieMarkdownTheme, style } from "../themes";
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
    const lines: string[] = [];
    let textOrdinal = 0;
    let thinkingOrdinal = 0;
    let cardOrdinal = 0;
    let prefixed = false;
    for (const block of turn.blocks) {
      if (block.text === "") continue;
      if (block.kind === "thinking") {
        lines.push(...this.thinkingAt(thinkingOrdinal, block.text).render(w));
        thinkingOrdinal += 1;
        continue;
      }
      const rendered = this.markdownAt(textOrdinal, block.text).render(prefixed ? w : Math.max(1, w - PREFIX_WIDTH));
      textOrdinal += 1;
      if (!prefixed && rendered.length > 0) {
        lines.push(style("assistantMessageIcon")(ASSISTANT_PREFIX) + rendered[0]);
        lines.push(...rendered.slice(1));
      } else {
        lines.push(...rendered);
      }
      prefixed = true;
    }
    for (const card of turn.cards) {
      lines.push(...this.cardAt(cardOrdinal, card).render(w));
      cardOrdinal += 1;
    }
    return lines;
  }

  invalidate(): void {
    for (const markdown of this.markdowns) markdown.invalidate();
    for (const thinking of this.thinkings) thinking.invalidate();
    for (const card of this.cards) card.invalidate();
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

  private thinkingAt(ordinal: number, text: string): ThinkingBlock {
    const existing = this.thinkings[ordinal];
    if (existing === undefined) {
      const created = new ThinkingBlock(text, this.stateStore);
      this.thinkings.push(created);
      return created;
    }
    existing.update(text);
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
