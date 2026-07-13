import type { StopReason } from "@earendil-works/pi-ai";
import type { EffortLevel, ModelInfo } from "@cuzfrog/jie-platform";

export type AgentStatus = "idle" | "busy";
export { type EffortLevel };
export type ModelReference = ModelInfo;

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
}

export interface MessageBlock {
  readonly kind: "text" | "thinking";
  readonly text: string;
}

export interface MessageTurn {
  readonly userPrompt: string;
  readonly cards: MessageCard[];
  readonly blocks: MessageBlock[];
  readonly streamId: number | null;
}

export type AgentId = `${string}:${string}`;

export interface AgentUiState {
  readonly agentId: AgentId;
  readonly teamId: string;
  readonly agentKey: string;
  readonly role: string;
  readonly isLeader: boolean;
  readonly status: AgentStatus;
  readonly model: ModelReference | null;
  readonly queue: ReadonlyArray<string>;
  readonly history: MessageTurn[];
  readonly currentTurn: MessageTurn | null;
  readonly lastStopReason: StopReason | null;
  readonly contextTokensUsed: number;
}

export interface TuiState {
  readonly cwd: string | null;
  readonly gitBranch: string | null;
  readonly gitDirty: boolean;
  readonly teamId: string | null;
  readonly leaderAgentId: AgentId | null;
  readonly agents: ReadonlyMap<AgentId, AgentUiState>;
  readonly focusedAgentId: AgentId | null;
  readonly transientMessage: string | null;
  readonly errorBanner: string | null;
  readonly showTeamRailPanel: boolean;
  readonly thinkingExpanded: boolean;
  readonly toolCardsExpanded: boolean;
  readonly pendingQuit: boolean;
  readonly editorText: string;
  readonly chatScrollOffsets: ReadonlyMap<AgentId, number>;
}

function getFocusedAgent(state: TuiState): AgentUiState | null {
  if (state.focusedAgentId === null) return null;
  return state.agents.get(state.focusedAgentId) ?? null;
}

function isBusy(state: TuiState): boolean {
  for (const agent of state.agents.values()) {
    if (agent.status === "busy") return true;
  }
  return false;
}

function shouldShowErrorBanner(state: TuiState): boolean {
  return state.errorBanner !== null && state.errorBanner !== "";
}

export const TuiState = {
  getFocusedAgent,
  isBusy,
  shouldShowErrorBanner,
} as const;
