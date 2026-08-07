import { ulid } from "ulid";
import type { Storage } from "../storage";

export type MemoryType = "fact" | "decision" | "method" | "instruction";

export interface RawMemory {
  readonly content: string;
  readonly type: MemoryType;
  readonly priority: number;
  readonly scene: string;
}

export interface Memory extends RawMemory {
  readonly id: string;
  readonly teamId: string;
  readonly sourceSessionId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MemoryStore {
  add(memories: ReadonlyArray<RawMemory>, teamId: string, sourceSessionId: string): number;
  search(query: string, teamId: string, limit: number): ReadonlyArray<Memory>;
  top(teamId: string, limit: number): ReadonlyArray<Memory>;
}

export class SqliteMemoryStore implements MemoryStore {
  private readonly storage: Storage;

  constructor(storage: Storage) {
    this.storage = storage;
  }

  add(memories: ReadonlyArray<RawMemory>, teamId: string, sourceSessionId: string): number {
    const now = new Date().toISOString();
    return this.storage.transaction((s) => {
      let stored = 0;
      for (const memory of memories) {
        if (reinforceIfExists(s, teamId, memory, now)) continue;
        const id = ulid();
        const priority = memory.type === "instruction" ? 100 : clampPriority(memory.priority);
        s.exec(
          `INSERT INTO memory_atoms (id, team_id, content, type, priority, scene, source_session_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, teamId, memory.content, memory.type, priority, memory.scene, sourceSessionId, now, now],
        );
        s.exec(`INSERT INTO memory_atoms_fts (content, atom_id) VALUES (?, ?)`, [memory.content, id]);
        stored += 1;
      }
      return stored;
    });
  }

  search(query: string, teamId: string, limit: number): ReadonlyArray<Memory> {
    const ftsQuery = toFtsQuery(query);
    if (ftsQuery === null) return [];
    const rows = this.storage.query(
      `SELECT a.id, a.team_id, a.content, a.type, a.priority, a.scene, a.source_session_id, a.created_at, a.updated_at
       FROM memory_atoms_fts
       JOIN memory_atoms a ON a.id = memory_atoms_fts.atom_id
       WHERE memory_atoms_fts MATCH ? AND a.team_id = ?
       ORDER BY bm25(memory_atoms_fts)
       LIMIT ?`,
      [ftsQuery, teamId, limit],
    );
    return rows.map(readMemoryRow);
  }

  top(teamId: string, limit: number): ReadonlyArray<Memory> {
    const rows = this.storage.query(
      `SELECT id, team_id, content, type, priority, scene, source_session_id, created_at, updated_at
       FROM memory_atoms
       WHERE team_id = ?
       ORDER BY priority DESC, updated_at DESC
       LIMIT ?`,
      [teamId, limit],
    );
    return rows.map(readMemoryRow);
  }
}

function reinforceIfExists(s: Storage, teamId: string, memory: RawMemory, now: string): boolean {
  const existing = s.query(
    `SELECT 1 FROM memory_atoms WHERE team_id = ? AND content = ? AND type = ? LIMIT 1`,
    [teamId, memory.content, memory.type],
  );
  if (existing.length === 0) return false;
  const priority = memory.type === "instruction" ? 100 : clampPriority(memory.priority);
  s.exec(
    `UPDATE memory_atoms
     SET priority = MAX(priority, ?), updated_at = ?, scene = ?
     WHERE team_id = ? AND content = ? AND type = ?`,
    [priority, now, memory.scene, teamId, memory.content, memory.type],
  );
  return true;
}

function clampPriority(priority: number): number {
  if (Number.isNaN(priority)) return 0;
  return Math.max(0, Math.min(100, Math.round(priority)));
}

function toFtsQuery(query: string): string | null {
  const trimmed = query.trim();
  if (trimmed === "") return null;
  const tokens = trimmed
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 3);
  if (tokens.length === 0) return null;
  return tokens.map((token) => `"${token}"`).join(" ");
}

function readMemoryRow(row: ReadonlyArray<unknown>): Memory {
  if (row.length !== 9) throw new Error(`expected 9 columns, got ${row.length}`);
  return {
    id: expectString(row[0]),
    teamId: expectString(row[1]),
    content: expectString(row[2]),
    type: expectMemoryType(row[3]),
    priority: expectNumber(row[4]),
    scene: expectString(row[5]),
    sourceSessionId: expectString(row[6]),
    createdAt: expectString(row[7]),
    updatedAt: expectString(row[8]),
  };
}

function expectString(value: unknown): string {
  if (typeof value !== "string") throw new Error(`expected string, got ${typeof value}`);
  return value;
}

function expectNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`expected finite number, got ${typeof value}`);
  return value;
}

function expectMemoryType(value: unknown): MemoryType {
  if (isMemoryType(value)) return value;
  throw new Error(`expected memory type, got ${typeof value}`);
}

function isMemoryType(value: unknown): value is MemoryType {
  return value === "fact" || value === "decision" || value === "method" || value === "instruction";
}
