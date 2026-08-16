import { expectNumber } from "./row-decode";
import type { SqlBinding, Storage } from "./storage";

export interface SessionUsageTotals {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface SessionUsageStore {
  load(teamId: string, sessionId: string, agentKey: string): SessionUsageTotals | null;
  accumulate(teamId: string, sessionId: string, agentKey: string, delta: SessionUsageTotals): void;
}

export class SqliteSessionUsageStore implements SessionUsageStore {
  private readonly storage: Storage;

  constructor(storage: Storage) {
    this.storage = storage;
  }

  load(teamId: string, sessionId: string, agentKey: string): SessionUsageTotals | null {
    const rows = this.storage.query(
      "SELECT input_tokens, output_tokens FROM session_agent_usage WHERE team_id = ? AND session_id = ? AND agent_key = ?",
      [teamId, sessionId, agentKey],
    );
    if (rows.length === 0) return null;
    const [input, output] = rows[0]!;
    return { inputTokens: expectNumber(input), outputTokens: expectNumber(output) };
  }

  accumulate(teamId: string, sessionId: string, agentKey: string, delta: SessionUsageTotals): void {
    this.storage.exec(
      `INSERT INTO session_agent_usage (team_id, session_id, agent_key, input_tokens, output_tokens, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (team_id, session_id, agent_key) DO UPDATE SET
         input_tokens = input_tokens + excluded.input_tokens,
         output_tokens = output_tokens + excluded.output_tokens,
         updated_at = excluded.updated_at`,
      [teamId, sessionId, agentKey, delta.inputTokens, delta.outputTokens, new Date().toISOString()],
    );
  }
}
