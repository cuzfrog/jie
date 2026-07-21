import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteStorage } from "./sqlite-storage";
import { initializeSchema } from "./init-db";
import { createStorage } from "./storage";

describe("SqliteStorage", () => {
  test("constructor creates artifacts and memory_turns tables (idempotent)", () => {
    const storage = new SqliteStorage(":memory:");
    const tables = storage.query(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    );
    expect(tables).toEqual([["artifacts"], ["memory_turns"]]);
  });

  test("initializeSchema is callable separately and idempotent", () => {
    const storage = new SqliteStorage(":memory:");
    expect(() => initializeSchema(storage)).not.toThrow();
    expect(() => initializeSchema(storage)).not.toThrow();
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

describe("createStorage — memory variant", () => {
  test("{ type: 'memory' } returns a fresh, isolated sqlite storage", () => {
    const storage = createStorage({ type: "memory" });
    const tables = storage.query(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    );
    expect(tables).toEqual([["artifacts"], ["memory_turns"]]);
  });

  test("{ type: 'memory' } is not persisted between calls (each call is fresh)", () => {
    const a = createStorage({ type: "memory" });
    a.exec(
      "INSERT INTO artifacts (key, content, created_at) VALUES (?, ?, ?)",
      ["ephemeral", "x", "2025-01-01"],
    );
    const b = createStorage({ type: "memory" });
    const rows = b.query("SELECT key FROM artifacts");
    expect(rows).toEqual([]);
  });

  test("{ type: 'memory' } accepts writes + reads", () => {
    const storage = createStorage({ type: "memory" });
    storage.exec(
      "INSERT INTO artifacts (key, content, created_at) VALUES (?, ?, ?)",
      ["k", "c", "2025-01-01"],
    );
    const rows = storage.query("SELECT key, content FROM artifacts");
    expect(rows).toEqual([["k", "c"]]);
  });
});

describe("createStorage — sqlite variant", () => {
  test("{ type: 'sqlite', filePath } opens a file-backed database", () => {
    const dir = mkdtempSync(join(tmpdir(), "jie-storage-create-"));
    const path = join(dir, "create.db");
    try {
      const storage = createStorage({ type: "sqlite", filePath: path });
      storage.exec(
        "INSERT INTO artifacts (key, content, created_at) VALUES (?, ?, ?)",
        ["k", "c", "2025-01-01"],
      );
      const rows = storage.query("SELECT key FROM artifacts");
      expect(rows).toEqual([["k"]]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("{ type: 'sqlite' } without filePath throws", () => {
    expect(() => createStorage({ type: "sqlite" })).toThrow(
      "createStorage: filePath is required for sqlite storage",
    );
  });
});
