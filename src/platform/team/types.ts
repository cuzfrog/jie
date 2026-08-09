export interface AgentSoul {
  readonly role: string;
  readonly model: string;
  readonly systemPrompt: string;
  readonly tools: ReadonlyArray<string>;
  readonly subscribe: ReadonlyArray<string>;
  readonly skills: ReadonlyArray<string>;
  readonly targetContextWindowSize?: number;
}

export interface TeamBlueprint {
  readonly id: string;
  readonly roles: ReadonlyArray<AgentSoul>;
  readonly leaderRole: string | null;
}
export type TeamBlueprintLocation = "builtin" | "project" | "user" | null;

export const BUILTIN_DEFAULT_SOLO_TEAM_ID = "default-solo";
