import type { StopReason } from "@earendil-works/pi-ai";
import type { CommandResult, EffortLevel, ModelInfo, SkillInfo } from "@cuzfrog/jie-platform";
import type { KanbanCard } from "../kanban";

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
  readonly details?: unknown;
}

export interface MessageBlock {
  readonly kind: "text" | "thinking";
  readonly text: string;
  readonly durationMs?: number;
}

export interface MessageTurn {
  readonly userPrompt: string;
  readonly cards: MessageCard[];
  readonly blocks: MessageBlock[];
  readonly streamId: number | null;
  readonly seq: number;
}

export interface InfoEntry {
  readonly seq: number;
  readonly kind: "help";
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
  readonly queue: ReadonlyArray<{ readonly text: string; readonly source: "user" | "peer" }>;
  readonly history: MessageTurn[];
  readonly currentTurn: MessageTurn | null;
  readonly lastStopReason: StopReason | null;
  readonly contextTokensUsed: number;
  readonly lastReportedTotalTokens: number | null;
  readonly cards: ReadonlyArray<KanbanCard>;
}

export interface TuiState {
  readonly cwd: string | null;
  readonly gitBranch: string | null;
  readonly gitDirty: boolean;
  readonly version: string;
  readonly installedTeams: InstalledTeams | null;
  readonly teamId: string | null;
  readonly sessionName: string | null;
  readonly leaderAgentId: AgentId | null;
  readonly agents: ReadonlyMap<AgentId, AgentUiState>;
  readonly focusedAgentId: AgentId | null;
  readonly teamCursorAgentId: AgentId | null;
  readonly interruptedAgentId: AgentId | null;
  readonly infoEntries: ReadonlyArray<InfoEntry>;
  readonly nextEntrySeq: number;
  readonly transientMessage: string | null;
  readonly errorBanner: string | null;
  readonly thinkingExpanded: boolean;
  readonly toolCardsExpanded: boolean;
  readonly teamPanelVisible: boolean;
  readonly kanbanPanelVisible: boolean;
  readonly pendingQuit: boolean;
  readonly editorText: string;
  readonly editorCursorAtStart: boolean;
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
  if (state.infoEntries.length > 0) return true;
  for (const agent of state.agents.values()) {
    if (agent.history.length > 0 || agent.currentTurn !== null) return true;
  }
  return false;
}

export const TuiState = {
  getFocusedAgent,
  rosterOrder,
  isBusy,
  workingKind,
  isInterrupted,
  shouldShowErrorBanner,
  hasChatContent,
} as const;
