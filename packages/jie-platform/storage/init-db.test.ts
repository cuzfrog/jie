import type { Storage } from "./storage";
import { SqliteStorage } from "./sqlite-storage";
import { initializeSchema } from "./init-db";

function tableNames(storage: Storage): string[] {
  const rows = storage.query(`SELECT name FROM sqlite_master WHERE type = 'table'`);
  return rows.map((row) => String(row[0]));
}

function indexNames(storage: Storage): string[] {
  const rows = storage.query(`SELECT name FROM sqlite_master WHERE type = 'index'`);
  return rows.map((row) => String(row[0]));
}

function pragmaUserVersion(storage: Storage): number {
  const rows = storage.query("PRAGMA user_version");
  return Number(rows[0]?.[0] ?? 0);
}

describe("initializeSchema", () => {
  test("creates all expected tables", () => {
    const storage = new SqliteStorage(":memory:");
    initializeSchema(storage);
    const names = tableNames(storage);
    expect(names).toContain("artifacts");
    expect(names).toContain("memory_turns");
    expect(names).toContain("session_metadata");
    expect(names).toContain("memory_atoms");
    expect(names).toContain("memory_atoms_fts");
    expect(names).toContain("kanban_tasks");
    expect(names).toContain("kanban_counters");
  });

  test("creates expected indexes", () => {
    const storage = new SqliteStorage(":memory:");
    initializeSchema(storage);
    const names = indexNames(storage);
    expect(names).toContain("idx_memory_turns_team_session_created");
    expect(names).toContain("idx_memory_atoms_team");
    expect(names).toContain("idx_memory_atoms_dedup");
  });

  test("sets user_version to 1 after kanban migration", () => {
    const storage = new SqliteStorage(":memory:");
    initializeSchema(storage);
    expect(pragmaUserVersion(storage)).toBe(1);
  });

  test("is idempotent", () => {
    const storage = new SqliteStorage(":memory:");
    initializeSchema(storage);
    initializeSchema(storage);
    expect(tableNames(storage)).toContain("kanban_tasks");
    expect(pragmaUserVersion(storage)).toBe(1);
  });

  test("migrates an old kanban_cards table to kanban_tasks", () => {
    const storage = new SqliteStorage(":memory:");
    storage.exec(`
      CREATE TABLE kanban_cards (
        team_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        id TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL,
        active_form TEXT,
        description TEXT,
        completed_at TEXT,
        external_ref TEXT,
        updated_at TEXT NOT NULL
      )
    `);
    storage.exec(`
      INSERT INTO kanban_cards (team_id, session_id, seq, id, content, status, active_form, description, completed_at, external_ref, updated_at)
      VALUES ('t1', 's1', 1, 'c1', 'do the thing', 'pending', null, null, null, null, '2026-07-21T00:00:00.000Z')
    `);
    initializeSchema(storage);
    const names = tableNames(storage);
    expect(names).toContain("kanban_tasks");
    expect(names).not.toContain("kanban_cards");
    const rows = storage.query("SELECT team_id, id, content, scope FROM kanban_tasks");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(["t1", "c1", "do the thing", "team"]);
  });
});
