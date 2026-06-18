import { SqliteStorage } from "./sqlite-storage";

/**
 * Persistence abstraction. `Storage` is the interface; `SqliteStorage`
 * is the default implementation. Domain stores (`ArtifactStore`,
 * `MemoryManager`) sit on top — they do not import `bun:sqlite`.
 *
 * SQL is the contract: parameterised write, parameterised read,
 * transactional grouping, lifecycle.
 */
export interface Storage {
  /** Execute a write statement (INSERT, UPDATE, DELETE, DDL). */
  exec(sql: string, params?: unknown[]): void;

  /** Execute a read statement. Returns rows as `unknown[][]` — domain
   *  stores type their row shape at the row-extraction point. */
  query(sql: string, params?: unknown[]): unknown[][];

  /** Run `fn` in a single transaction. The `Storage` argument is the
   *  in-transaction view: writes inside `fn` are visible to `fn`'s own
   *  reads; other Storage calls outside `fn` see the pre-transaction
   *  state until commit. */
  transaction<T>(fn: (storage: Storage) => T): T;
}

interface CreateStorageOpstions {
  type: "sqlite";
  filePath: string;
}

export function createStorage(options: CreateStorageOpstions): Storage {
  if (options.type === "sqlite") {
    return new SqliteStorage(options.filePath);
  }
  throw new Error(`Unknown storage type: ${options.type}`);
}
