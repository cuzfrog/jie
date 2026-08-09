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

export type KanbanStatus = "pending" | "in_progress" | "in_review" | "completed";

export interface KanbanCard {
    readonly id: string;
    readonly content: string;
    readonly status: KanbanStatus;
    readonly scope?: "team" | "session";
    readonly sessionId?: string;
    readonly active_form?: string;
    readonly description?: string;
    readonly completedAt?: string;
    readonly externalRef?: string;
}

export interface KanbanCardWrite {
    readonly content: string;
    readonly status: KanbanStatus;
    readonly scope?: "team" | "session";
    readonly active_form?: string;
    readonly description?: string;
    readonly externalRef?: string;
}


