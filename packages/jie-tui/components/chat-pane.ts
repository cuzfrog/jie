import { Container, Spacer, Text } from "@earendil-works/pi-tui";
import type { AgentUiState, MessageCard, MessageTurn } from "../state";
import { MessageView } from "./message-view";
import { ToolCard } from "./tool-card";

const PROMPT_GAP = 1;

export class ChatPane extends Container {
  private agent: AgentUiState | null;
  private readonly toolCards: Map<string, ToolCard>;

  constructor() {
    super();
    this.agent = null;
    this.toolCards = new Map();
  }

  setAgent(agent: AgentUiState | null): void {
    this.agent = agent;
    this.toolCards.clear();
  }

  render(width: number): string[] {
    this.clear();
    if (this.agent === null) return [];
    for (const turn of this.agent.history) {
      this.renderTurn(turn, width);
    }
    if (this.agent.currentTurn !== null) {
      this.renderTurn(this.agent.currentTurn, width);
    }
    return super.render(width);
  }

  private renderTurn(turn: MessageTurn, width: number): void {
    this.addChild(new Spacer(PROMPT_GAP));
    this.addChild(new Text("› " + turn.userPrompt));
    for (const card of turn.cards) {
      this.renderCard(card, width);
    }
    for (const block of turn.blocks) {
      const view = new MessageView();
      view.setBlock(block);
      view.render(width).forEach((line) => this.addChild(new Text(line)));
    }
  }

  private renderCard(card: MessageCard, width: number): void {
    if (card.kind === "toolCall") {
      const tc = new ToolCard();
      tc.setCard(card);
      tc.render(width).forEach((line) => this.addChild(new Text(line)));
      this.toolCards.set(card.callId, tc);
      return;
    }
    const tc = this.toolCards.get(card.callId) ?? new ToolCard();
    tc.setCard(card);
    tc.render(width).forEach((line) => this.addChild(new Text(line)));
    this.toolCards.set(card.callId, tc);
  }
}

export function chatPaneFromAgent(agent: AgentUiState | null): ChatPane {
  const pane = new ChatPane();
  pane.setAgent(agent);
  return pane;
}
