import type { KanbanCard } from "../types";
import type { KanbanStore } from "../storage";
import { createKanbanUpdateTool } from "./update-kanban";
import { makeEmptyContext } from "./_test-context";

const kanbanStore = vi.mocked<KanbanStore>({
  load: vi.fn(),
  replace: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  setStatus: vi.fn(),
  editContent: vi.fn(),
  editDescription: vi.fn(),
  handoff: vi.fn(),
  update: vi.fn(),
  claim: vi.fn(),
});

describe("update_kanban", () => {
  test("is a utility tool", () => {
    const tool = createKanbanUpdateTool({ kanbanStore });
    expect(tool.isUtility).toBe(true);
  });

  test("patches a card and returns the full board", async () => {
    kanbanStore.update.mockReturnValue({
      id: "#1",
      content: "build feature",
      status: "in_progress",
      todos: [{ text: "one", done: false }],
    });
    kanbanStore.load.mockReturnValue([
      { id: "#1", content: "build feature", status: "in_progress", todos: [{ text: "one", done: false }] },
    ]);
    const tool = createKanbanUpdateTool({ kanbanStore });
    const result = await tool.execute({ content: "build feature", todos: [{ text: "one" }] }, makeEmptyContext());
    expect(kanbanStore.update).toHaveBeenCalledWith("test-team", "test-session", "build feature", {
      todos: [{ text: "one" }],
    });
    expect(result.content).toBe("Updated kanban card: build feature");
    expect(result.details).toEqual({
      kind: "kanban",
      cards: [{ id: "#1", content: "build feature", status: "in_progress", todos: [{ text: "one", done: false }] }],
    });
  });

  test("rejects empty content", async () => {
    const tool = createKanbanUpdateTool({ kanbanStore });
    await expect(tool.execute({ content: "" }, makeEmptyContext())).rejects.toMatchObject({ code: "KANBAN_WRITE_INVALID" });
    expect(kanbanStore.update).not.toHaveBeenCalled();
  });

  test("rejects unknown card", async () => {
    kanbanStore.update.mockReturnValue(null);
    const tool = createKanbanUpdateTool({ kanbanStore });
    await expect(tool.execute({ content: "missing", status: "in_progress" }, makeEmptyContext())).rejects.toMatchObject({
      code: "KANBAN_CARD_NOT_FOUND",
    });
  });

  test("rejects empty todo text", async () => {
    const tool = createKanbanUpdateTool({ kanbanStore });
    await expect(tool.execute({ content: "build feature", todos: [{ text: "" }] }, makeEmptyContext())).rejects.toMatchObject({
      code: "KANBAN_WRITE_INVALID",
    });
    expect(kanbanStore.update).not.toHaveBeenCalled();
  });

  test("rejects duplicate todo text", async () => {
    const tool = createKanbanUpdateTool({ kanbanStore });
    await expect(tool.execute({ content: "build feature", todos: [{ text: "one" }, { text: "one" }] }, makeEmptyContext())).rejects.toMatchObject({
      code: "KANBAN_WRITE_INVALID",
    });
    expect(kanbanStore.update).not.toHaveBeenCalled();
  });

  test("passes assignee through to the store patch", async () => {
    const tool = createKanbanUpdateTool({ kanbanStore });
    kanbanStore.update.mockReturnValue({ id: "#1", content: "build feature", status: "pending" } as KanbanCard);
    await tool.execute({ content: "build feature", assignee: "implementer-1" }, makeEmptyContext());
    expect(kanbanStore.update).toHaveBeenCalledWith("test-team", "test-session", "build feature", { assignee: "implementer-1" });
  });
});
