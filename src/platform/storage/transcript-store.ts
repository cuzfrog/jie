import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { expectNumber, expectOptionalString, expectString } from "./row-decode";
import type { Storage } from "./storage";

export interface SessionSummary {
  readonly sessionId: string;
  readonly messageCount: number;
  readonly lastActivity: string;
  readonly name?: string;
}

export interface TranscriptStore {
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

  listAgentKeys(teamId: string, sessionId: string): ReadonlyArray<string>;

  remove(agentKey: string, sessionId: string, teamId: string): void;

  sessionName(sessionId: string): string | null;

  renameSession(sessionId: string, name: string): void;
}

export class SqliteTranscriptStore implements TranscriptStore {
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
    const role = message.role;
    const content = JSON.stringify(message);
    const createdAt = new Date().toISOString();
    const rows = this.storage.query(
      `SELECT COALESCE(MAX(seq), 0) + 1 FROM memory_turns
       WHERE team_id = ? AND agent_key = ? AND session_id = ?`,
      [teamId, agentKey, sessionId],
    );
    const seq = expectNumber(rows[0]![0]);
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
      let nextSeq = expectNumber(prefix[0]![0]) + 1;
      s.exec(
        `INSERT INTO memory_turns
           (team_id, session_id, agent_key, seq, role, content, compacted, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
        [teamId, sessionId, agentKey, nextSeq, summary.role, JSON.stringify(summary), new Date().toISOString()],
      );
      for (const row of tail) {
        nextSeq += 1;
        s.exec(
          `INSERT INTO memory_turns
             (team_id, session_id, agent_key, seq, role, content, compacted, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
          [teamId, sessionId, agentKey, nextSeq, expectString(row[1]), expectString(row[2]), expectString(row[3])],
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
    return rows.map((row) => JSON.parse(expectString(row[5])) as AgentMessage);
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
      sessionId: expectString(row[0]),
      messageCount: expectNumber(row[1]),
      lastActivity: expectString(row[2]),
      name: expectOptionalString(row[3]),
    }));
  }

  listAgentKeys(teamId: string, sessionId: string): ReadonlyArray<string> {
    const rows = this.storage.query(
      `SELECT DISTINCT agent_key FROM memory_turns
       WHERE team_id = ? AND session_id = ?
       ORDER BY agent_key`,
      [teamId, sessionId],
    );
    return rows.map((row) => expectString(row[0]));
  }

  remove(agentKey: string, sessionId: string, teamId: string): void {
    this.storage.exec(
      `DELETE FROM memory_turns
       WHERE team_id = ? AND session_id = ? AND agent_key = ?`,
      [teamId, sessionId, agentKey],
    );
  }

  sessionName(sessionId: string): string | null {
    const rows = this.storage.query(
      `SELECT name FROM session_metadata WHERE session_id = ?`,
      [sessionId],
    );
    const name = expectOptionalString(rows[0]?.[0]);
    return name ?? null;
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
