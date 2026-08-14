import type { EffortLevel } from "../types";

export interface AgentSoul {
  readonly role: string;
  readonly model: string;
  readonly effort?: EffortLevel;
  readonly systemPrompt: string;
  readonly tools: ReadonlyArray<string>;
  readonly subscribe: ReadonlyArray<string>;
  readonly skills: ReadonlyArray<string>;
  readonly replicas: number;
  readonly targetContextWindowSize?: number;
}

export interface TeamBlueprint {
  readonly id: string;
  readonly roles: ReadonlyArray<AgentSoul>;
  readonly leaderRole: string | null;
  readonly additionalAgentRefs: ReadonlyArray<string>;
  readonly description?: string;
}
export type TeamBlueprintLocation = "builtin" | "project" | "user" | null;

export const BUILTIN_SETUP_ASSISTANT_TEAM_ID = "setup-assistant";
