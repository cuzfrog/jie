import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import type { AgentUiState, MessageBlock, MessageCard, MessageTurn } from "../state";
import { MessageView } from "./message-view";
import { ToolCard } from "./tool-card";

const PROMPT_GAP = 1;

export class ChatPane extends Container {
  private agent: AgentUiState | null;
  private readonly toolCards: Map<string, ToolCard>;
  private cachedLines: string[] | null = null;
  private cachedWidth = -1;
  private viewportHeight = 0;

  constructor() {
    super();
    this.agent = null;
    this.toolCards = new Map();
  }

  setAgent(agent: AgentUiState | null): void {
    if (this.agent === agent) return;
    this.agent = agent;
    this.cachedLines = null;
    this.rebuildChildren();
  }

  setViewportHeight(rows: number): void {
    if (this.viewportHeight === rows) return;
    this.viewportHeight = Math.max(0, rows);
    this.cachedLines = null;
  }

  render(width: number): string[] {
    if (this.cachedLines !== null && this.cachedWidth === width) {
      return this.cachedLines;
    }
    this.cachedWidth = width;
    const baseLines = super.render(width);
    if (this.viewportHeight <= 0 || baseLines.length >= this.viewportHeight) {
      this.cachedLines = baseLines;
    } else {
      const padded = [...baseLines];
      while (padded.length < this.viewportHeight) padded.push("");
      this.cachedLines = padded;
    }
    return this.cachedLines;
  }

  invalidate(): void {
    this.cachedLines = null;
  }

  private rebuildChildren(): void {
    this.clear();
    this.toolCards.clear();
    if (this.agent === null) return;
    for (const turn of this.agent.history) {
      this.appendTurn(turn);
    }
    if (this.agent.currentTurn !== null) {
      this.appendTurn(this.agent.currentTurn);
    }
  }

  private appendTurn(turn: MessageTurn): void {
    this.appendPrompt(turn.userPrompt);
    for (const card of turn.cards) {
      this.appendCard(card);
    }
    this.appendBlocks(turn.blocks);
  }

  private appendPrompt(userPrompt: string): void {
    this.addChild(new Spacer(PROMPT_GAP));
    this.addChild(new Text("› " + userPrompt));
  }

  private appendBlocks(blocks: ReadonlyArray<MessageBlock>): void {
    for (const block of blocks) {
      if (block === undefined) continue;
      const messageView = new MessageView();
      messageView.setBlock(block);
      this.addChild(messageView);
    }
  }

  private appendCard(card: MessageCard): void {
    if (card.kind === "toolCall") {
      const toolCard = new ToolCard();
      toolCard.setCard(card);
      this.addChild(toolCard);
      this.toolCards.set(card.callId, toolCard);
      return;
    }
    let toolCard = this.toolCards.get(card.callId);
    if (toolCard === undefined) {
      toolCard = new ToolCard();
      this.toolCards.set(card.callId, toolCard);
    }
    toolCard.setCard(card);
    this.addChild(toolCard);
  }
}

export function chatPaneFromAgent(agent: AgentUiState | null): ChatPane {
  const pane = new ChatPane();
  pane.setAgent(agent);
  return pane;
}
