import { SqliteStorage } from "./sqlite-storage";

export interface Storage {
  exec(sql: string, params?: unknown[]): void;
  query(sql: string, params?: unknown[]): ReadonlyArray<ReadonlyArray<unknown>>;
  transaction<T>(fn: (storage: Storage) => T): T;
}

interface CreateStorageParams {
  readonly type: "sqlite" | "memory";
  readonly filePath?: string;
}

export function createStorage(options: CreateStorageParams): Storage {
  if (options.type === "sqlite") {
    if (options.filePath === undefined) {
      throw new Error("createStorage: filePath is required for sqlite storage");
    }
    return new SqliteStorage(options.filePath);
  }
  if (options.type === "memory") {
    return new SqliteStorage(":memory:");
  }
  const exhaustive: never = options.type;
  throw new Error(`Unknown storage type: ${String(exhaustive)}`);
}
