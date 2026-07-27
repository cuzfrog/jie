export type JsonValue = JsonValue[] | JsonObject | string | number | boolean | null;

export interface JsonObject {
  readonly [key: string]: JsonValue;
}
