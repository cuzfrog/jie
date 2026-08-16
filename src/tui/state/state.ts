import type { StopReason } from "@earendil-works/pi-ai";
import type { CommandResult, EffortLevel, KanbanCard, KanbanStatus, ModelInfo, QuestionItem, SkillInfo, ToolResultDetails } from "../../platform";

export type AgentStatus = "idle" | "busy";
export { type EffortLevel };
export type ModelReference = ModelInfo;

type InstalledTeams = CommandResult<"getTeamInfo">["installed"];

export interface MessageCard {
  readonly kind: "toolCall" | "toolResult";
  readonly callId: string;
  readonly name: string;
  readonly input?: string;
  readonly output?: string | null;
  readonly inputTruncated?: boolean;
  readonly outputTruncated?: boolean;
  readonly durationMs?: number;
  readonly error?: string | null;
  readonly details?: ToolResultDetails | null;
}

export interface MessageBlock {
  readonly kind: "text" | "thinking";
  readonly text: string;
  readonly durationMs?: number;
}

export interface MessageTurn {
  readonly userPrompt: string;
  readonly entries: (MessageBlock | MessageCard)[];
  readonly streamId: number | null;
  readonly seq: number;
}

export type AgentId = `${string}:${string}`;

export interface AgentUiState {
  readonly agentId: AgentId;
  readonly teamId: string;
  readonly agentKey: string;
  readonly role: string;
  readonly isLeader: boolean;
  readonly tools: ReadonlyArray<string>;
  readonly subscribe: ReadonlyArray<string>;
  readonly skills: ReadonlyArray<SkillInfo>;
  readonly status: AgentStatus;
  readonly model: ModelReference | null;
  readonly queue: ReadonlyArray<{ readonly text: string; readonly source: "user" | "peer"; readonly chained: boolean }>;
  readonly history: MessageTurn[];
  readonly currentTurn: MessageTurn | null;
  readonly compactionMarker: { readonly turnsBefore: number; readonly summary: string; readonly tokensBefore: number } | null;
  readonly compactionInProgress: boolean;
  readonly lastStopReason: StopReason | null;
  readonly contextTokensUsed: number;
  readonly lastReportedTotalTokens: number | null;
  readonly sessionInputTokens: number;
  readonly sessionOutputTokens: number;
  readonly inflightInputTokens: number;
  readonly inflightOutputTokens: number;
}

export type KanbanEditField = "content" | "description" | { readonly todoIndex: number };

interface QuestionState {
  readonly requestId: string;
  readonly agentId: AgentId;
  readonly questions: ReadonlyArray<QuestionItem>;
  readonly questionIndex: number;
  readonly optionCursor: number;
  readonly selections: ReadonlyArray<ReadonlyArray<number>>;
  readonly otherText: ReadonlyArray<string | null>;
  readonly editingOther: boolean;
}

interface KanbanState {
  readonly view: "hidden" | "list" | "panel";
  readonly board: ReadonlyArray<KanbanCard>;
  readonly cursor: string | null;
  readonly expanded: boolean;
  readonly edit: string | null;
  readonly editField: KanbanEditField;
}

export interface TuiState {
  readonly cwd: string | null;
  readonly gitBranch: string | null;
  readonly gitDirty: boolean;
  readonly version: string;
  readonly installedTeams: InstalledTeams | null;
  readonly teamId: string | null;
  readonly sessionId: string | null;
  readonly sessionName: string | null;
  readonly leaderAgentId: AgentId | null;
  readonly agents: ReadonlyMap<AgentId, AgentUiState>;
  readonly focusedAgentId: AgentId | null;
  readonly teamCursorAgentId: AgentId | null;
  readonly interruptedAgentId: AgentId | null;
  readonly nextEntrySeq: number;
  readonly transientMessage: string | null;
  readonly transientSetAt: number | null;
  readonly errorBanner: string | null;
  readonly thinkingExpanded: boolean;
  readonly toolCardsExpanded: boolean;
  readonly teamPanelVisible: boolean;
  readonly helpPanelVisible: boolean;
  readonly kanban: KanbanState;
  readonly question: QuestionState | null;
  readonly pendingQuit: boolean;
  readonly editorText: string;
  readonly editorCursorAtStart: boolean;
  readonly terminalFocused: boolean;
  readonly requireUserAttention: boolean;
}

function getFocusedAgent(state: TuiState): AgentUiState | null {
  if (state.focusedAgentId === null) return null;
  return state.agents.get(state.focusedAgentId) ?? null;
}

function rosterOrder(state: TuiState): AgentUiState[] {
  const agents = [...state.agents.values()];
  const leader = agents.find((agent) => agent.agentId === state.leaderAgentId);
  if (leader === undefined) return agents;
  return [leader, ...agents.filter((agent) => agent !== leader)];
}

function isBusy(state: TuiState): boolean {
  for (const agent of state.agents.values()) {
    if (agent.status === "busy") return true;
  }
  return false;
}

function workingKind(state: TuiState): "focused" | "team" | "none" {
  const focused = getFocusedAgent(state);
  if (focused !== null && focused.status === "busy") return "focused";
  return isBusy(state) ? "team" : "none";
}

function isInterrupted(state: TuiState): boolean {
  return state.interruptedAgentId !== null;
}

function shouldShowErrorBanner(state: TuiState): boolean {
  return state.errorBanner !== null && state.errorBanner !== "";
}

function hasChatContent(state: TuiState): boolean {
  for (const agent of state.agents.values()) {
    if (agent.history.length > 0 || agent.currentTurn !== null) return true;
  }
  return false;
}

function isIdleAttentionNeeded(state: TuiState): boolean {
  return state.requireUserAttention;
}

function isAttentionStopReason(reason: StopReason | null): boolean {
  return reason === "stop" || reason === "error" || reason === "length";
}

function isUserInputNeeded(state: TuiState): boolean {
  return state.question !== null;
}

function anyAgentThinking(state: TuiState): boolean {
  for (const agent of state.agents.values()) {
    const turn = agent.currentTurn;
    if (turn === null) continue;
    for (const entry of turn.entries) {
      if (entry.kind === "thinking" && entry.text !== "" && entry.durationMs === undefined) return true;
    }
  }
  return false;
}

const KANBAN_VISIBLE_ROWS = 8;

function kanbanVisibleCards(state: TuiState): ReadonlyArray<KanbanCard> {
  const counts = new Map<KanbanStatus, number>();
  return state.kanban.board.filter((card) => {
    const count = counts.get(card.status) ?? 0;
    if (count >= KANBAN_VISIBLE_ROWS) return false;
    counts.set(card.status, count + 1);
    return true;
  });
}

function closeOtherPanels(state: TuiState): TuiState {
  if (!state.teamPanelVisible && !state.helpPanelVisible && state.kanban.view === "hidden") return state;
  return {
    ...state,
    teamPanelVisible: false,
    helpPanelVisible: false,
    teamCursorAgentId: null,
    kanban: { ...state.kanban, view: "hidden", expanded: false, edit: null, editField: "content" },
  };
}

export const TuiState = {
  getFocusedAgent,
  rosterOrder,
  isBusy,
  workingKind,
  isInterrupted,
  shouldShowErrorBanner,
  hasChatContent,
  anyAgentThinking,
  isIdleAttentionNeeded,
  isUserInputNeeded,
  isAttentionStopReason,
  kanbanVisibleCards,
  closeOtherPanels,
} as const;
