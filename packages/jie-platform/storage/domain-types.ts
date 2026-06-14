/** Platform-level typed error. Domain stores throw this when validation
 *  fails (e.g. an invalid artifact key). The `code` is the
 *  machine-readable identifier; `message` is the human-readable form
 *  (which the tool layer surfaces to the LLM and to the user). */
export class JiePlatformError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "JiePlatformError";
  }
}

/** A row in the `memory_turns` table. The platform owns the row shape;
 *  `content` holds the JSON-serialized `AgentMessage` from pi-agent. */
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