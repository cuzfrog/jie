
export class JiePlatformError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "JiePlatformError";
  }
}

export interface TurnRecord {
  team_id: string;
  session_id: string;
  agent_key: string;
  seq: number;
  role: string;
  content: string;
  compacted: boolean;
  created_at: string;
}
