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
      let view = this.messageViews.get(i);
      if (view === undefined) {
        view = new MessageView();
        this.messageViews.set(i, view);
      }
      view.setBlock(block);
      this.addChild(view);
    }
  }

  private appendCard(card: MessageCard): void {
    if (card.kind === "toolCall") {
      const tc = new ToolCard();
      tc.setCard(card);
      this.addChild(tc);
      this.toolCards.set(card.callId, tc);
      return;
    }
    let tc = this.toolCards.get(card.callId);
    if (tc === undefined) {
      tc = new ToolCard();
      this.toolCards.set(card.callId, tc);
    }
    tc.setCard(card);
    this.addChild(tc);
  }
}

export function chatPaneFromAgent(agent: AgentUiState | null): ChatPane {
  const pane = new ChatPane();
  pane.setAgent(agent);
  return pane;
}
