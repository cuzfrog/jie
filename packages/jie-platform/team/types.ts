
export interface AgentSoul {

  role: string;

  model: string;

  system_prompt: string;

  tools: string[];

  subscribe: string[];

  subscriptions: string[];
}

export interface Team {
  id: string;

  roles: AgentSoul[];

  leaderRole: string | null;
}