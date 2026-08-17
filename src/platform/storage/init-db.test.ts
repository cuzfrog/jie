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
    expect(names).toContain("session_agent_usage");
  });

  test("creates expected indexes", () => {
    const storage = new SqliteStorage(":memory:");
    initializeSchema(storage);
    const names = indexNames(storage);
    expect(names).toContain("idx_memory_turns_team_session_created");
    expect(names).toContain("idx_memory_atoms_team");
    expect(names).toContain("idx_memory_atoms_dedup");
  });

  test("is idempotent", () => {
    const storage = new SqliteStorage(":memory:");
    initializeSchema(storage);
    initializeSchema(storage);
    expect(tableNames(storage)).toContain("kanban_tasks");
  });

  test("kanban_tasks has a todos column", () => {
    const storage = new SqliteStorage(":memory:");
    initializeSchema(storage);
    const info = storage.query("PRAGMA table_info(kanban_tasks)");
    const columns = info.map((row) => String(row[1]));
    expect(columns).toContain("todos");
  });

});
