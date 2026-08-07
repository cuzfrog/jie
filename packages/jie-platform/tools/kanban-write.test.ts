import type { KanbanCard, KanbanCardWrite } from "../types";
import type { KanbanStore } from "../storage";
import { createKanbanWriteTool } from "./kanban-write";
import { makeEmptyContext } from "./_test-context";

const kanbanStore = vi.mocked<KanbanStore>({
  load: vi.fn(),
  replace: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  setStatus: vi.fn(),
  editContent: vi.fn(),
  editDescription: vi.fn(),
});

function withIds(cards: ReadonlyArray<KanbanCardWrite>): KanbanCard[] {
  return cards.map((card, index) => ({ id: `#${index + 1}`, ...card }));
}

describe("kanban_write", () => {
  test("is a utility tool, implicitly available to every agent", () => {
    const tool = createKanbanWriteTool({ kanbanStore });
    expect(tool.isUtility).toBe(true);
  });

  test("replaces the board in the store scoped to the execution context", async () => {
    const cards: KanbanCardWrite[] = [{ content: "write tests", status: "in_progress", active_form: "Writing tests" }];
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
});
