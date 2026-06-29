export type AgentStatus = "idle" | "busy" | "err";
export type EffortLevel = "low" | "medium" | "high" | "max";

export interface ModelReference {
  readonly provider: string;
  readonly id: string;
  readonly effort: EffortLevel;
}

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
  readonly expanded: boolean;
}

export interface MessageBlock {
  readonly kind: "text" | "thinking";
  readonly text: string;
  readonly expanded: boolean;
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
  readonly lastIdleAt: number;
  readonly model: ModelReference | null;
  readonly history: MessageTurn[];
  readonly currentTurn: MessageTurn | null;
}

export interface TransientMessage {
  readonly text: string;
  readonly shownAt: number;
}

export interface ErrorBanner {
  readonly text: string;
  readonly raisedAt: number;
}

export interface TuiState {
  readonly teamId: string | null;
  readonly leaderAgentId: AgentId | null;
  readonly agents: ReadonlyMap<AgentId, AgentUiState>;
  readonly focusedAgentId: AgentId | null;
  readonly transientMessage: TransientMessage | null;
  readonly errorBanner: ErrorBanner | null;
  readonly showTeamRailPanel: boolean;
}

export const INITIAL_TUI_STATE:TuiState = Object.freeze({
  teamId: null,
  leaderAgentId: null,
  agents: new Map(),
  focusedAgentId: null,
  transientMessage: null,
  errorBanner: null,
  showTeamRailPanel: false,
} as const);
