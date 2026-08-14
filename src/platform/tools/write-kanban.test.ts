import type { KanbanCard, KanbanCardWrite } from "../types";
import type { KanbanStore } from "../storage";
import { createKanbanWriteTool } from "./write-kanban";
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

function withIds(cards: ReadonlyArray<KanbanCardWrite>): KanbanCard[] {
  return cards.map((card, index) => ({
    id: `#${index + 1}`,
    content: card.content,
    status: card.status,
    ...(card.scope === undefined ? {} : { scope: card.scope }),
    ...(card.active_form === undefined ? {} : { active_form: card.active_form }),
    ...(card.description === undefined ? {} : { description: card.description }),
    ...(card.externalRef === undefined ? {} : { externalRef: card.externalRef }),
    ...(card.todos === undefined ? {} : { todos: card.todos.map((todo) => ({ text: todo.text, done: todo.done ?? false })) }),
  }));
}

describe("write_kanban", () => {
  test("replaces the board in the store scoped to the execution context", async () => {
    const cards: KanbanCardWrite[] = [{ content: "write tests", status: "in_progress", active_form: "Writing tests" }];
    kanbanStore.replace.mockReturnValue(withIds(cards));
    const tool = createKanbanWriteTool({ kanbanStore });
    const result = await tool.execute({ cards }, makeEmptyContext());
    expect(kanbanStore.replace).toHaveBeenCalledWith("test-team", "test-session", cards);
    expect(result.details).toEqual({ kind: "kanban", cards: withIds(cards) });
  });

  test("accepts an optional external reference", async () => {
    const cards: KanbanCardWrite[] = [{ content: "write tests", status: "in_progress", externalRef: "G#42" }];
    kanbanStore.replace.mockReturnValue(withIds(cards));
    const tool = createKanbanWriteTool({ kanbanStore });
    const result = await tool.execute({ cards }, makeEmptyContext());
    expect(kanbanStore.replace).toHaveBeenCalledWith("test-team", "test-session", cards);
    expect(result.details).toEqual({ kind: "kanban", cards: withIds(cards) });
  });

  test("accepts an optional assignee", async () => {
    const cards: KanbanCardWrite[] = [{ content: "write tests", status: "in_progress", assignee: "implementer-1" }];
    kanbanStore.replace.mockReturnValue(withIds(cards));
    const tool = createKanbanWriteTool({ kanbanStore });
    const result = await tool.execute({ cards }, makeEmptyContext());
    expect(kanbanStore.replace).toHaveBeenCalledWith("test-team", "test-session", cards);
    expect(result.details).toEqual({ kind: "kanban", cards: withIds(cards) });
  });

  test("accepts an optional session scope for ephemeral cards", async () => {
    const cards: KanbanCardWrite[] = [{ content: "write tests", status: "in_progress", scope: "session" }];
    kanbanStore.replace.mockReturnValue(withIds(cards));
    const tool = createKanbanWriteTool({ kanbanStore });
    const result = await tool.execute({ cards }, makeEmptyContext());
    expect(kanbanStore.replace).toHaveBeenCalledWith("test-team", "test-session", cards);
    expect(result.details).toEqual({ kind: "kanban", cards: withIds(cards) });
  });

  test("single in_progress card is accepted as the canonical shape", async () => {
    const cards: KanbanCardWrite[] = [{ content: "write tests", status: "in_progress", active_form: "Writing tests" }];
    kanbanStore.replace.mockReturnValue(withIds(cards));
    const tool = createKanbanWriteTool({ kanbanStore });
    const result = await tool.execute({ cards }, makeEmptyContext());
    expect(result.content).toContain("Updated kanban");
    expect(result.content).toContain("1 card");
  });

  test("in_review status is accepted as a valid column", async () => {
    const cards: KanbanCardWrite[] = [
      { content: "first", status: "in_review" },
      { content: "second", status: "pending" },
    ];
    kanbanStore.replace.mockReturnValue(withIds(cards));
    const tool = createKanbanWriteTool({ kanbanStore });
    const result = await tool.execute({ cards }, makeEmptyContext());
    expect(result.details).toEqual({ kind: "kanban", cards: withIds(cards) });
    expect(result.content).toContain("2 cards");
  });

  test("mix of pending and completed cards without an in_progress one is accepted", async () => {
    const cards: KanbanCardWrite[] = [
      { content: "first", status: "completed" },
      { content: "second", status: "pending" },
    ];
    kanbanStore.replace.mockReturnValue(withIds(cards));
    const tool = createKanbanWriteTool({ kanbanStore });
    const result = await tool.execute({ cards }, makeEmptyContext());
    expect(result.details).toEqual({ kind: "kanban", cards: withIds(cards) });
    expect(result.content).not.toContain("in progress");
  });

  test("multiple in_progress cards are accepted — the board's WIP is not limited to one", async () => {
    const cards: KanbanCardWrite[] = [
      { content: "a", status: "in_progress" },
      { content: "b", status: "in_progress" },
    ];
    kanbanStore.replace.mockReturnValue(withIds(cards));
    const tool = createKanbanWriteTool({ kanbanStore });
    const result = await tool.execute({ cards }, makeEmptyContext());
    expect(result.details).toEqual({ kind: "kanban", cards: withIds(cards) });
    expect(result.content).toContain("2 in progress");
  });

  test("empty card list clears the board", async () => {
    kanbanStore.replace.mockReturnValue([]);
    const tool = createKanbanWriteTool({ kanbanStore });
    const result = await tool.execute({ cards: [] }, makeEmptyContext());
    expect(result.content).toContain("0 cards");
    expect(result.details).toEqual({ kind: "kanban", cards: [] });
  });

  test("duplicate content -> kanban_write_invalid", async () => {
    const tool = createKanbanWriteTool({ kanbanStore });
    await expect(
      tool.execute(
        {
          cards: [
            { content: "same", status: "in_progress" },
            { content: "same", status: "pending" },
          ],
        },
        makeEmptyContext(),
      ),
    ).rejects.toMatchObject({ code: "KANBAN_WRITE_INVALID" });
    expect(kanbanStore.replace).not.toHaveBeenCalled();
  });

  test("empty content -> kanban_write_invalid", async () => {
    const tool = createKanbanWriteTool({ kanbanStore });
    await expect(
      tool.execute({ cards: [{ content: "", status: "in_progress" }] }, makeEmptyContext()),
    ).rejects.toMatchObject({ code: "KANBAN_WRITE_INVALID" });
  });

  test("whitespace-only content is treated as empty -> kanban_write_invalid", async () => {
    const tool = createKanbanWriteTool({ kanbanStore });
    await expect(
      tool.execute({ cards: [{ content: "   \t\n  ", status: "in_progress" }] }, makeEmptyContext()),
    ).rejects.toMatchObject({ code: "KANBAN_WRITE_INVALID" });
  });

  test("empty todo text -> kanban_write_invalid", async () => {
    const tool = createKanbanWriteTool({ kanbanStore });
    await expect(
      tool.execute({ cards: [{ content: "x", status: "in_progress", todos: [{ text: "" }] }] }, makeEmptyContext()),
    ).rejects.toMatchObject({ code: "KANBAN_WRITE_INVALID" });
    expect(kanbanStore.replace).not.toHaveBeenCalled();
  });

  test("duplicate todo text within a card -> kanban_write_invalid", async () => {
    const tool = createKanbanWriteTool({ kanbanStore });
    await expect(
      tool.execute({ cards: [{ content: "x", status: "in_progress", todos: [{ text: "one" }, { text: "one" }] }] }, makeEmptyContext()),
    ).rejects.toMatchObject({ code: "KANBAN_WRITE_INVALID" });
    expect(kanbanStore.replace).not.toHaveBeenCalled();
  });

  test("LLM-facing content reports the card count and the in-progress count", async () => {
    const cards: KanbanCardWrite[] = [
      { content: "implement diff view", status: "in_progress" },
      { content: "write docs", status: "pending" },
    ];
    kanbanStore.replace.mockReturnValue(withIds(cards));
    const tool = createKanbanWriteTool({ kanbanStore });
    const result = await tool.execute({ cards }, makeEmptyContext());
    expect(result.content).toBe("Updated kanban: 2 cards, 1 in progress");
  });

  test("details carries discriminator kind: 'kanban' and store-assigned ids", async () => {
    const cards: KanbanCardWrite[] = [{ content: "x", status: "in_progress" }];
    kanbanStore.replace.mockReturnValue(withIds(cards));
    const tool = createKanbanWriteTool({ kanbanStore });
    const result = await tool.execute({ cards }, makeEmptyContext());
    expect(result.details).toMatchObject({ kind: "kanban" });
    expect(result.details).toEqual({ kind: "kanban", cards: [{ id: "#1", content: "x", status: "in_progress" }] });
  });

  test("todos are accepted in card writes", async () => {
    const cards: KanbanCardWrite[] = [{ content: "x", status: "in_progress", todos: [{ text: "one" }] }];
    kanbanStore.replace.mockReturnValue(withIds(cards));
    const tool = createKanbanWriteTool({ kanbanStore });
    const result = await tool.execute({ cards }, makeEmptyContext());
    expect(kanbanStore.replace).toHaveBeenCalledWith("test-team", "test-session", cards);
    expect(result.details).toEqual({
      kind: "kanban",
      cards: [{ id: "#1", content: "x", status: "in_progress", todos: [{ text: "one", done: false }] }],
    });
  });

  test("summary hints when a card has all todos done but is not completed", async () => {
    const cards: KanbanCard[] = [
      { id: "#1", content: "x", status: "in_progress", todos: [{ text: "one", done: true }] },
      { id: "#2", content: "y", status: "pending" },
    ];
    kanbanStore.replace.mockReturnValue(cards);
    const tool = createKanbanWriteTool({ kanbanStore });
    const result = await tool.execute({ cards }, makeEmptyContext());
    expect(result.content).toBe(
      `Updated kanban: 2 cards, 1 in progress; note: "x" has all todos done but is in_progress`,
    );
  });
});
