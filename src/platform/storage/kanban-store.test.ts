import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KanbanCard, KanbanCardWrite } from "../types";
import { JiePlatformError } from "../jie-platform-errors";
import { SqliteKanbanStore } from "./kanban-store";
import { SqliteStorage } from "./sqlite-storage";

function makeStore(): SqliteKanbanStore {
  return new SqliteKanbanStore(new SqliteStorage(":memory:"));
}

function write(
  content: string,
  status: KanbanCardWrite["status"] = "pending",
  activeForm?: string,
  scope?: "team" | "session",
): KanbanCardWrite {
  return {
    content,
    status,
    ...(activeForm === undefined ? {} : { active_form: activeForm }),
    ...(scope === undefined ? {} : { scope }),
  };
}

function ids(cards: ReadonlyArray<KanbanCard>): string[] {
  return cards.map((card) => card.id);
}

describe("SqliteKanbanStore", () => {
  test("load returns an empty board for a fresh session", () => {
    const store = makeStore();
    expect(store.load("t1", "s1")).toEqual([]);
  });

  test("replace assigns sequential per-board ids starting at #1", () => {
    const store = makeStore();
    const cards = store.replace("t1", "s1", [write("first"), write("second")]);
    expect(ids(cards)).toEqual(["#1", "#2"]);
  });

  test("replace keeps ids and descriptions for cards whose content already exists", () => {
    const store = makeStore();
    store.replace("t1", "s1", [write("first"), write("second")]);
    const cards = store.replace("t1", "s1", [{ content: "second", status: "completed", description: "the second task" }, write("third")]);
    expect(ids(cards)).toEqual(["#2", "#3"]);
    expect(cards[0]).toMatchObject({ id: "#2", content: "second", status: "completed", description: "the second task" });
  });

  test("replace drops cards that are no longer in the incoming board", () => {
    const store = makeStore();
    store.replace("t1", "s1", [write("first"), write("second")]);
    const cards = store.replace("t1", "s1", [write("second")]);
    expect(ids(cards)).toEqual(["#2"]);
  });

  test("add appends a card with a fresh id and keeps the board order", () => {
    const store = makeStore();
    store.replace("t1", "s1", [write("first")]);
    const card = store.add("t1", "s1", "second", undefined);
    expect(card?.id).toBe("#2");
    expect(store.load("t1", "s1")).toHaveLength(2);
  });

  test("add with session scope creates an ephemeral card visible only in that session", () => {
    const store = makeStore();
    store.replace("t1", "s1", [write("first", "pending", undefined, "team")]);
    const card = store.add("t1", "s2", "ephemeral", undefined, "session");
    expect(card?.scope).toBe("session");
    expect(store.load("t1", "s2")).toHaveLength(2);
    expect(store.load("t1", "s1")).toHaveLength(1);
    expect(store.load("t1", "s3")).toHaveLength(1);
  });

  test("add without scope creates a session-scoped card by default", () => {
    const store = makeStore();
    store.replace("t1", "s1", [write("first", "pending", undefined, "team")]);
    const card = store.add("t1", "s2", "ephemeral", undefined);
    expect(card?.scope).toBe("session");
    expect(store.load("t1", "s2")).toHaveLength(2);
    expect(store.load("t1", "s1")).toHaveLength(1);
  });

  test("add stores the description when provided", () => {
    const store = makeStore();
    const card = store.add("t1", "s1", "build the feature", "the full description");
    expect(card?.description).toBe("the full description");
    expect(store.load("t1", "s1")[0]).toMatchObject({ content: "build the feature", description: "the full description", status: "pending" });
  });

  test("add returns null when the content already exists and leaves the board unchanged", () => {
    const store = makeStore();
    store.replace("t1", "s1", [write("first")]);
    expect(store.add("t1", "s1", "first", undefined)).toBeNull();
    expect(ids(store.load("t1", "s1"))).toEqual(["#1"]);
  });

  test("add duplicate content does not advance the id counter", () => {
    const storage = new SqliteStorage(":memory:");
    const store = new SqliteKanbanStore(storage);
    store.replace("t1", "s1", [write("first")]);
    expect(store.add("t1", "s1", "first", undefined)).toBeNull();
    const counter = storage.query("SELECT next_id FROM kanban_counters WHERE team_id = ?", ["t1"]);
    expect(counter[0]?.[0]).toBe(2);
  });

  test("replace with only existing content does not advance the id counter", () => {
    const storage = new SqliteStorage(":memory:");
    const store = new SqliteKanbanStore(storage);
    store.replace("t1", "s1", [write("first")]);
    store.replace("t1", "s1", [write("first")]);
    const counter = storage.query("SELECT next_id FROM kanban_counters WHERE team_id = ?", ["t1"]);
    expect(counter[0]?.[0]).toBe(2);
  });

  test("remove deletes the card and reports false for an unknown id", () => {
    const store = makeStore();
    store.replace("t1", "s1", [write("first"), write("second")]);
    expect(store.remove("t1", "s1", "#1")).toBe(true);
    expect(ids(store.load("t1", "s1"))).toEqual(["#2"]);
    expect(store.remove("t1", "s1", "#9")).toBe(false);
  });

  test("setStatus transitions a card to any status", () => {
    const store = makeStore();
    store.replace("t1", "s1", [write("first")]);
    expect(store.setStatus("t1", "s1", "#1", "in_review")).toBe(true);
    expect(store.load("t1", "s1")[0]).toMatchObject({ id: "#1", status: "in_review" });
    expect(store.setStatus("t1", "s1", "#1", "completed")).toBe(true);
    expect(store.load("t1", "s1")[0]).toMatchObject({ id: "#1", status: "completed" });
    expect(store.setStatus("t1", "s1", "#9", "completed")).toBe(false);
  });

  test("editContent updates the card text preserving status and id", () => {
    const store = makeStore();
    store.replace("t1", "s1", [write("first", "in_progress", "Working")]);
    const card = store.editContent("t1", "s1", "#1", "first (revised)");
    expect(card).toMatchObject({ id: "#1", content: "first (revised)", status: "in_progress", active_form: "Working" });
    expect(store.editContent("t1", "s1", "#9", "nope")).toBeNull();
  });

  test("editContent returns null when the new content duplicates another card and leaves the board unchanged", () => {
    const store = makeStore();
    store.replace("t1", "s1", [write("first"), write("second")]);
    expect(store.editContent("t1", "s1", "#1", "second")).toBeNull();
    expect(store.load("t1", "s1").map((card) => card.content)).toEqual(["first", "second"]);
  });

  test("editDescription updates the card description", () => {
    const store = makeStore();
    store.replace("t1", "s1", [write("first")]);
    const card = store.editDescription("t1", "s1", "#1", "cover storage");
    expect(card).toMatchObject({ id: "#1", content: "first", description: "cover storage" });
    expect(store.load("t1", "s1")[0]!.description).toBe("cover storage");
  });

  test("editDescription removes the description when given an empty string", () => {
    const store = makeStore();
    store.replace("t1", "s1", [{ content: "first", status: "pending", description: "cover storage" }]);
    const card = store.editDescription("t1", "s1", "#1", "");
    expect(card).toMatchObject({ id: "#1", content: "first" });
    expect(store.load("t1", "s1")[0]!.description).toBeUndefined();
  });

  test("editDescription returns null for an unknown card", () => {
    const store = makeStore();
    store.replace("t1", "s1", [write("first")]);
    expect(store.editDescription("t1", "s1", "#9", "nope")).toBeNull();
  });

  test("replace with internally-duplicate incoming content keeps the last write and does not crash", () => {
    const store = makeStore();
    const cards = store.replace("t1", "s1", [write("a", "pending"), write("a", "completed", "Working"), write("b")]);
    expect(ids(cards)).toEqual(["#1", "#2"]);
    expect(cards[0]).toMatchObject({ content: "a", status: "completed", active_form: "Working" });
  });

  test("the id counter is shared per team while default cards stay session-scoped", () => {
    const store = makeStore();
    store.add("t1", "s1", "a", undefined);
    store.add("t1", "s2", "b", undefined);
    expect(ids(store.load("t1", "s1"))).toEqual(["#1"]);
    expect(ids(store.load("t1", "s2"))).toEqual(["#2"]);
    expect(ids(store.load("t2", "s1"))).toEqual([]);
  });

  test("team-scoped cards are visible across sessions on the same team", () => {
    const store = makeStore();
    store.replace("t1", "s1", [write("a", "pending", undefined, "team"), write("b", "pending", undefined, "team")]);
    expect(ids(store.load("t1", "s1"))).toEqual(["#1", "#2"]);
    expect(ids(store.load("t1", "s2"))).toEqual(["#1", "#2"]);
    expect(ids(store.load("t2", "s1"))).toEqual([]);
  });

  test("setStatus to completed records a completedAt timestamp", () => {
    const store = makeStore();
    store.replace("t1", "s1", [write("first")]);
    store.setStatus("t1", "s1", "#1", "completed");
    const card = store.load("t1", "s1")[0];
    expect(card?.status).toBe("completed");
    expect(card?.completedAt).toBeTruthy();
  });

  test("completed cards older than 30 days are hidden from load", () => {
    const storage = new SqliteStorage(":memory:");
    const store = new SqliteKanbanStore(storage);
    store.replace("t1", "s1", [{ content: "old", status: "completed" }]);
    store.replace("t1", "s1", [{ content: "new", status: "completed" }]);
    storage.exec("UPDATE kanban_tasks SET completed_at = ? WHERE content = ?", ["2020-01-01T00:00:00.000Z", "old"]);
    expect(store.load("t1", "s1")).toHaveLength(1);
    expect(store.load("t1", "s1")[0]?.content).toBe("new");
  });

  test("replace stores and round-trips an external reference", () => {
    const store = makeStore();
    const board = store.replace("t1", "s1", [{ content: "issue", status: "pending", externalRef: "G#42" }]);
    expect(board[0]?.externalRef).toBe("G#42");
    expect(store.load("t1", "s1")[0]?.externalRef).toBe("G#42");
  });

  test("replace retains completed cards within 30 days even when omitted", () => {
    const store = makeStore();
    store.replace("t1", "s1", [{ content: "keep", status: "completed" }]);
    const board = store.replace("t1", "s1", [{ content: "new", status: "pending" }]);
    expect(board.some((c) => c.content === "keep")).toBe(true);
    expect(board.some((c) => c.content === "new")).toBe(true);
  });

  test("the id counter never reuses ids after removals or replace", () => {
    const store = makeStore();
    store.replace("t1", "s1", [write("a"), write("b"), write("c")]);
    store.remove("t1", "s1", "#2");
    const cards = store.replace("t1", "s1", [write("d")]);
    expect(ids(cards)).toEqual(["#4"]);
  });

  test("handoff moves a card to another team and removes it from the source", () => {
    const store = makeStore();
    store.replace("t1", "s1", [write("a")]);
    store.replace("t2", "s2", []);
    const card = store.handoff("t1", "s1", "#1", "t2");
    expect(card?.content).toBe("a");
    expect(card?.scope).toBe("team");
    expect(store.load("t1", "s1")).toHaveLength(0);
    expect(store.load("t2", "s2")).toHaveLength(1);
  });

  test("handoff returns null when the target team already has the same content", () => {
    const storage = new SqliteStorage(":memory:");
    const store = new SqliteKanbanStore(storage);
    store.replace("t1", "s1", [write("a")]);
    store.replace("t2", "", [write("a")]);
    expect(store.handoff("t1", "s1", "#1", "t2")).toBeNull();
    expect(store.load("t1", "s1")).toHaveLength(1);
  });

  test("a board persisted for one session survives a fresh store instance (same file)", () => {
    const dbFile = join(mkdtempSync(join(tmpdir(), "jie-kanban-")), "storage.db");
    const first = new SqliteKanbanStore(new SqliteStorage(dbFile));
    first.add("t1", "s1", "persisted", undefined);
    const second = new SqliteKanbanStore(new SqliteStorage(dbFile));
    expect(second.load("t1", "s1")[0]).toMatchObject({ id: "#1", content: "persisted" });
  });

  test("replace stores and round-trips todos", () => {
    const store = makeStore();
    const cards = store.replace("t1", "s1", [
      { content: "first", status: "pending", todos: [{ text: "one", done: true }, { text: "two", done: false }] },
    ]);
    expect(cards[0]?.todos).toEqual([
      { text: "one", done: true },
      { text: "two", done: false },
    ]);
    expect(store.load("t1", "s1")[0]?.todos).toEqual([
      { text: "one", done: true },
      { text: "two", done: false },
    ]);
  });

  test("replace with empty todo text throws KANBAN_WRITE_INVALID", () => {
    const store = makeStore();
    expect(() => store.replace("t1", "s1", [{ content: "first", status: "pending", todos: [{ text: "", done: false }] }])).toThrow(JiePlatformError);
  });

  test("replace with duplicate todo text throws KANBAN_WRITE_INVALID", () => {
    const store = makeStore();
    expect(() =>
      store.replace("t1", "s1", [{ content: "first", status: "pending", todos: [{ text: "one", done: false }, { text: "one", done: true }] }]),
    ).toThrow(JiePlatformError);
  });

  test("replace with todos omitted preserves existing todos", () => {
    const store = makeStore();
    store.replace("t1", "s1", [{ content: "first", status: "pending", todos: [{ text: "one", done: true }] }]);
    const cards = store.replace("t1", "s1", [{ content: "first", status: "in_progress" }]);
    expect(cards[0]?.todos).toEqual([{ text: "one", done: true }]);
  });

  test("replace with todos [] clears existing todos", () => {
    const store = makeStore();
    store.replace("t1", "s1", [{ content: "first", status: "pending", todos: [{ text: "one", done: true }] }]);
    const cards = store.replace("t1", "s1", [{ content: "first", status: "pending", todos: [] }]);
    expect(cards[0]?.todos).toBeUndefined();
    expect(store.load("t1", "s1")[0]?.todos).toBeUndefined();
  });

  test("replace merges todos by text and inherits done when omitted", () => {
    const store = makeStore();
    store.replace("t1", "s1", [{ content: "first", status: "pending", todos: [{ text: "one", done: true }, { text: "two", done: false }] }]);
    const cards = store.replace("t1", "s1", [
      { content: "first", status: "in_progress", todos: [{ text: "one" }, { text: "two", done: true }, { text: "three" }] },
    ]);
    expect(cards[0]?.todos).toEqual([
      { text: "one", done: true },
      { text: "two", done: true },
      { text: "three", done: false },
    ]);
  });

  test("update patches status and preserves todos", () => {
    const store = makeStore();
    store.replace("t1", "s1", [{ content: "first", status: "pending", todos: [{ text: "one", done: false }] }]);
    const card = store.update("t1", "s1", "first", { status: "in_progress" });
    expect(card).toMatchObject({ content: "first", status: "in_progress" });
    expect(card?.todos).toEqual([{ text: "one", done: false }]);
  });

  test("update patches todos and inherits done when omitted", () => {
    const store = makeStore();
    store.replace("t1", "s1", [{ content: "first", status: "pending", todos: [{ text: "one", done: true }] }]);
    const card = store.update("t1", "s1", "first", { todos: [{ text: "one" }, { text: "two" }] });
    expect(card?.todos).toEqual([
      { text: "one", done: true },
      { text: "two", done: false },
    ]);
  });

  test("update clears description and active_form with empty strings", () => {
    const store = makeStore();
    store.replace("t1", "s1", [
      { content: "first", status: "pending", description: "desc", active_form: "form", externalRef: "ref" },
    ]);
    const card = store.update("t1", "s1", "first", { description: "", active_form: "", externalRef: "" });
    expect(card?.description).toBeUndefined();
    expect(card?.active_form).toBeUndefined();
    expect(card?.externalRef).toBeUndefined();
  });

  test("update throws KANBAN_WRITE_INVALID for invalid todos", () => {
    const store = makeStore();
    store.replace("t1", "s1", [{ content: "first", status: "pending" }]);
    expect(() => store.update("t1", "s1", "first", { todos: [{ text: "" }] })).toThrow(JiePlatformError);
    expect(() => store.update("t1", "s1", "first", { todos: [{ text: "one" }, { text: "one" }] })).toThrow(JiePlatformError);
  });

  test("update returns null for unknown content", () => {
    const store = makeStore();
    expect(store.update("t1", "s1", "missing", { status: "in_progress" })).toBeNull();
  });

  test("editContent, editDescription, and setStatus preserve todos", () => {
    const store = makeStore();
    store.replace("t1", "s1", [{ content: "first", status: "pending", todos: [{ text: "one", done: false }] }]);
    store.editDescription("t1", "s1", "#1", "desc");
    store.editContent("t1", "s1", "#1", "renamed");
    store.setStatus("t1", "s1", "#1", "in_progress");
    const card = store.load("t1", "s1")[0];
    expect(card?.content).toBe("renamed");
    expect(card?.todos).toEqual([{ text: "one", done: false }]);
  });

  test("handoff preserves todos", () => {
    const store = makeStore();
    store.replace("t1", "s1", [{ content: "first", status: "pending", todos: [{ text: "one", done: true }] }]);
    store.handoff("t1", "s1", "#1", "t2");
    const card = store.load("t2", "")[0];
    expect(card?.todos).toEqual([{ text: "one", done: true }]);
  });

  test("replace and update store and clear assignee", () => {
    const store = makeStore();
    const cards = store.replace("t1", "s1", [{ content: "first", status: "pending", assignee: "agent-1" }]);
    expect(cards[0]?.assignee).toBe("agent-1");
    const updated = store.update("t1", "s1", "first", { assignee: "" });
    expect(updated?.assignee).toBeUndefined();
    expect(store.load("t1", "s1")[0]?.assignee).toBeUndefined();
  });

  test("claim assigns an unassigned pending card to the agent and moves it to in_progress", () => {
    const store = makeStore();
    store.replace("t1", "s1", [{ content: "first", status: "pending" }]);
    const card = store.claim("t1", "s1", "first", "agent-1");
    expect(card?.assignee).toBe("agent-1");
    expect(card?.status).toBe("in_progress");
    expect(store.load("t1", "s1")[0]?.assignee).toBe("agent-1");
  });

  test("claim fails when the card is assigned to another agent", () => {
    const store = makeStore();
    store.replace("t1", "s1", [{ content: "first", status: "pending", assignee: "agent-1" }]);
    expect(store.claim("t1", "s1", "first", "agent-2")).toBeNull();
    expect(store.load("t1", "s1")[0]?.assignee).toBe("agent-1");
  });

  test("claim is idempotent for the same agent", () => {
    const store = makeStore();
    store.replace("t1", "s1", [{ content: "first", status: "pending", assignee: "agent-1" }]);
    const card = store.claim("t1", "s1", "first", "agent-1");
    expect(card?.assignee).toBe("agent-1");
    expect(card?.status).toBe("in_progress");
  });

  test("claim with expectedStatus rejects a mismatched card", () => {
    const store = makeStore();
    store.replace("t1", "s1", [{ content: "first", status: "in_review" }]);
    expect(store.claim("t1", "s1", "first", "agent-1", "pending")).toBeNull();
    expect(store.claim("t1", "s1", "first", "agent-1", "in_review")?.assignee).toBe("agent-1");
  });

  test("claim on a non-existent card returns null", () => {
    const store = makeStore();
    expect(store.claim("t1", "s1", "missing", "agent-1")).toBeNull();
  });
});
