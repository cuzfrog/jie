import { Database } from "bun:sqlite";
import type { SqlBinding, Storage } from "./storage";
import { initializeSchema } from "./init-db";

export class SqliteStorage implements Storage {
  private readonly db: Database;

  constructor(filePath: string) {
    this.db = new Database(filePath);
    this.db.run("PRAGMA journal_mode=WAL");
    this.db.run("PRAGMA busy_timeout=5000");
    initializeSchema(this);
  }

  exec(sql: string, params?: ReadonlyArray<SqlBinding>): void {
    if (params === undefined) {
      this.db.run(sql);
      return;
    }
    this.db.run(sql, [...params]);
  }

  query(sql: string, params?: ReadonlyArray<SqlBinding>): ReadonlyArray<ReadonlyArray<SqlBinding>> {
    if (params === undefined) {
      return this.db.query(sql).values();
    }
    return this.db.query(sql).values(...params);
  }

  transaction<T>(body: (storage: Storage) => T): T {
    const transaction = this.db.transaction(() => body(this));
    return transaction();
  }
}
