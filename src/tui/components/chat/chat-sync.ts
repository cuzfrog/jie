import { Container } from "@earendil-works/pi-tui";
import { TuiState, type AgentId, type AgentUiState, type MessageTurn, type StateStore } from "../../state";
import type { AssistantMessageComponent, ChatMessages, CompactionMarkerComponent, UserMessageComponent } from "./chat-messages";
import type { TuiComponent } from "../..";

export interface ChatSync extends TuiComponent {}

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
  | { readonly kind: "compaction"; readonly marker: CompactionMarker; readonly component: CompactionMarkerComponent };

export class ChatSyncImpl implements ChatSync {
  private readonly stateStore: StateStore;
  private readonly chatMessages: ChatMessages;
  private readonly chatContainer: Container;
  private focusedAgentId: AgentId | null = null;
  private history: MessageTurn[] | null = null;
  private currentTurn: MessageTurn | null = null;
  private compactionMarker: AgentUiState["compactionMarker"] = null;
  private thinkingExpanded = false;
  private toolCardsExpanded = false;
  private readonly synced: SyncedEntry[] = [];

  constructor(stateStore: StateStore, chatMessages: ChatMessages) {
    this.stateStore = stateStore;
    this.chatMessages = chatMessages;
    this.chatContainer = new Container();
  }

  update(): boolean {
    const state = this.stateStore.getState();
    const focused = TuiState.getFocusedAgent(state);
    const agentId = focused === null ? null : focused.agentId;
    const history = focused?.history ?? null;
    const currentTurn = focused?.currentTurn ?? null;
    const compactionMarker = focused?.compactionMarker ?? null;
    const dirty =
      agentId !== this.focusedAgentId ||
      history !== this.history ||
      currentTurn !== this.currentTurn ||
      compactionMarker !== this.compactionMarker ||
      state.thinkingExpanded !== this.thinkingExpanded ||
      state.toolCardsExpanded !== this.toolCardsExpanded;
    if (!dirty) return false;
    const entriesDirty =
      agentId !== this.focusedAgentId ||
      history !== this.history ||
      currentTurn !== this.currentTurn ||
      compactionMarker !== this.compactionMarker;
    if (entriesDirty) this.sync(agentId, focused);
    this.focusedAgentId = agentId;
    this.history = history;
    this.currentTurn = currentTurn;
    this.compactionMarker = compactionMarker;
    this.thinkingExpanded = state.thinkingExpanded;
    this.toolCardsExpanded = state.toolCardsExpanded;
    return true;
  }

  render(width: number): string[] {
    return this.chatContainer.render(width);
  }

  invalidate(): void {
    this.chatContainer.invalidate();
  }

  private sync(agentId: AgentId | null, focused: AgentUiState | null): void {
    if (agentId !== this.focusedAgentId) {
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
      } else if (existing.kind === "compaction" && entry.kind === "compaction") {
        existing.component.update(entry.marker);
      }
    }
  }

  private createEntry(entry: ChatEntry): SyncedEntry {
    if (entry.kind === "compaction") {
      return { kind: "compaction", marker: entry.marker, component: this.chatMessages.createCompactionMarker(entry.marker) };
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
    if (agent.compactionMarker !== null) {
      const position = Math.max(0, Math.min(agent.compactionMarker.turnsBefore, entries.length));
      entries.splice(position, 0, { kind: "compaction", marker: agent.compactionMarker });
    }
  }
  return entries;
}

function sameEntry(synced: SyncedEntry, entry: ChatEntry): boolean {
  if (synced.kind === "turn" && entry.kind === "turn") return synced.seq === entry.turn.seq;
  if (synced.kind === "compaction" && entry.kind === "compaction") return synced.marker.turnsBefore === entry.marker.turnsBefore;
  return false;
}

function turnsOf(agent: AgentUiState): MessageTurn[] {
  const turns = [...agent.history];
  if (agent.currentTurn !== null) turns.push(agent.currentTurn);
  return turns;
}
