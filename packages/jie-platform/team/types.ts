export interface AgentSoul {
  readonly role: string;
  readonly model: string;
  readonly systemPrompt: string;
  readonly tools: ReadonlyArray<string>;
  readonly subscribe: ReadonlyArray<string>;
}

export interface TeamBlueprint {
  readonly id: string;
  readonly roles: ReadonlyArray<AgentSoul>;
  readonly leaderRole: string | null;
}
