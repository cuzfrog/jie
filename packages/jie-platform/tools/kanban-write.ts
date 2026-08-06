import { Type } from "typebox";
import type { Tool, ToolResult } from "./types";
import { JiePlatformError } from "../jie-platform-errors";
import type { KanbanStore } from "../storage";
import type { KanbanCard, KanbanCardWrite } from "../types";

const KANBAN_WRITE_DESCRIPTION = `Update the live kanban board. \`cards\` is the full board (it replaces, not
merges with, whatever the agent has now). Each card is \`{ content, status, active_form?, description? }\`;
\`status\` is one of \`pending\`, \`in_progress\`, \`completed\` — the three board columns.
Contract:
- no duplicate \`content\` strings;
- no empty \`content\`.
The returned \`details\` carries the board under \`kind: "kanban"\` so the TUI can render
the board from the same payload. Cards already on the board keep their ids; new cards get
platform-assigned ids (e.g. \`#1\`).`;

interface KanbanWriteInput {
  cards: ReadonlyArray<KanbanCardWrite>;
}

export function createKanbanWriteTool(options: { kanbanStore: KanbanStore }): Tool<KanbanWriteInput> {
  const { kanbanStore } = options;
  return {
    name: "kanban_write",
    description: KANBAN_WRITE_DESCRIPTION,
    label: "Update Kanban",
    isUtility: true,
    parameters: Type.Object({
      cards: Type.Array(
        Type.Object({
          content: Type.String(),
          status: Type.Union([
            Type.Literal("pending"),
            Type.Literal("in_progress"),
            Type.Literal("completed"),
          ]),
          active_form: Type.Optional(Type.String()),
          description: Type.Optional(Type.String()),
        }),
      ),
    }),
    async execute(input: KanbanWriteInput, context): Promise<ToolResult> {
      validate(input.cards);
      const cards = kanbanStore.replace(context.teamId, context.sessionId, input.cards);
      const summary = buildSummary(cards);
      return {
        content: summary,
        details: { kind: "kanban", cards },
      };
    },
  };
}

function validate(cards: ReadonlyArray<KanbanCardWrite>): void {
  const seen = new Set<string>();
  for (const card of cards) {
    if (card.content.trim() === "") {
      throw new JiePlatformError("KANBAN_WRITE_INVALID", { detail: "empty content" });
    }
    if (seen.has(card.content)) {
      throw new JiePlatformError("KANBAN_WRITE_INVALID", { detail: `duplicate content: ${card.content}` });
    }
    seen.add(card.content);
  }
}

function buildSummary(cards: ReadonlyArray<KanbanCard>): string {
  const cardWord = cards.length === 1 ? "card" : "cards";
  const header = `Updated kanban: ${cards.length} ${cardWord}`;
  const inProgress = cards.filter((card) => card.status === "in_progress").length;
  if (inProgress === 0) return header;
  return `${header}, ${inProgress} in progress`;
}
