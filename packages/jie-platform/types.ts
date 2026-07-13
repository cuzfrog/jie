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

export interface TeamInfo {
    readonly id: string;
    readonly leaderKey: string;
    readonly agents: ReadonlyArray<AgentInfo>;
}
