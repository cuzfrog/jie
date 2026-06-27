import { SqliteStorage } from "./sqlite-storage";

export interface Storage {

  exec(sql: string, params?: unknown[]): void;

  query(sql: string, params?: unknown[]): unknown[][];

  transaction<T>(fn: (storage: Storage) => T): T;
}

interface CreateStorageParams {
  type: "sqlite";
  filePath: string;
}

export function createStorage(options: CreateStorageParams): Storage {
  if (options.type === "sqlite") {
    return new SqliteStorage(options.filePath);
  }
  throw new Error(`Unknown storage type: ${options.type}`);
}
