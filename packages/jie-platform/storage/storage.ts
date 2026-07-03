import { SqliteStorage } from "./sqlite-storage";

export interface Storage {
  readonly exec: (sql: string, params?: unknown[]) => void;
  readonly query: (sql: string, params?: unknown[]) => ReadonlyArray<ReadonlyArray<unknown>>;
  readonly transaction: <T>(fn: (storage: Storage) => T) => T;
}

interface CreateStorageParams {
  readonly type: "sqlite";
  readonly filePath: string;
}

export function createStorage(options: CreateStorageParams): Storage {
  if (options.type === "sqlite") {
    return new SqliteStorage(options.filePath);
  }
  throw new Error(`Unknown storage type: ${options.type}`);
}
