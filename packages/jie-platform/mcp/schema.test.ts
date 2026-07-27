import { Value } from "typebox/value";
import { jsonSchemaToTypebox } from "./schema";

function check(schema: Parameters<typeof jsonSchemaToTypebox>[0], value: unknown): boolean {
  return Value.Check(jsonSchemaToTypebox(schema), value);
}

describe("jsonSchemaToTypebox", () => {
  test("maps scalar types", () => {
    expect(check({ type: "string" }, "x")).toBe(true);
    expect(check({ type: "string" }, 3)).toBe(false);
    expect(check({ type: "number" }, 3.5)).toBe(true);
    expect(check({ type: "number" }, "3")).toBe(false);
    expect(check({ type: "integer" }, 3)).toBe(true);
    expect(check({ type: "integer" }, 3.5)).toBe(false);
    expect(check({ type: "boolean" }, true)).toBe(true);
    expect(check({ type: "boolean" }, "true")).toBe(false);
    expect(check({ type: "null" }, null)).toBe(true);
    expect(check({ type: "null" }, 0)).toBe(false);
  });

  test("maps string enums and rejects values outside them", () => {
    expect(check({ enum: ["files", "types"] }, "files")).toBe(true);
    expect(check({ enum: ["files", "types"] }, "other")).toBe(false);
  });

  test("maps arrays with typed items", () => {
    expect(check({ type: "array", items: { type: "string" } }, ["a", "b"])).toBe(true);
    expect(check({ type: "array", items: { type: "string" } }, ["a", 2])).toBe(false);
    expect(check({ type: "array" }, [1, "a"])).toBe(true);
  });

  test("maps objects, honoring the required list", () => {
    const schema = {
      type: "object",
      properties: { pathPrefix: { type: "string" }, depth: { type: "integer" } },
      required: ["pathPrefix"],
    };
    expect(check(schema, { pathPrefix: "src" })).toBe(true);
    expect(check(schema, { pathPrefix: "src", depth: 2 })).toBe(true);
    expect(check(schema, {})).toBe(false);
    expect(check(schema, { pathPrefix: 3 })).toBe(false);
    expect(check(schema, { pathPrefix: "src", depth: 2.5 })).toBe(false);
  });

  test("treats every property as optional when required is absent", () => {
    const schema = { type: "object", properties: { a: { type: "string" } } };
    expect(check(schema, {})).toBe(true);
    expect(check(schema, { a: "x" })).toBe(true);
  });

  test("maps an empty object schema to an object with no properties", () => {
    expect(check({ type: "object" }, {})).toBe(true);
    expect(check({ type: "object" }, { anything: 1 })).toBe(true);
  });

  test("falls back to any for unrecognized shapes", () => {
    expect(check({}, "whatever")).toBe(true);
    expect(check({ type: "widget" }, 42)).toBe(true);
    expect(check({ type: "object", properties: { a: "not-a-schema" } }, { a: [1] })).toBe(true);
  });

  test("maps nested objects recursively", () => {
    const schema = {
      type: "object",
      properties: { outer: { type: "object", properties: { inner: { type: "boolean" } }, required: ["inner"] } },
      required: ["outer"],
    };
    expect(check(schema, { outer: { inner: true } })).toBe(true);
    expect(check(schema, { outer: {} })).toBe(false);
  });

  test("preserves descriptions for LLM-facing schemas", () => {
    const converted = jsonSchemaToTypebox({ type: "string", description: "a path prefix" });
    const serialized: { description?: string } = JSON.parse(JSON.stringify(converted));
    expect(serialized.description).toBe("a path prefix");
  });
});
