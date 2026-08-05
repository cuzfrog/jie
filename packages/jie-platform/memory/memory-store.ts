import { ulid } from "ulid";
import type { Storage } from "../storage";

export type MemoryAtomType = "fact" | "decision" | "method" | "instruction";

export interface NewMemoryAtom {
  readonly content: string;
  readonly type: MemoryAtomType;
  readonly priority: number;
  readonly scene: string;
}

export interface MemoryAtom {
  readonly id: string;
  readonly teamId: string;
  readonly content: string;
  readonly type: MemoryAtomType;
  readonly priority: number;
  readonly scene: string;
  readonly sourceSessionId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MemoryStore {
  add(atoms: ReadonlyArray<NewMemoryAtom>, teamId: string, sourceSessionId: string): number;
  search(query: string, teamId: string, limit: number): Promise<ReadonlyArray<MemoryAtom>>;
  top(teamId: string, limit: number): Promise<ReadonlyArray<MemoryAtom>>;
}

export class SqliteMemoryStore implements MemoryStore {
  private readonly storage: Storage;

  constructor(storage: Storage) {
    this.storage = storage;
  }

  add(atoms: ReadonlyArray<NewMemoryAtom>, teamId: string, sourceSessionId: string): number {
    const now = new Date().toISOString();
    return this.storage.transaction((s) => {
      let stored = 0;
      for (const atom of atoms) {
        if (hasAtom(s, teamId, atom)) continue;
        const id = ulid();
        const priority = atom.type === "instruction" ? 100 : clampPriority(atom.priority);
        s.exec(
          `INSERT INTO memory_atoms (id, team_id, content, type, priority, scene, source_session_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, teamId, atom.content, atom.type, priority, atom.scene, sourceSessionId, now, now],
        );
        s.exec(
          `INSERT INTO memory_atoms_fts (content, atom_id) VALUES (?, ?)`,
          [atom.content, id],
        );
        stored += 1;
      }
      return stored;
    });
  }

  async search(query: string, teamId: string, limit: number): Promise<ReadonlyArray<MemoryAtom>> {
    const rows = this.storage.query(
      `SELECT a.id, a.team_id, a.content, a.type, a.priority, a.scene, a.source_session_id, a.created_at, a.updated_at
       FROM memory_atoms_fts
       JOIN memory_atoms a ON a.id = memory_atoms_fts.atom_id
       WHERE memory_atoms_fts MATCH ? AND a.team_id = ?
       ORDER BY bm25(memory_atoms_fts)
       LIMIT ?`,
      [query, teamId, limit],
    );
    return rows.map(mapAtom);
  }

  async top(teamId: string, limit: number): Promise<ReadonlyArray<MemoryAtom>> {
    const rows = this.storage.query(
      `SELECT id, team_id, content, type, priority, scene, source_session_id, created_at, updated_at
       FROM memory_atoms
       WHERE team_id = ?
       ORDER BY priority DESC, updated_at DESC
       LIMIT ?`,
      [teamId, limit],
    );
    return rows.map(mapAtom);
  }
}

function hasAtom(s: Storage, teamId: string, atom: NewMemoryAtom): boolean {
  const rows = s.query(
    `SELECT 1 FROM memory_atoms WHERE team_id = ? AND content = ? AND type = ? LIMIT 1`,
    [teamId, atom.content, atom.type],
  );
  return rows.length > 0;
}

function clampPriority(priority: number): number {
  return Math.max(0, Math.min(100, Math.round(priority)));
}

function mapAtom(row: ReadonlyArray<unknown>): MemoryAtom {
  return {
    id: row[0] as string,
    teamId: row[1] as string,
    content: row[2] as string,
    type: row[3] as MemoryAtomType,
    priority: row[4] as number,
    scene: row[5] as string,
    sourceSessionId: row[6] as string,
    createdAt: row[7] as string,
    updatedAt: row[8] as string,
  };
}