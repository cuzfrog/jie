import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Storage } from "./storage";

export interface SessionSummary {
  readonly sessionId: string;
  readonly messageCount: number;
  readonly lastActivity: string;
  readonly name?: string;
}

export interface MemoryManager {
  persist(
    message: AgentMessage,
    agentKey: string,
    sessionId: string,
    teamId: string,
  ): void;

  compact(
    compactedCount: number,
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

  sessionName(sessionId: string): string | null;

  renameSession(sessionId: string, name: string): void;
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
    compactedCount: number,
    summary: AgentMessage,
    agentKey: string,
    sessionId: string,
    teamId: string,
  ): void {
    this.storage.transaction((s) => {
      s.exec(
        `UPDATE memory_turns SET compacted = 1
         WHERE team_id = ? AND agent_key = ? AND session_id = ? AND compacted = 0
           AND seq IN (
             SELECT seq FROM memory_turns
             WHERE team_id = ? AND agent_key = ? AND session_id = ? AND compacted = 0
             ORDER BY seq LIMIT ?)`,
        [teamId, agentKey, sessionId, teamId, agentKey, sessionId, compactedCount],
      );
      const tail = s.query(
        `SELECT seq, role, content, created_at FROM memory_turns
         WHERE team_id = ? AND agent_key = ? AND session_id = ? AND compacted = 0
         ORDER BY seq`,
        [teamId, agentKey, sessionId],
      );
      s.exec(
        `DELETE FROM memory_turns
         WHERE team_id = ? AND agent_key = ? AND session_id = ? AND compacted = 0`,
        [teamId, agentKey, sessionId],
      );
      const prefix = s.query(
        `SELECT COALESCE(MAX(seq), 0) FROM memory_turns
         WHERE team_id = ? AND agent_key = ? AND session_id = ?`,
        [teamId, agentKey, sessionId],
      );
      let nextSeq = (prefix[0]![0] as number) + 1;
      s.exec(
        `INSERT INTO memory_turns
           (team_id, session_id, agent_key, seq, role, content, compacted, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
        [teamId, sessionId, agentKey, nextSeq, (summary as { role: string }).role, JSON.stringify(summary), new Date().toISOString()],
      );
      for (const row of tail) {
        nextSeq += 1;
        s.exec(
          `INSERT INTO memory_turns
             (team_id, session_id, agent_key, seq, role, content, compacted, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
          [teamId, sessionId, agentKey, nextSeq, row[1] as string, row[2] as string, row[3] as string],
        );
      }
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
      `SELECT t.session_id, COUNT(CASE WHEN t.compacted = 0 THEN 1 END) AS cnt, MAX(t.created_at) AS last_activity, m.name
       FROM memory_turns t
       LEFT JOIN session_metadata m ON m.session_id = t.session_id
       WHERE t.team_id = ?
       GROUP BY t.session_id
       ORDER BY last_activity DESC`,
      [teamId],
    );
    return rows.map((row) => ({
      sessionId: row[0] as string,
      messageCount: row[1] as number,
      lastActivity: row[2] as string,
      name: (row[3] as string | null) ?? undefined,
    }));
  }

  sessionName(sessionId: string): string | null {
    const rows = this.storage.query(
      `SELECT name FROM session_metadata WHERE session_id = ?`,
      [sessionId],
    );
    return (rows[0]?.[0] as string | undefined) ?? null;
  }

  renameSession(sessionId: string, name: string): void {
    const updatedAt = new Date().toISOString();
    this.storage.exec(
      `INSERT INTO session_metadata (session_id, name, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at`,
      [sessionId, name, updatedAt],
    );
  }
}
