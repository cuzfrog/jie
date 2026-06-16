import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteStorage } from "./sqlite-storage.ts";
import { initializeSchema } from "./init-db.ts";

describe("SqliteStorage", () => {
  test("constructor creates artifacts and memory_turns tables (idempotent)", () => {
    const storage = new SqliteStorage(":memory:");
    const tables = storage.query(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    );
    expect(tables).toEqual([["artifacts"], ["memory_turns"]]);
    storage.close();
  });

  test("initializeSchema is callable separately and idempotent", () => {
    const storage = new SqliteStorage(":memory:");
    expect(() => initializeSchema(storage)).not.toThrow();
    expect(() => initializeSchema(storage)).not.toThrow();
    storage.close();
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
      a.close();

      const b = new SqliteStorage(path);
      const rows = b.query("SELECT key, content FROM artifacts ORDER BY key");
      expect(rows).toEqual([["k1", "c1"]]);
      b.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("PRAGMA journal_mode is WAL and busy_timeout is 5000 (file-backed)", () => {
    // WAL cannot be enabled on `:memory:` databases — SQLite returns
    // 'memory' for them — so we use a tmp file for this assertion.
    const dir = mkdtempSync(join(tmpdir(), "jie-storage-"));
    const path = join(dir, "wal.db");
    try {
      const storage = new SqliteStorage(path);
      const journalMode = storage.query("PRAGMA journal_mode");
      expect(journalMode).toEqual([["wal"]]);
      const busyTimeout = storage.query("PRAGMA busy_timeout");
      // SQLite returns busy_timeout as an integer
      expect(Number(busyTimeout[0]?.[0])).toBe(5000);
      storage.close();
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
    storage.close();
  });

  test("exec runs a parameterised write", () => {
    const storage = new SqliteStorage(":memory:");
    storage.exec(
      "INSERT INTO artifacts (key, content, created_at) VALUES (?, ?, ?)",
      ["k", "c", "2025-01-01"],
    );
    const rows = storage.query("SELECT key, content, created_at FROM artifacts");
    expect(rows).toEqual([["k", "c", "2025-01-01"]]);
    storage.close();
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
    storage.close();
  });

  test("transaction rolls back on throw", () => {
    const storage = new SqliteStorage(":memory:");
    let caught: unknown = undefined;
    try {
      storage.transaction((s) => {
        s.exec(
          "INSERT INTO artifacts (key, content, created_at) VALUES (?, ?, ?)",
          ["k2", "c2", "2025-01-02"],
        );
        throw new Error("rollback");
      });
    } catch (e) {
      caught = e;
    }
    expect((caught as Error | undefined)?.message).toBe("rollback");
    const rows = storage.query("SELECT key FROM artifacts");
    expect(rows).toEqual([]);
    storage.close();
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
    storage.close();
  });
});