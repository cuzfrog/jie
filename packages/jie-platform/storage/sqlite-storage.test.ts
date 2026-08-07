import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteStorage } from "./sqlite-storage";
import { initializeSchema } from "./init-db";

describe("SqliteStorage", () => {
  test("constructor creates all schema tables (idempotent)", () => {
    const storage = new SqliteStorage(":memory:");
    const tables = storage.query(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    );
    const names = tables.map((row) => row[0]);
    for (const name of ["artifacts", "memory_turns", "session_metadata", "memory_atoms", "memory_atoms_fts", "kanban_tasks", "kanban_counters"]) {
      expect(names).toContain(name);
    }
  });

  test("initializeSchema is callable separately and idempotent", () => {
    const storage = new SqliteStorage(":memory:");
    expect(() => initializeSchema(storage)).not.toThrow();
    expect(() => initializeSchema(storage)).not.toThrow();
  });

  test("initializeSchema migrates legacy kanban_cards to kanban_tasks", () => {
    const storage = new SqliteStorage(":memory:");
    storage.exec("DROP TABLE IF EXISTS kanban_tasks");
    storage.exec("DROP TABLE IF EXISTS kanban_counters");
    storage.exec(`
      CREATE TABLE kanban_cards (
        team_id      TEXT    NOT NULL,
        session_id   TEXT    NOT NULL DEFAULT '',
        seq          INTEGER NOT NULL,
        id           TEXT    NOT NULL,
        content      TEXT    NOT NULL,
        status       TEXT    NOT NULL,
        active_form   TEXT,
        description   TEXT,
        completed_at  TEXT,
        external_ref  TEXT,
        updated_at    TEXT    NOT NULL,
        PRIMARY KEY (team_id, id)
      )
    `);
    storage.exec(
      "INSERT INTO kanban_cards (team_id, session_id, seq, id, content, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ["t1", "", 0, "#1", "legacy", "pending", "2025-01-01T00:00:00.000Z"],
    );
    initializeSchema(storage);
    const tasks = storage.query("SELECT name FROM sqlite_master WHERE type='table' AND name='kanban_tasks'");
    expect(tasks).toEqual([["kanban_tasks"]]);
    const cards = storage.query("SELECT id, content FROM kanban_tasks");
    expect(cards).toEqual([["#1", "legacy"]]);
  });

  test("re-opening the same path is idempotent and tables persist", () => {
    const dir = mkdtempSync(join(tmpdir(), "jie-storage-"));
    const path = join(dir, "test.db");
    try {
      const a = new SqliteStorage(path);
      a.exec(
        "INSERT INTO artifacts (key, content, created_at) VALUES (?, ?, ?)",
        ["k1", "c1", "2025-01-01"],
      );

      const b = new SqliteStorage(path);
      const rows = b.query("SELECT key, content FROM artifacts ORDER BY key");
      expect(rows).toEqual([["k1", "c1"]]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("PRAGMA journal_mode is WAL and busy_timeout is 5000 (file-backed)", () => {

    const dir = mkdtempSync(join(tmpdir(), "jie-storage-"));
    const path = join(dir, "wal.db");
    try {
      const storage = new SqliteStorage(path);
      const journalMode = storage.query("PRAGMA journal_mode");
      expect(journalMode).toEqual([["wal"]]);
      const busyTimeout = storage.query("PRAGMA busy_timeout");

      expect(Number(busyTimeout[0]?.[0])).toBe(5000);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("memory_turns index exists with the spec name", () => {
    const storage = new SqliteStorage(":memory:");
    const rows = storage.query(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_memory_turns_team_session_created'",
    );
    expect(rows).toEqual([["idx_memory_turns_team_session_created"]]);
  });

  test("exec runs a parameterised write", () => {
    const storage = new SqliteStorage(":memory:");
    storage.exec(
      "INSERT INTO artifacts (key, content, created_at) VALUES (?, ?, ?)",
      ["k", "c", "2025-01-01"],
    );
    const rows = storage.query("SELECT key, content, created_at FROM artifacts");
    expect(rows).toEqual([["k", "c", "2025-01-01"]]);
  });

  test("transaction commits writes visible after the call", () => {
    const storage = new SqliteStorage(":memory:");
    storage.transaction((s) => {
      s.exec(
        "INSERT INTO artifacts (key, content, created_at) VALUES (?, ?, ?)",
        ["k", "c", "2025-01-01"],
      );
    });
    const rows = storage.query("SELECT key FROM artifacts");
    expect(rows).toEqual([["k"]]);
  });

  test("transaction rolls back on throw", () => {
    const storage = new SqliteStorage(":memory:");
    expect(() =>
      storage.transaction((s) => {
        s.exec(
          "INSERT INTO artifacts (key, content, created_at) VALUES (?, ?, ?)",
          ["k2", "c2", "2025-01-02"],
        );
        throw new Error("rollback");
      }),
    ).toThrow("rollback");
    const rows = storage.query("SELECT key FROM artifacts");
    expect(rows).toEqual([]);
  });

  test("transaction fn receives a Storage view (in-transaction reads see writes)", () => {
    const storage = new SqliteStorage(":memory:");
    const result = storage.transaction((s) => {
      s.exec(
        "INSERT INTO artifacts (key, content, created_at) VALUES (?, ?, ?)",
        ["k3", "c3", "2025-01-03"],
      );
      return s.query("SELECT key FROM artifacts");
    });
    expect(result).toEqual([["k3"]]);
  });
});
