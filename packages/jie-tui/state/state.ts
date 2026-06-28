export type AgentStatus = "idle" | "busy" | "err";
export type EffortLevel = "low" | "medium" | "high" | "max";

export interface ModelRef {
  provider: string;
  id: string;
  effort: EffortLevel;
}

export interface Card {
  kind: "toolCall" | "toolResult";
  callId: string;
  name: string;
  input?: string;
  output?: string | null;
  inputTruncated?: boolean;
  outputTruncated?: boolean;
  durationMs?: number;
  error?: string | null;
  expanded: boolean;
}

export interface Block {
  kind: "text" | "thinking";
  text: string;
  expanded: boolean;
}

export interface Turn {
  userPrompt: string;
  cards: Card[];
  blocks: Block[];
  streamId: number | null;
}

export type AgentId = `${string}:${string}`;

export interface AgentUiState {
  agentId: AgentId;
  teamId: string;
  agentKey: string;
  role: string;
  isLeader: boolean;
  status: AgentStatus;
  lastIdleAt: number;
  model: ModelRef | null;
  history: Turn[];
  currentTurn: Turn | null;
}

export interface TransientMessage {
  text: string;
  shownAt: number;
}

export interface ErrorBanner {
  text: string;
  raisedAt: number;
}

export interface TuiState {
  teamId: string | null;
  leaderAgentId: AgentId | null;
  agents: Map<AgentId, AgentUiState>;
  focusedAgentId: AgentId | null;
  queue: string[];
  transientMessage: TransientMessage | null;
  errorBanner: ErrorBanner | null;
  showRail: boolean;
}

export const composeAgentId = (teamId: string, agentKey: string): AgentId => `${teamId}:${agentKey}` as AgentId;

export const emptyAgent = (agentId: AgentId, teamId: string, agentKey: string, role: string, isLeader: boolean): AgentUiState => ({
  agentId,
  teamId,
  agentKey,
  role,
  isLeader,
  status: "idle",
  lastIdleAt: 0,
  model: null,
  history: [],
  currentTurn: null,
});

export const freshTurn = (userPrompt: string): Turn => ({
  userPrompt,
  cards: [],
  blocks: [],
  streamId: null,
});

export const initialState = (): TuiState => ({
  teamId: null,
  leaderAgentId: null,
  agents: new Map(),
  focusedAgentId: null,
  queue: [],
  transientMessage: null,
  errorBanner: null,
  showRail: false,
});