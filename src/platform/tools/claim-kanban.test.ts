import type { KanbanStore } from "../storage";
import type { KanbanCard } from "../types";
import { createKanbanClaimTool } from "./claim-kanban";
import { makeEmptyContext } from "./_test-context";

function card(content: string, status: KanbanCard["status"], assignee?: string): KanbanCard {
  return {
    id: "#1",
    content,
    status,
    scope: "team",
    ...(assignee === undefined ? {} : { assignee }),
  };
}

describe("claim_kanban", () => {
  test("is a utility tool", () => {
    const tool = createKanbanClaimTool({ kanbanStore: makeKanbanStore([]) });
    expect(tool.isUtility).toBe(true);
  });

  test("successful claim reports the card and returns the board", async () => {
    const store = makeKanbanStore([card("build", "pending")]);
    const tool = createKanbanClaimTool({ kanbanStore: store });
    const result = await tool.execute({ content: "build" }, makeEmptyContext());
    expect(result.content).toContain("Claimed kanban card");
    expect(result.details).toEqual({ kind: "kanban", cards: store.load("test-team", "test-session") });
    expect(store.load("test-team", "test-session")[0]?.assignee).toBe("general-1");
  });

  test("failed claim reports that the card is not claimable", async () => {
    const store = makeKanbanStore([card("build", "pending", "other-1")]);
    const tool = createKanbanClaimTool({ kanbanStore: store });
    const result = await tool.execute({ content: "build" }, makeEmptyContext());
    expect(result.content).toContain("not claimable");
    expect(result.details).toEqual({ kind: "kanban", cards: store.load("test-team", "test-session") });
  });

  test("unknown card content is not claimable", async () => {
    const store = makeKanbanStore([]);
    const tool = createKanbanClaimTool({ kanbanStore: store });
    const result = await tool.execute({ content: "missing" }, makeEmptyContext());
    expect(result.content).toContain("not claimable");
  });

  test("empty content throws KANBAN_WRITE_INVALID", async () => {
    const store = makeKanbanStore([]);
    const tool = createKanbanClaimTool({ kanbanStore: store });
    await expect(tool.execute({ content: "" }, makeEmptyContext())).rejects.toMatchObject({ code: "KANBAN_WRITE_INVALID" });
  });
});

function makeKanbanStore(cards: KanbanCard[]): KanbanStore {
  const store: KanbanStore = {
    load: () => cards,
    replace: (_teamId, _sessionId, incoming) => {
      cards = incoming as KanbanCard[];
      return cards;
    },
    add: () => null,
    remove: () => false,
    setStatus: () => false,
    editContent: () => null,
    editDescription: () => null,
    handoff: () => null,
    update: () => null,
    claim: (_teamId, _sessionId, content, agentKey, expectedStatus) => {
      const index = cards.findIndex((c) => c.content === content);
      if (index === -1) return null;
      const card = cards[index]!;
      if (expectedStatus !== undefined && card.status !== expectedStatus) return null;
      if (card.assignee !== undefined && card.assignee !== "" && card.assignee !== agentKey) return null;
      const next = { ...card, assignee: agentKey, ...(card.status === "pending" ? { status: "in_progress" as const } : {}) };
      cards = cards.map((c, i) => (i === index ? next : c));
      return next;
    },
  };
  return store;
}
