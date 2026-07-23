import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Storage } from "./storage";

export interface SessionSummary {
  readonly sessionId: string;
  readonly messageCount: number;
  readonly lastActivity: string;
}

export interface MemoryManager {
  persist(
    message: AgentMessage,
    agentKey: string,
    sessionId: string,
    teamId: string,
  ): void;

  compact(
    compactedSeqRange: [number, number],
    summary: AgentMessage,
    agentKey: string,
    sessionId: string,
    teamId: string,
  ): void;

  restore(
    agentKey: string,
    sessionId: string,
    teamId: string,
  ): Promise<AgentMessage[]>;

  hasSession(teamId: string, sessionId: string): boolean;

  listSessions(teamId: string): ReadonlyArray<SessionSummary>;
}

export class SqliteMemoryManager implements MemoryManager {
  private readonly storage: Storage;

  constructor(storage: Storage) {
    this.storage = storage;
  }

  persist(
    message: AgentMessage,
    agentKey: string,
    sessionId: string,
    teamId: string,
  ): void {
    const role = (message as { role: string }).role;
    const content = JSON.stringify(message);
    const createdAt = new Date().toISOString();
    const rows = this.storage.query(
      `SELECT COALESCE(MAX(seq), 0) + 1 FROM memory_turns
       WHERE team_id = ? AND agent_key = ? AND session_id = ?`,
      [teamId, agentKey, sessionId],
    );
    const seq = rows[0]![0] as number;
    this.storage.exec(
      `INSERT OR REPLACE INTO memory_turns
         (team_id, session_id, agent_key, seq, role, content, compacted, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      [teamId, sessionId, agentKey, seq, role, content, createdAt],
    );
  }

  compact(
    compactedSeqRange: [number, number],
    summary: AgentMessage,
    agentKey: string,
    sessionId: string,
    teamId: string,
  ): void {
    this.storage.transaction((s) => {
      const rows = s.query(
        `SELECT COALESCE(MAX(seq), 0) + 1 FROM memory_turns
         WHERE team_id = ? AND agent_key = ? AND session_id = ?`,
        [teamId, agentKey, sessionId],
      );
      const summarySeq = rows[0]![0] as number;
      const summaryContent = JSON.stringify(summary);
      const summaryRole = (summary as { role: string }).role;
      const summaryCreatedAt = new Date().toISOString();
      s.exec(
        `INSERT INTO memory_turns
           (team_id, session_id, agent_key, seq, role, content, compacted, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
        [
          teamId,
          sessionId,
          agentKey,
          summarySeq,
          summaryRole,
          summaryContent,
          summaryCreatedAt,
        ],
      );
      s.exec(
        `UPDATE memory_turns SET compacted = 1
         WHERE team_id = ? AND agent_key = ? AND session_id = ?
           AND seq BETWEEN ? AND ?`,
        [teamId, agentKey, sessionId, compactedSeqRange[0], compactedSeqRange[1]],
      );
    });
  }

  async restore(
    agentKey: string,
    sessionId: string,
    teamId: string,
  ): Promise<AgentMessage[]> {
    const rows = this.storage.query(
      `SELECT team_id, session_id, agent_key, seq, role, content, compacted, created_at
       FROM memory_turns
       WHERE team_id = ? AND agent_key = ? AND session_id = ? AND compacted = 0
       ORDER BY seq`,
      [teamId, agentKey, sessionId],
    );
    return rows.map((row) => JSON.parse(row[5] as string) as AgentMessage);
  }

  hasSession(teamId: string, sessionId: string): boolean {
    const rows = this.storage.query(
      `SELECT 1 FROM memory_turns
       WHERE team_id = ? AND session_id = ? LIMIT 1`,
      [teamId, sessionId],
    );
    return rows.length > 0;
  }

  listSessions(teamId: string): ReadonlyArray<SessionSummary> {
    const rows = this.storage.query(
      `SELECT session_id, COUNT(*) AS cnt, MAX(created_at) AS last_activity
       FROM memory_turns
       WHERE team_id = ?
       GROUP BY session_id
       ORDER BY last_activity DESC`,
      [teamId],
    );
    return rows.map((row) => ({
      sessionId: row[0] as string,
      messageCount: row[1] as number,
      lastActivity: row[2] as string,
    }));
  }
}
