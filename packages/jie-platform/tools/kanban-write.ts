import { Type } from "typebox";
import type { Tool, ToolResult } from "./types";
import { JiePlatformError } from "../jie-platform-errors";
import type { KanbanCard } from "../types";

const KANBAN_WRITE_DESCRIPTION = `Update the live kanban board. \`cards\` is the full board (it replaces, not
merges with, whatever the agent has now). Each card is \`{ content, status, active_form? }\`;
\`status\` is one of \`pending\`, \`in_progress\`, \`completed\` — the three board columns.
Contract:
- no duplicate \`content\` strings;
- no empty \`content\`.
The returned \`details\` carries the same board under \`kind: "kanban"\` so the TUI can render
the board from the same payload.`;

interface KanbanWriteInput {
  cards: ReadonlyArray<KanbanCard>;
}

export function createKanbanWriteTool(): Tool<KanbanWriteInput> {
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
        }),
      ),
    }),
    async execute(input: KanbanWriteInput): Promise<ToolResult> {
      validate(input.cards);
      const summary = buildSummary(input.cards);
      return {
        content: summary,
        details: { kind: "kanban", cards: input.cards },
      };
    },
  };
}

function validate(cards: ReadonlyArray<KanbanCard>): void {
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
