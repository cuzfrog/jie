import { Database, type SQLQueryBindings } from "bun:sqlite";
import type { Storage } from "./storage.ts";
import { initializeSchema } from "./init-db.ts";

/** Default `Storage` backend, backed by `bun:sqlite`.
 *  Opens `filePath`, sets WAL + busy_timeout pragmas, applies the v1
 *  schema, returns the storage view. */
export class SqliteStorage implements Storage {
  private readonly db: Database;

  constructor(filePath: string) {
    this.db = new Database(filePath);
    this.db.exec("PRAGMA journal_mode=WAL");
    this.db.exec("PRAGMA busy_timeout=5000");
    initializeSchema(this);
  }

  exec(sql: string, params?: unknown[]): void {
    if (params === undefined) {
      this.db.exec(sql);
      return;
    }
    this.db.exec(sql, params as SQLQueryBindings[]);
  }

  query(sql: string, params?: unknown[]): unknown[][] {
    if (params === undefined) {
      return this.db.query(sql).values() as unknown[][];
    }
    return this.db.query(sql).values(...(params as SQLQueryBindings[])) as unknown[][];
  }

  transaction<T>(fn: (storage: Storage) => T): T {
    const txWrapper = this.db.transaction(() => fn(this));
    return txWrapper();
  }

  close(): void {
    this.db.close();
  }
}