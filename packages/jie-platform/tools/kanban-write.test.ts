import type { KanbanCard } from "../types";
import { createKanbanWriteTool } from "./kanban-write";
import { makeEmptyContext } from "./_test-context";

describe("kanban_write", () => {
  test("is a utility tool, implicitly available to every agent", () => {
    const tool = createKanbanWriteTool();
    expect(tool.isUtility).toBe(true);
  });

  test("single in_progress card is accepted as the canonical shape", async () => {
    const tool = createKanbanWriteTool();
    const cards: KanbanCard[] = [{ content: "write tests", status: "in_progress", active_form: "Writing tests" }];
    const result = await tool.execute({ cards }, makeEmptyContext());
    expect(result.content).toContain("Updated kanban");
    expect(result.content).toContain("1 card");
    expect(result.details).toEqual({ kind: "kanban", cards });
  });

  test("mix of pending and completed cards without an in_progress one is accepted", async () => {
    const tool = createKanbanWriteTool();
    const cards: KanbanCard[] = [
      { content: "first", status: "completed" },
      { content: "second", status: "pending" },
    ];
    const result = await tool.execute({ cards }, makeEmptyContext());
    expect(result.details).toEqual({ kind: "kanban", cards });
    expect(result.content).not.toContain("in progress");
  });

  test("multiple in_progress cards are accepted — the board's WIP is not limited to one", async () => {
    const tool = createKanbanWriteTool();
    const cards: KanbanCard[] = [
      { content: "a", status: "in_progress" },
      { content: "b", status: "in_progress" },
    ];
    const result = await tool.execute({ cards }, makeEmptyContext());
    expect(result.details).toEqual({ kind: "kanban", cards });
    expect(result.content).toContain("2 in progress");
  });

  test("empty card list clears the board", async () => {
    const tool = createKanbanWriteTool();
    const result = await tool.execute({ cards: [] }, makeEmptyContext());
    expect(result.content).toContain("0 cards");
    expect(result.details).toEqual({ kind: "kanban", cards: [] });
  });

  test("duplicate content -> kanban_write_invalid", async () => {
    const tool = createKanbanWriteTool();
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
  });

  test("empty content -> kanban_write_invalid", async () => {
    const tool = createKanbanWriteTool();
    await expect(
      tool.execute({ cards: [{ content: "", status: "in_progress" }] }, makeEmptyContext()),
    ).rejects.toMatchObject({ code: "KANBAN_WRITE_INVALID" });
  });

  test("whitespace-only content is treated as empty -> kanban_write_invalid", async () => {
    const tool = createKanbanWriteTool();
    await expect(
      tool.execute({ cards: [{ content: "   \t\n  ", status: "in_progress" }] }, makeEmptyContext()),
    ).rejects.toMatchObject({ code: "KANBAN_WRITE_INVALID" });
  });

  test("LLM-facing content reports the card count and the in-progress count", async () => {
    const tool = createKanbanWriteTool();
    const result = await tool.execute(
      {
        cards: [
          { content: "implement diff view", status: "in_progress" },
          { content: "write docs", status: "pending" },
        ],
      },
      makeEmptyContext(),
    );
    expect(result.content).toBe("Updated kanban: 2 cards, 1 in progress");
  });

  test("details carries discriminator kind: 'kanban'", async () => {
    const tool = createKanbanWriteTool();
    const result = await tool.execute({ cards: [{ content: "x", status: "in_progress" }] }, makeEmptyContext());
    expect(result.details).toMatchObject({ kind: "kanban" });
  });
});
