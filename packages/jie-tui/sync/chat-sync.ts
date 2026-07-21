import { Container } from "@earendil-works/pi-tui";
import { TuiState, type AgentId, type AgentUiState, type MessageTurn, type StateStore } from "../state";
import { AssistantMessage, UserMessage } from "../components/chat";

interface TurnPair {
  readonly user: UserMessage;
  readonly assistant: AssistantMessage;
}

export function createChatSync(stateStore: StateStore, chatContainer: Container, requestRender: () => void): () => void {
  let syncedAgentId: AgentId | null = null;
  const pairs: TurnPair[] = [];
  return stateStore.subscribe(async (_action, afterState): Promise<void> => {
    const focused = TuiState.getFocusedAgent(afterState);
    const agentId = focused === null ? null : focused.agentId;
    if (agentId !== syncedAgentId) {
      syncedAgentId = agentId;
      chatContainer.clear();
      pairs.length = 0;
    }
    const turns = focused === null ? [] : turnsOf(focused);
    while (pairs.length > turns.length) {
      const pair = pairs.pop();
      if (pair === undefined) break;
      chatContainer.removeChild(pair.user);
      chatContainer.removeChild(pair.assistant);
    }
    for (let i = 0; i < turns.length; i++) {
      const turn = turns[i]!;
      const existing = pairs[i];
      if (existing !== undefined) {
        existing.user.update(turn);
        existing.assistant.update(turn);
      } else {
        const pair: TurnPair = { user: new UserMessage(turn.userPrompt), assistant: new AssistantMessage(turn, stateStore) };
        pairs.push(pair);
        chatContainer.addChild(pair.user);
        chatContainer.addChild(pair.assistant);
      }
    }
    requestRender();
  });
}

function turnsOf(agent: AgentUiState): MessageTurn[] {
  const turns = [...agent.history];
  if (agent.currentTurn !== null) turns.push(agent.currentTurn);
  return turns;
}
