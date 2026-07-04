import type { AgentIdentity } from "./core";

export interface ModelIdentity {
    readonly provider: string;
    readonly id: string;
}

export interface TeamIdentity {
    readonly id: string;
    readonly agents: ReadonlyArray<AgentIdentity>;
}
