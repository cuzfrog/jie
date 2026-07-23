import { type Component } from "@earendil-works/pi-tui";
import type { MessageTurn, StateStore } from "../../state";
import { AssistantMessage } from "./assistant-message";
import { UserMessage } from "./user-message";

export interface UserMessageComponent extends Component {
  update(turn: MessageTurn): void;
}

export interface AssistantMessageComponent extends Component {
  update(turn: MessageTurn | null): void;
}

export interface ChatMessages {
  createUserMessage(userPrompt: string): UserMessageComponent;
  createAssistantMessage(turn: MessageTurn | null): AssistantMessageComponent;
}

export class ChatMessagesImpl implements ChatMessages {
  constructor(private readonly stateStore: StateStore) {}

  createUserMessage(userPrompt: string): UserMessageComponent {
    return new UserMessage(userPrompt);
  }

  createAssistantMessage(turn: MessageTurn | null): AssistantMessageComponent {
    return new AssistantMessage(turn, this.stateStore);
  }
}
