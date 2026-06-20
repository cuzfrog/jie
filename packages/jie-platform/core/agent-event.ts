
export interface AgentEvent<T extends string = string> {
  version: 1;
  team_id: string;
  event_type: T;
  agent_role?: string;
  agent_key?: string;
  timestamp: string;
  payload: Record<string, unknown>;
}