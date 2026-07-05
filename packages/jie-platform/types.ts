export interface ModelIdentity {
    readonly provider: string;
    readonly modelId: string;
}

export interface AgentIdentity {
  readonly teamId: string;
  readonly role: string;
  readonly agentKey: string;
  readonly isLeader: boolean;
}

export interface TeamIdentity {
    readonly id: string;
    readonly agents: ReadonlyArray<AgentIdentity>;
}
