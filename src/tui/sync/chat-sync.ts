import { Container, type Component } from "@earendil-works/pi-tui";
import { TuiState, type AgentId, type AgentUiState, type MessageTurn, type StateStore } from "../state";
import type { AssistantMessageComponent, ChatMessages, UserMessageComponent } from "../components/chat";

export interface ChatSync {
  start(): void;
  stop(): void;
}

type CompactionMarker = NonNullable<AgentUiState["compactionMarker"]>;

interface TurnPair {
  readonly user: UserMessageComponent;
  readonly assistant: AssistantMessageComponent;
}

type ChatEntry =
  | { readonly kind: "turn"; readonly turn: MessageTurn }
  | { readonly kind: "compaction"; readonly marker: CompactionMarker };

type SyncedEntry =
  | { readonly kind: "turn"; readonly seq: number; readonly pair: TurnPair }
  | { readonly kind: "compaction"; readonly seq: number; readonly component: Component };

export class ChatSyncImpl implements ChatSync {
  private readonly stateStore: StateStore;
  private readonly chatMessages: ChatMessages;
  private readonly chatContainer: Container;
  private readonly requestRender: () => void;
  private syncedAgentId: AgentId | null = null;
  private readonly synced: SyncedEntry[] = [];
  private unsubscribe: (() => void) | null = null;

  constructor(stateStore: StateStore, chatMessages: ChatMessages, chatContainer: Container, requestRender: () => void) {
    this.stateStore = stateStore;
    this.chatMessages = chatMessages;
    this.chatContainer = chatContainer;
    this.requestRender = requestRender;
  }

  start(): void {
    this.unsubscribe = this.stateStore.subscribe(async (): Promise<void> => this.sync());
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
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
    const entries = mergeEntries(focused);
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
    if (entry.kind === "compaction") {
      return { kind: "compaction", seq: entry.marker.seq, component: this.chatMessages.createCompactionMarker(entry.marker) };
    }
    const pair: TurnPair = {
      user: this.chatMessages.createUserMessage(entry.turn.userPrompt),
      assistant: this.chatMessages.createAssistantMessage(entry.turn),
    };
    return { kind: "turn", seq: entry.turn.seq, pair };
  }

  private addEntry(synced: SyncedEntry): void {
    if (synced.kind === "turn") {
      this.chatContainer.addChild(synced.pair.user);
      this.chatContainer.addChild(synced.pair.assistant);
      return;
    }
    this.chatContainer.addChild(synced.component);
  }

  private removeEntry(synced: SyncedEntry): void {
    if (synced.kind === "turn") {
      this.chatContainer.removeChild(synced.pair.user);
      this.chatContainer.removeChild(synced.pair.assistant);
      return;
    }
    this.chatContainer.removeChild(synced.component);
  }
}

function mergeEntries(agent: AgentUiState | null): ChatEntry[] {
  const entries: ChatEntry[] = [];
  if (agent !== null) {
    for (const turn of turnsOf(agent)) entries.push({ kind: "turn", turn });
    if (agent.compactionMarker !== null) entries.push({ kind: "compaction", marker: agent.compactionMarker });
  }
  return entries.sort((a, b) => seqOf(a) - seqOf(b));
}

function seqOf(entry: ChatEntry): number {
  if (entry.kind === "turn") return entry.turn.seq;
  return entry.marker.seq;
}

function sameEntry(synced: SyncedEntry, entry: ChatEntry): boolean {
  if (synced.kind !== entry.kind) return false;
  if (entry.kind === "turn") return synced.seq === entry.turn.seq;
  return synced.seq === entry.marker.seq;
}

function turnsOf(agent: AgentUiState): MessageTurn[] {
  const turns = [...agent.history];
  if (agent.currentTurn !== null) turns.push(agent.currentTurn);
  return turns;
}
