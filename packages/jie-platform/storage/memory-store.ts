import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Storage } from "./storage";

interface TurnRecord {
  team_id: string;
  session_id: string;
  agent_key: string;
  seq: number;
  role: string;
  content: string;
  compacted: boolean;
  created_at: string;
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

  mostRecentSessionId(teamId: string): string | null;

  hasSession(teamId: string, sessionId: string): boolean;
}

export function createMemoryManager(storage: Storage): MemoryManager {
  return new SqliteMemoryManager(storage);
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

  mostRecentSessionId(teamId: string): string | null {
    const rows = this.storage.query(
      `SELECT session_id FROM memory_turns
       WHERE team_id = ? GROUP BY session_id
       ORDER BY MAX(created_at) DESC LIMIT 1`,
      [teamId],
    );
    if (rows.length === 0) return null;
    return rows[0]![0] as string;
  }

  hasSession(teamId: string, sessionId: string): boolean {
    const rows = this.storage.query(
      `SELECT 1 FROM memory_turns
       WHERE team_id = ? AND session_id = ? LIMIT 1`,
      [teamId, sessionId],
    );
    return rows.length > 0;
  }
}

export class InMemoryMemoryManager implements MemoryManager {
  private readonly rows: TurnRecord[] = [];

  persist(
    message: AgentMessage,
    agentKey: string,
    sessionId: string,
    teamId: string,
  ): void {
    const role = (message as { role: string }).role;
    const content = JSON.stringify(message);
    const createdAt = new Date().toISOString();
    const seq = this.maxSeq(teamId, agentKey, sessionId) + 1;
    this.rows.push({
      team_id: teamId,
      session_id: sessionId,
      agent_key: agentKey,
      seq,
      role,
      content,
      compacted: false,
      created_at: createdAt,
    });
  }

  compact(
    compactedSeqRange: [number, number],
    summary: AgentMessage,
    agentKey: string,
    sessionId: string,
    teamId: string,
  ): void {
    const summarySeq = this.maxSeq(teamId, agentKey, sessionId) + 1;
    this.rows.push({
      team_id: teamId,
      session_id: sessionId,
      agent_key: agentKey,
      seq: summarySeq,
      role: (summary as { role: string }).role,
      content: JSON.stringify(summary),
      compacted: false,
      created_at: new Date().toISOString(),
    });
    for (const row of this.rows) {
      if (
        row.team_id === teamId &&
        row.agent_key === agentKey &&
        row.session_id === sessionId &&
        row.seq >= compactedSeqRange[0] &&
        row.seq <= compactedSeqRange[1]
      ) {
        row.compacted = true;
      }
    }
  }

  async restore(
    agentKey: string,
    sessionId: string,
    teamId: string,
  ): Promise<AgentMessage[]> {
    return this.rows
      .filter(
        (r) =>
          r.team_id === teamId &&
          r.agent_key === agentKey &&
          r.session_id === sessionId &&
          !r.compacted,
      )
      .sort((a, b) => a.seq - b.seq)
      .map((r) => JSON.parse(r.content) as AgentMessage);
  }

  mostRecentSessionId(teamId: string): string | null {
    let best: TurnRecord | undefined;
    for (const r of this.rows) {
      if (r.team_id !== teamId) continue;
      if (best === undefined || r.created_at > best.created_at) best = r;
    }
    return best?.session_id ?? null;
  }

  hasSession(teamId: string, sessionId: string): boolean {
    return this.rows.some(
      (r) => r.team_id === teamId && r.session_id === sessionId,
    );
  }

  private maxSeq(teamId: string, agentKey: string, sessionId: string): number {
    let max = 0;
    for (const r of this.rows) {
      if (
        r.team_id === teamId &&
        r.agent_key === agentKey &&
        r.session_id === sessionId &&
        r.seq > max
      ) {
        max = r.seq;
      }
    }
    return max;
  }
}
