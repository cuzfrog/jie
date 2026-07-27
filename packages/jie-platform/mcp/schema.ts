import { Type, type TSchema } from "typebox";
import type { JsonObject, JsonValue } from "./json";

export function jsonSchemaToTypebox(schema: JsonObject): TSchema {
  return convertSchema(schema);
}

function convertSchema(schema: JsonObject): TSchema {
  const converted = convertByType(schema);
  const description = schema["description"];
  return typeof description === "string" ? { ...converted, description } : converted;
}

function convertByType(schema: JsonObject): TSchema {
  const enumeration = convertEnum(schema["enum"]);
  if (enumeration !== null) return enumeration;
  const type = schema["type"];
  if (type === "string") return Type.String();
  if (type === "number") return Type.Number();
  if (type === "integer") return Type.Integer();
  if (type === "boolean") return Type.Boolean();
  if (type === "null") return Type.Null();
  if (type === "array") return convertArray(schema["items"]);
  if (type === "object") return convertObject(schema);
  return Type.Any();
}

function convertEnum(raw: JsonValue): TSchema | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const literals: Array<ReturnType<typeof Type.Literal>> = [];
  for (const entry of raw) {
    if (typeof entry !== "string" && typeof entry !== "number") return null;
    literals.push(Type.Literal(entry));
  }
  return Type.Union(literals);
}

function convertArray(items: JsonValue): TSchema {
  return Type.Array(isJsonObject(items) ? convertSchema(items) : Type.Any());
}

function convertObject(schema: JsonObject): TSchema {
  const propertiesField = schema["properties"];
  if (!isJsonObject(propertiesField)) return Type.Object({});
  const required = requiredNames(schema["required"]);
  const properties: Record<string, TSchema> = {};
  for (const [name, propertySchema] of Object.entries(propertiesField)) {
    const converted = isJsonObject(propertySchema) ? convertSchema(propertySchema) : Type.Any();
    properties[name] = required.has(name) ? converted : Type.Optional(converted);
  }
  return Type.Object(properties);
}

function requiredNames(raw: JsonValue): ReadonlySet<string> {
  const names = new Set<string>();
  if (!Array.isArray(raw)) return names;
  for (const entry of raw) {
    if (typeof entry === "string") names.add(entry);
  }
  return names;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
