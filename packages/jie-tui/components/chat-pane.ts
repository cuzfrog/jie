import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import type { AgentUiState, MessageCard, MessageTurn } from "../state";
import { MessageView } from "./message-view";
import { ToolCard } from "./tool-card";

const PROMPT_GAP = 1;

export class ChatPane extends Container {
  private agent: AgentUiState | null;
  private readonly toolCards: Map<string, ToolCard>;
  private readonly messageViews: Map<number, MessageView>;
  private cachedLines: string[] | null = null;
  private cachedWidth = -1;

  constructor() {
    super();
    this.agent = null;
    this.toolCards = new Map();
    this.messageViews = new Map();
  }

  setAgent(agent: AgentUiState | null): void {
    if (this.agent === agent) return;
    this.agent = agent;
    this.cachedLines = null;
    this.rebuildChildren();
  }

  render(width: number): string[] {
    if (this.cachedLines !== null && this.cachedWidth === width) {
      return this.cachedLines;
    }
    this.cachedWidth = width;
    this.cachedLines = super.render(width);
    return this.cachedLines;
  }

  invalidate(): void {
    this.cachedLines = null;
  }

  private rebuildChildren(): void {
    this.clear();
    this.toolCards.clear();
    this.messageViews.clear();
    if (this.agent === null) return;
    for (const turn of this.agent.history) {
      this.appendTurn(turn);
    }
    if (this.agent.currentTurn !== null) {
      this.appendTurn(this.agent.currentTurn);
    }
  }

  private appendTurn(turn: MessageTurn): void {
    this.addChild(new Spacer(PROMPT_GAP));
    this.addChild(new Text("› " + turn.userPrompt));
    for (const card of turn.cards) {
      this.appendCard(card);
    }
    for (let i = 0; i < turn.blocks.length; i++) {
      const block = turn.blocks[i];
      if (block === undefined) continue;
      let messageView = this.messageViews.get(i);
      if (messageView === undefined) {
        messageView = new MessageView();
        this.messageViews.set(i, messageView);
      }
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
