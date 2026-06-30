
export interface AgentSoul {
  role: string;
  model: string;
  systemPrompt: string;
  tools: string[];
  subscribe: string[];
  subscriptions: string[];
}

export interface Team {
  id: string;
  roles: AgentSoul[];
  leaderRole: string | null;
}
