import { Database, type SQLQueryBindings } from "bun:sqlite";
import type { Storage } from "./storage";
import { initializeSchema } from "./init-db";

export class SqliteStorage implements Storage {
  private readonly db: Database;

  constructor(filePath: string) {
    this.db = new Database(filePath);
    this.db.run("PRAGMA journal_mode=WAL");
    this.db.run("PRAGMA busy_timeout=5000");
    initializeSchema(this);
  }

  exec(sql: string, params?: unknown[]): void {
    if (params === undefined) {
      this.db.run(sql);
      return;
    }
    this.db.run(sql, toSqlBindings(params));
  }

  query(sql: string, params?: unknown[]): unknown[][] {
    if (params === undefined) {
      return this.db.query(sql).values();
    }
    return this.db.query(sql).values(...toSqlBindings(params));
  }

  transaction<T>(body: (storage: Storage) => T): T {
    const transaction = this.db.transaction(() => body(this));
    return transaction();
  }
}

function toSqlBindings(values: unknown[]): SQLQueryBindings[] {
  if (!values.every(isSqlBinding)) throw new Error("Unsupported SQL binding type");
  return values;
}

function isSqlBinding(value: unknown): value is SQLQueryBindings {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    value instanceof Uint8Array ||
    value instanceof Date
  );
}
