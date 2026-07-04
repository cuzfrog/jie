import type { AgentIdentity } from "./core";

export interface ModelIdentity {
    readonly provider: string;
    readonly modelId: string;
}

export interface TeamIdentity {
    readonly id: string;
    readonly agents: ReadonlyArray<AgentIdentity>;
}
