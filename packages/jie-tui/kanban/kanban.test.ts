import { isKanbanDetails } from "./kanban";

describe("isKanbanDetails", () => {
  test("accepts a well-formed kanban payload", () => {
    expect(isKanbanDetails({ kind: "kanban", cards: [{ id: "K1", content: "x", status: "in_progress" }] })).toBe(true);
  });

  test("accepts an empty cards array (clears the board)", () => {
    expect(isKanbanDetails({ kind: "kanban", cards: [] })).toBe(true);
  });

  test("accepts items with optional active_form", () => {
    expect(isKanbanDetails({ kind: "kanban", cards: [{ id: "K1", content: "x", status: "pending", active_form: "doing x" }] })).toBe(true);
  });

  test("rejects when kind is not 'kanban'", () => {
    expect(isKanbanDetails({ kind: "diff", cards: [] })).toBe(false);
  });

  test("rejects when cards is not an array", () => {
    expect(isKanbanDetails({ kind: "kanban", cards: "nope" })).toBe(false);
  });

  test("rejects null and primitives", () => {
    expect(isKanbanDetails(null)).toBe(false);
    expect(isKanbanDetails(undefined)).toBe(false);
    expect(isKanbanDetails("kanban")).toBe(false);
    expect(isKanbanDetails(42)).toBe(false);
  });

  test("rejects when an item has an unknown status", () => {
    expect(isKanbanDetails({ kind: "kanban", cards: [{ id: "K1", content: "x", status: "blocked" }] })).toBe(false);
  });

  test("rejects when an item has non-string content", () => {
    expect(isKanbanDetails({ kind: "kanban", cards: [{ id: "K1", content: 42, status: "in_progress" }] })).toBe(false);
  });

  test("rejects when an item is not an object", () => {
    expect(isKanbanDetails({ kind: "kanban", cards: [42, "x", null] })).toBe(false);
  });

  test("rejects when active_form is not a string", () => {
    expect(isKanbanDetails({ kind: "kanban", cards: [{ id: "K1", content: "x", status: "pending", active_form: 42 }] })).toBe(false);
  });

  test("rejects when any item in a multi-item list is malformed", () => {
    expect(isKanbanDetails({ kind: "kanban", cards: [
      { id: "K1", content: "ok", status: "completed" },
      { id: "K2", content: 99, status: "pending" },
    ]})).toBe(false);
  });
});
