import { Container, type Component } from "@earendil-works/pi-tui";
import { TuiState, type AgentId, type AgentUiState, type InfoEntry, type MessageTurn, type StateStore } from "../state";
import type { AssistantMessageComponent, ChatMessages, UserMessageComponent } from "../components/chat";

export interface ChatSync {
  stop(): void;
}

interface TurnPair {
  readonly user: UserMessageComponent;
  readonly assistant: AssistantMessageComponent;
}

type ChatEntry =
  | { readonly kind: "turn"; readonly turn: MessageTurn }
  | { readonly kind: "info"; readonly entry: InfoEntry };

type SyncedEntry =
  | { readonly kind: "turn"; readonly seq: number; readonly pair: TurnPair }
  | { readonly kind: "info"; readonly seq: number; readonly component: Component };

export class ChatSyncImpl implements ChatSync {
  private readonly stateStore: StateStore;
  private readonly chatMessages: ChatMessages;
  private readonly chatContainer: Container;
  private readonly requestRender: () => void;
  private syncedAgentId: AgentId | null = null;
  private readonly synced: SyncedEntry[] = [];
  private readonly unsubscribe: () => void;

  constructor(stateStore: StateStore, chatMessages: ChatMessages, chatContainer: Container, requestRender: () => void) {
    this.stateStore = stateStore;
    this.chatMessages = chatMessages;
    this.chatContainer = chatContainer;
    this.requestRender = requestRender;
    this.unsubscribe = stateStore.subscribe(async (): Promise<void> => this.sync());
  }

  stop(): void {
    this.unsubscribe();
  }

  private async sync(): Promise<void> {
    const state = this.stateStore.getState();
    const focused = TuiState.getFocusedAgent(state);
    const agentId = focused === null ? null : focused.agentId;
    if (agentId !== this.syncedAgentId) {
      this.syncedAgentId = agentId;
      this.chatContainer.clear();
      this.synced.length = 0;
    }
    const entries = mergeEntries(focused === null ? [] : turnsOf(focused), state.infoEntries);
    let firstMismatch = 0;
    while (
      firstMismatch < this.synced.length &&
      firstMismatch < entries.length &&
      sameEntry(this.synced[firstMismatch]!, entries[firstMismatch]!)
    ) firstMismatch++;
    while (this.synced.length > firstMismatch) {
      const stale = this.synced.pop();
      if (stale === undefined) break;
      this.removeEntry(stale);
    }
    for (let i = firstMismatch; i < entries.length; i++) {
      const created = this.createEntry(entries[i]!);
      this.synced.push(created);
      this.addEntry(created);
    }
    for (let i = 0; i < firstMismatch; i++) {
      const existing = this.synced[i]!;
      const entry = entries[i]!;
      if (existing.kind === "turn" && entry.kind === "turn") {
        existing.pair.user.update(entry.turn);
        existing.pair.assistant.update(entry.turn);
      }
    }
    this.requestRender();
  }

  private createEntry(entry: ChatEntry): SyncedEntry {
    if (entry.kind === "info") {
      return { kind: "info", seq: entry.entry.seq, component: this.chatMessages.createInfoMessage(entry.entry) };
    }
    const pair: TurnPair = {
      user: this.chatMessages.createUserMessage(entry.turn.userPrompt),
      assistant: this.chatMessages.createAssistantMessage(entry.turn),
    };
    return { kind: "turn", seq: entry.turn.seq, pair };
  }

  private addEntry(synced: SyncedEntry): void {
    if (synced.kind === "info") {
      this.chatContainer.addChild(synced.component);
      return;
    }
    this.chatContainer.addChild(synced.pair.user);
    this.chatContainer.addChild(synced.pair.assistant);
  }

  private removeEntry(synced: SyncedEntry): void {
    if (synced.kind === "info") {
      this.chatContainer.removeChild(synced.component);
      return;
    }
    this.chatContainer.removeChild(synced.pair.user);
    this.chatContainer.removeChild(synced.pair.assistant);
  }
}

function mergeEntries(turns: ReadonlyArray<MessageTurn>, infos: ReadonlyArray<InfoEntry>): ChatEntry[] {
  const entries: ChatEntry[] = [
    ...turns.map((turn): ChatEntry => ({ kind: "turn", turn })),
    ...infos.map((entry): ChatEntry => ({ kind: "info", entry })),
  ];
  return entries.sort((a, b) => seqOf(a) - seqOf(b));
}

function seqOf(entry: ChatEntry): number {
  return entry.kind === "turn" ? entry.turn.seq : entry.entry.seq;
}

function sameEntry(synced: SyncedEntry, entry: ChatEntry): boolean {
  if (synced.kind !== entry.kind) return false;
  return entry.kind === "turn" ? synced.seq === entry.turn.seq : synced.seq === entry.entry.seq;
}

function turnsOf(agent: AgentUiState): MessageTurn[] {
  const turns = [...agent.history];
  if (agent.currentTurn !== null) turns.push(agent.currentTurn);
  return turns;
}
