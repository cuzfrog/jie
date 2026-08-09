export type SqlBinding = null | string | number | boolean | bigint | Uint8Array;

export interface Storage {
  exec(sql: string, params?: ReadonlyArray<SqlBinding>): void;
  query(sql: string, params?: ReadonlyArray<SqlBinding>): ReadonlyArray<ReadonlyArray<SqlBinding>>;
  transaction<T>(fn: (storage: Storage) => T): T;
}
