import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { UserMessage } from "@earendil-works/pi-ai";

declare module "@earendil-works/pi-ai" {
    interface ThinkingContent {
        readonly thinkingDurationMs?: number;
    }
}

export const EFFORT_LEVELS = ["off", "low", "medium", "high", "max"] as const;

export type EffortLevel = (typeof EFFORT_LEVELS)[number];

export function isEffortLevel(value: unknown): value is EffortLevel {
    return typeof value === "string" && EFFORT_LEVELS.some((level) => level === value);
}

export const MODEL_ALIASES = ["large", "medium", "small"] as const;

export type ModelAlias = (typeof MODEL_ALIASES)[number];

export function isModelAlias(value: unknown): value is ModelAlias {
    return typeof value === "string" && MODEL_ALIASES.some((alias) => alias === value);
}

export function parseModelRef(value: string): { readonly provider: string; readonly modelId: string } | null {
    const slash = value.indexOf("/");
    if (slash === -1) return null;
    const provider = value.slice(0, slash);
    const modelId = value.slice(slash + 1);
    return provider === "" || modelId === "" ? null : { provider, modelId };
}

const MODEL_EFFORT_SUFFIX_PATTERN = /^(.*?)\s*\(\s*([^()]*)\s*\)\s*$/;

export function parseModelWithEffort(value: string): { readonly model: string; readonly effort: EffortLevel | undefined } | null {
    const trimmed = value.trim();
    if (trimmed === "") return { model: "", effort: undefined };
    if (trimmed.includes("(") || trimmed.includes(")")) {
        const match = trimmed.match(MODEL_EFFORT_SUFFIX_PATTERN);
        if (match === null) return null;
        const base = match[1]!.trim();
        const effortToken = match[2]!.trim();
        if (base === "" || base.includes("(") || base.includes(")")) return null;
        if (effortToken === "") return null;
        if (!isEffortLevel(effortToken)) return null;
        return { model: base, effort: effortToken };
    }
    return { model: trimmed, effort: undefined };
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
    readonly ephemeral?: boolean;
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
    readonly description?: string;
}

export type KanbanStatus = "pending" | "in_progress" | "in_review" | "completed";

export interface KanbanTodo {
    readonly text: string;
    readonly done: boolean;
}

export interface KanbanTodoWrite {
    readonly text: string;
    readonly done?: boolean;
}

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
    readonly assignee?: string;
    readonly todos?: ReadonlyArray<KanbanTodo>;
}

export interface KanbanCardWrite {
    readonly content: string;
    readonly status: KanbanStatus;
    readonly scope?: "team" | "session";
    readonly active_form?: string;
    readonly description?: string;
    readonly externalRef?: string;
    readonly assignee?: string;
    readonly todos?: ReadonlyArray<KanbanTodoWrite>;
}

export interface KanbanCardPatch {
    readonly status?: KanbanStatus;
    readonly active_form?: string;
    readonly description?: string;
    readonly externalRef?: string;
    readonly assignee?: string;
    readonly todos?: ReadonlyArray<KanbanTodoWrite>;
}

export interface CallAgentRequest {
    readonly teamId: string;
    readonly sessionId: string;
    readonly callerAgentKey: string;
    readonly agent: string;
    readonly prompt: string;
    readonly reset?: boolean;
}

export interface CallAgentTicket {
    readonly agentKey: string;
    readonly callbackTopic: string;
    readonly callId: string;
    readonly queued: boolean;
}

export interface CallAgentResultDetails {
    readonly kind: "call-agent";
    readonly agentKey: string;
    readonly callbackTopic: string;
    readonly callId: string;
    readonly queued: boolean;
}

export interface AgentDispatcher {
    call(request: CallAgentRequest): CallAgentTicket;
}


