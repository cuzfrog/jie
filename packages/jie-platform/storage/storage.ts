export interface Storage {
  exec(sql: string, params?: unknown[]): void;
  query(sql: string, params?: unknown[]): ReadonlyArray<ReadonlyArray<unknown>>;
  transaction<T>(fn: (storage: Storage) => T): T;
}
