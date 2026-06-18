import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Storage } from "./storage.ts";
import type { TurnRecord } from "../domain-types.ts";

/** Conversation-history persistence interface. A per-body adapter that
 *  write-throughs every pi-agent message to durable storage, and on
 *  agent start, restores the full non-compacted history. */
export interface MemoryManager {
  /** Write-through a finalized message to durable storage. */
  persist(
    message: AgentMessage,
    agent_key: string,
    session_id: string,
    team_id: string,
  ): void;

  /** Mark the compacted raw messages as replaced and persist the
   *  CompactionSummaryMessage as a new row. Atomic. */
  compact(
    compactedSeqRange: [number, number],
    summary: AgentMessage,
    agent_key: string,
    session_id: string,
    team_id: string,
  ): void;

  /** Restore non-compacted history for (team_id, agent_key, session_id),
   *  ordered by `seq`. Empty array when no prior history exists. */
  restore(
    agent_key: string,
    session_id: string,
    team_id: string,
  ): Promise<AgentMessage[]>;

  /** Most-recent session_id for `team_id` (by MAX(created_at) over
   *  its rows), or `null`. Scoped to `team_id` alone (per ADR 17). */
  mostRecentSessionId(team_id: string): string | null;

  /** True if at least one row in `memory_turns` matches
   *  (team_id, session_id). */
  hasSession(team_id: string, session_id: string): boolean;
}

export function createMemoryManager(storage: Storage): MemoryManager {
  return new SqliteMemoryManager(storage);
}

/** Default `MemoryManager` implementation. SQL is written at the call
 *  site. `compact` is atomic via `Storage.transaction`. */
export class SqliteMemoryManager implements MemoryManager {
  constructor(private readonly storage: Storage) {}

  persist(
    message: AgentMessage,
    agent_key: string,
    session_id: string,
    team_id: string,
  ): void {
    const role = (message as { role: string }).role;
    const content = JSON.stringify(message);
    const created_at = new Date().toISOString();
    const rows = this.storage.query(
      `SELECT COALESCE(MAX(seq), 0) + 1 FROM memory_turns
       WHERE team_id = ? AND agent_key = ? AND session_id = ?`,
      [team_id, agent_key, session_id],
    );
    const seq = rows[0]![0] as number;
    this.storage.exec(
      `INSERT OR REPLACE INTO memory_turns
         (team_id, session_id, agent_key, seq, role, content, compacted, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
      [team_id, session_id, agent_key, seq, role, content, created_at],
    );
  }

  compact(
    compactedSeqRange: [number, number],
    summary: AgentMessage,
    agent_key: string,
    session_id: string,
    team_id: string,
  ): void {
    this.storage.transaction((s) => {
      const rows = s.query(
        `SELECT COALESCE(MAX(seq), 0) + 1 FROM memory_turns
         WHERE team_id = ? AND agent_key = ? AND session_id = ?`,
        [team_id, agent_key, session_id],
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
          team_id,
          session_id,
          agent_key,
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
        [team_id, agent_key, session_id, compactedSeqRange[0], compactedSeqRange[1]],
      );
    });
  }

  async restore(
    agent_key: string,
    session_id: string,
    team_id: string,
  ): Promise<AgentMessage[]> {
    const rows = this.storage.query(
      `SELECT team_id, session_id, agent_key, seq, role, content, compacted, created_at
       FROM memory_turns
       WHERE team_id = ? AND agent_key = ? AND session_id = ? AND compacted = 0
       ORDER BY seq`,
      [team_id, agent_key, session_id],
    );
    return rows.map((row) => JSON.parse(row[5] as string) as AgentMessage);
  }

  mostRecentSessionId(team_id: string): string | null {
    const rows = this.storage.query(
      `SELECT session_id FROM memory_turns
       WHERE team_id = ? GROUP BY session_id
       ORDER BY MAX(created_at) DESC LIMIT 1`,
      [team_id],
    );
    if (rows.length === 0) return null;
    return rows[0]![0] as string;
  }

  hasSession(team_id: string, session_id: string): boolean {
    const rows = this.storage.query(
      `SELECT 1 FROM memory_turns
       WHERE team_id = ? AND session_id = ? LIMIT 1`,
      [team_id, session_id],
    );
    return rows.length > 0;
  }
}

/** In-memory mock used by tests. Implements the same `MemoryManager`
 *  interface; no persistence. */
export class InMemoryMemoryManager implements MemoryManager {
  private readonly rows: TurnRecord[] = [];

  persist(
    message: AgentMessage,
    agent_key: string,
    session_id: string,
    team_id: string,
  ): void {
    const role = (message as { role: string }).role;
    const content = JSON.stringify(message);
    const created_at = new Date().toISOString();
    const seq = this.maxSeq(team_id, agent_key, session_id) + 1;
    this.rows.push({
      team_id,
      session_id,
      agent_key,
      seq,
      role,
      content,
      compacted: false,
      created_at,
    });
  }

  compact(
    compactedSeqRange: [number, number],
    summary: AgentMessage,
    agent_key: string,
    session_id: string,
    team_id: string,
  ): void {
    const summarySeq = this.maxSeq(team_id, agent_key, session_id) + 1;
    this.rows.push({
      team_id,
      session_id,
      agent_key,
      seq: summarySeq,
      role: (summary as { role: string }).role,
      content: JSON.stringify(summary),
      compacted: false,
      created_at: new Date().toISOString(),
    });
    for (const row of this.rows) {
      if (
        row.team_id === team_id &&
        row.agent_key === agent_key &&
        row.session_id === session_id &&
        row.seq >= compactedSeqRange[0] &&
        row.seq <= compactedSeqRange[1]
      ) {
        row.compacted = true;
      }
    }
  }

  async restore(
    agent_key: string,
    session_id: string,
    team_id: string,
  ): Promise<AgentMessage[]> {
    return this.rows
      .filter(
        (r) =>
          r.team_id === team_id &&
          r.agent_key === agent_key &&
          r.session_id === session_id &&
          !r.compacted,
      )
      .sort((a, b) => a.seq - b.seq)
      .map((r) => JSON.parse(r.content) as AgentMessage);
  }

  mostRecentSessionId(team_id: string): string | null {
    let best: TurnRecord | undefined;
    for (const r of this.rows) {
      if (r.team_id !== team_id) continue;
      if (best === undefined || r.created_at > best.created_at) best = r;
    }
    return best?.session_id ?? null;
  }

  hasSession(team_id: string, session_id: string): boolean {
    return this.rows.some(
      (r) => r.team_id === team_id && r.session_id === session_id,
    );
  }

  private maxSeq(team_id: string, agent_key: string, session_id: string): number {
    let max = 0;
    for (const r of this.rows) {
      if (
        r.team_id === team_id &&
        r.agent_key === agent_key &&
        r.session_id === session_id &&
        r.seq > max
      ) {
        max = r.seq;
      }
    }
    return max;
  }
}