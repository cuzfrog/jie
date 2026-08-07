import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { UserMessage } from "@earendil-works/pi-ai";

export const EFFORT_LEVELS = ["off", "low", "medium", "high", "max"] as const;

export type EffortLevel = (typeof EFFORT_LEVELS)[number];

export function isEffortLevel(value: unknown): value is EffortLevel {
    return typeof value === "string" && (EFFORT_LEVELS as readonly string[]).includes(value);
}

export interface ModelInfo {
    readonly provider: string;
    readonly id: string;
    readonly effort: EffortLevel;
    readonly contextWindow: number | null;
}

export interface SkillInfo {
    readonly name: string;
    readonly description: string;
    readonly argumentHint: string | null;
}

export interface AgentInfo {
    readonly teamId: string;
    readonly role: string;
    readonly agentKey: string;
    readonly isLeader: boolean;
    readonly tools: ReadonlyArray<string>;
    readonly subscribe: ReadonlyArray<string>;
    readonly skills: ReadonlyArray<SkillInfo>;
    readonly model: ModelInfo | null;
}

export interface AgentHistory {
    readonly agentKey: string;
    readonly messages: ReadonlyArray<AgentMessage>;
}

export interface UserIngressMessage extends UserMessage {
    readonly displayText?: string;
}

export interface TeamInfo {
    readonly id: string;
    readonly leaderKey: string;
    readonly sessionName: string | null;
    readonly currentSessionId: string | null;
    readonly agents: ReadonlyArray<AgentInfo>;
    readonly history: ReadonlyArray<AgentHistory>;
    readonly kanbanCards: ReadonlyArray<KanbanCard>;
}

export interface TaskTransitionRule {
    readonly topic: string;
    readonly role: string;
    readonly fromPhases: ReadonlyArray<string> | "any";
    readonly toPhase: string;
    readonly iteration: "reset" | "increment" | null;
}

export interface WriteGateRule {
    readonly pattern: string;
    readonly roles: ReadonlyArray<string>;
}

export interface TaskLifecycle {
    readonly maxIterations: number;
    readonly permanentPhases: ReadonlyArray<string>;
    readonly transitions: ReadonlyArray<TaskTransitionRule>;
    readonly writeGates: ReadonlyArray<WriteGateRule>;
}

export type KanbanStatus = "pending" | "in_progress" | "completed";

export interface KanbanCard {
    readonly id: string;
    readonly content: string;
    readonly status: KanbanStatus;
    readonly active_form?: string;
    readonly description?: string;
}

export interface KanbanCardWrite {
    readonly content: string;
    readonly status: KanbanStatus;
    readonly active_form?: string;
    readonly description?: string;
}

export interface EditResultDetails {
    readonly kind: "diff";
    readonly path: string;
    readonly replacementsCount: number;
    readonly beforeBytes: number;
    readonly afterBytes: number;
    readonly diff: string | null;
}

export interface WriteFileResultDetails {
    readonly kind: "diff";
    readonly path: string;
    readonly bytesWritten: number;
    readonly createdAt: string;
    readonly diff: string | null;
}

export interface KanbanDetails {
    readonly kind: "kanban";
    readonly cards: ReadonlyArray<KanbanCard>;
}

export interface BashResultDetails {
    readonly exitCode: number;
    readonly truncated: { readonly stdout: boolean; readonly stderr: boolean };
}

export interface WebSearchResultDetails {
    readonly results: ReadonlyArray<{ readonly title: string; readonly url: string; readonly snippet: string }>;
    readonly query: string;
    readonly maxResults: number;
}

export interface ReadFileResultDetails {
    readonly truncated: { readonly content: boolean };
}

export interface ReadArtifactResultDetails {
    readonly key: string;
    readonly content: string;
    readonly created_at: string;
}

export interface WriteArtifactResultDetails {
    readonly key: string;
    readonly created_at: string;
}

export interface NotifyResultDetails {
    readonly topic: string;
    readonly task_id?: string;
    readonly phase?: string;
    readonly iteration?: number;
}

export interface WebFetchResultDetails {
    readonly status: number;
    readonly truncated: boolean;
}

export type ToolResultDetails =
    | EditResultDetails
    | WriteFileResultDetails
    | KanbanDetails
    | BashResultDetails
    | WebSearchResultDetails
    | ReadFileResultDetails
    | ReadArtifactResultDetails
    | WriteArtifactResultDetails
    | NotifyResultDetails
    | WebFetchResultDetails;

export function isDiffDetails(details: ToolResultDetails | null | undefined): details is EditResultDetails | WriteFileResultDetails {
    return typeof details === "object" && details !== null && "kind" in details && details.kind === "diff"
        && typeof details.path === "string" && (details.diff === null || typeof details.diff === "string");
}
