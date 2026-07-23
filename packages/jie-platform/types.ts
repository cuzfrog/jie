import type { AgentMessage } from "@earendil-works/pi-agent-core";

export type EffortLevel = "off" | "low" | "medium" | "high" | "max";

export interface ModelInfo {
    readonly provider: string;
    readonly id: string;
    readonly effort: EffortLevel;
    readonly contextWindow: number | null;
}

export interface AgentInfo {
    readonly teamId: string;
    readonly role: string;
    readonly agentKey: string;
    readonly isLeader: boolean;
    readonly model: ModelInfo | null;
}

export interface AgentHistory {
    readonly agentKey: string;
    readonly messages: ReadonlyArray<AgentMessage>;
}

export interface TeamInfo {
    readonly id: string;
    readonly leaderKey: string;
    readonly agents: ReadonlyArray<AgentInfo>;
    readonly history: ReadonlyArray<AgentHistory>;
}

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TodoItem {
    readonly content: string;
    readonly status: TodoStatus;
    readonly active_form?: string;
}

export interface TodoDetailsPayload {
    readonly kind: "todos";
    readonly todos: ReadonlyArray<TodoItem>;
}

export function isTodoDetails(value: unknown): value is TodoDetailsPayload {
    if (typeof value !== "object" || value === null) return false;
    if (!("kind" in value) || value.kind !== "todos") return false;
    if (!("todos" in value) || !Array.isArray(value.todos)) return false;
    return value.todos.every(isTodoItem);
}

function isTodoItem(value: unknown): value is TodoItem {
    if (typeof value !== "object" || value === null) return false;
    if (!("content" in value) || typeof value.content !== "string") return false;
    if (!("status" in value)) return false;
    const status = value.status;
    if (status !== "pending" && status !== "in_progress" && status !== "completed") return false;
    if ("active_form" in value && value.active_form !== undefined && typeof value.active_form !== "string") return false;
    return true;
}
