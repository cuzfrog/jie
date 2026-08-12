import type { SqlBinding } from "./storage";

export function expectString(value: SqlBinding): string {
  if (typeof value !== "string") throw new Error(`expected string, got ${typeof value}`);
  return value;
}

export function expectOptionalString(value: SqlBinding | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  return expectString(value);
}

export function expectNumber(value: SqlBinding): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  throw new Error(`expected number, got ${typeof value}`);
}
