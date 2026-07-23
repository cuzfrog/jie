import { Container } from "@earendil-works/pi-tui";
import { TuiState, type AgentId, type AgentUiState, type MessageTurn, type StateStore } from "../state";
import type { AssistantMessageComponent, ChatMessages, UserMessageComponent } from "../components/chat";

export interface ChatSync {
  stop(): void;
}

interface TurnPair {
  readonly user: UserMessageComponent;
  readonly assistant: AssistantMessageComponent;
}

export class ChatSyncImpl implements ChatSync {
  private readonly chatMessages: ChatMessages;
  private readonly chatContainer: Container;
  private readonly requestRender: () => void;
  private syncedAgentId: AgentId | null = null;
  private readonly pairs: TurnPair[] = [];
  private readonly unsubscribe: () => void;

  constructor(stateStore: StateStore, chatMessages: ChatMessages, chatContainer: Container, requestRender: () => void) {
    this.chatMessages = chatMessages;
    this.chatContainer = chatContainer;
    this.requestRender = requestRender;
    this.unsubscribe = stateStore.subscribe(async (_action, afterState) => this.sync(afterState));
  }

  stop(): void {
    this.unsubscribe();
  }

  private async sync(afterState: TuiState): Promise<void> {
    const focused = TuiState.getFocusedAgent(afterState);
    const agentId = focused === null ? null : focused.agentId;
    if (agentId !== this.syncedAgentId) {
      this.syncedAgentId = agentId;
      this.chatContainer.clear();
      this.pairs.length = 0;
    }
    const turns = focused === null ? [] : turnsOf(focused);
    while (this.pairs.length > turns.length) {
      const pair = this.pairs.pop();
      if (pair === undefined) break;
      this.chatContainer.removeChild(pair.user);
      this.chatContainer.removeChild(pair.assistant);
    }
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i]!;
      const existing = this.pairs[i];
      if (existing !== undefined) {
        existing.user.update(turn);
        existing.assistant.update(turn);
      } else {
        const pair: TurnPair = {
          user: this.chatMessages.createUserMessage(turn.userPrompt),
          assistant: this.chatMessages.createAssistantMessage(turn),
        };
        this.pairs.push(pair);
        this.chatContainer.addChild(pair.user);
        this.chatContainer.addChild(pair.assistant);
      }
    }
    this.requestRender();
  }
}

function turnsOf(agent: AgentUiState): MessageTurn[] {
  const turns = [...agent.history];
  if (agent.currentTurn !== null) turns.push(agent.currentTurn);
  return turns;
}
