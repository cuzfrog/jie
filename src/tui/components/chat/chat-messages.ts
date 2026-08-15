import { type Component } from "@earendil-works/pi-tui";
import type { AgentUiState, MessageTurn, StateStore } from "../../state";
import { AssistantMessage } from "./assistant-message";
import { CompactionMarkerMessage } from "./compaction-marker";
import { UserMessage } from "./user-message";

type CompactionMarker = NonNullable<AgentUiState["compactionMarker"]>;

export interface UserMessageComponent extends Component {
  update(turn: MessageTurn): void;
}

export interface AssistantMessageComponent extends Component {
  update(turn: MessageTurn | null): void;
}

export interface CompactionMarkerComponent extends Component {
  update(marker: CompactionMarker): void;
}

export interface ChatMessages {
  createUserMessage(userPrompt: string): UserMessageComponent;
  createAssistantMessage(turn: MessageTurn | null): AssistantMessageComponent;
  createCompactionMarker(marker: CompactionMarker): CompactionMarkerComponent;
}

export class ChatMessagesImpl implements ChatMessages {
  constructor(private readonly stateStore: StateStore) {}

  createUserMessage(userPrompt: string): UserMessageComponent {
    return new UserMessage(userPrompt);
  }

  createAssistantMessage(turn: MessageTurn | null): AssistantMessageComponent {
    return new AssistantMessage(turn, this.stateStore);
  }

  createCompactionMarker(marker: CompactionMarker): CompactionMarkerComponent {
    return new CompactionMarkerMessage(marker);
  }
}
