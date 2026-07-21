import { isTodoDetails } from "./todo";

declare const test: (name: string, fn: () => void | Promise<void>) => void;
declare const describe: (name: string, fn: () => void) => void;
declare const expect: typeof import("bun:test").expect;

describe("isTodoDetails", () => {
  test("accepts a well-formed todos payload", () => {
    expect(isTodoDetails({ kind: "todos", todos: [{ content: "x", status: "in_progress" }] })).toBe(true);
  });

  test("accepts an empty todos array (clears the list)", () => {
    expect(isTodoDetails({ kind: "todos", todos: [] })).toBe(true);
  });

  test("accepts items with optional active_form", () => {
    expect(isTodoDetails({ kind: "todos", todos: [{ content: "x", status: "pending", active_form: "doing x" }] })).toBe(true);
  });

  test("rejects when kind is not 'todos'", () => {
    expect(isTodoDetails({ kind: "diff", todos: [] })).toBe(false);
  });

  test("rejects when todos is not an array", () => {
    expect(isTodoDetails({ kind: "todos", todos: "nope" })).toBe(false);
  });

  test("rejects null and primitives", () => {
    expect(isTodoDetails(null)).toBe(false);
    expect(isTodoDetails(undefined)).toBe(false);
    expect(isTodoDetails("todos")).toBe(false);
    expect(isTodoDetails(42)).toBe(false);
  });

  test("rejects when an item has an unknown status", () => {
    expect(isTodoDetails({ kind: "todos", todos: [{ content: "x", status: "blocked" }] })).toBe(false);
  });

  test("rejects when an item has non-string content", () => {
    expect(isTodoDetails({ kind: "todos", todos: [{ content: 42, status: "in_progress" }] })).toBe(false);
  });

  test("rejects when an item is not an object", () => {
    expect(isTodoDetails({ kind: "todos", todos: [42, "x", null] })).toBe(false);
  });

  test("rejects when active_form is not a string", () => {
    expect(isTodoDetails({ kind: "todos", todos: [{ content: "x", status: "pending", active_form: 42 }] })).toBe(false);
  });

  test("rejects when any item in a multi-item list is malformed", () => {
    expect(isTodoDetails({ kind: "todos", todos: [
      { content: "ok", status: "completed" },
      { content: 99, status: "pending" },
    ]})).toBe(false);
  });
});