import { Type } from "typebox";
import type { Tool, ToolResult } from "./types";
import { JiePlatformError } from "../jie-platform-errors";
import type { KanbanStore } from "../storage";
import type { KanbanCardPatch } from "../types";

const KANBAN_UPDATE_DESCRIPTION = `Patch one existing kanban card. Prefer this for any change to a single card;
do not resend the whole board. The card is identified by its \`content\` string.
Mutable fields: \`status\`, \`todos\`, \`description\`, \`active_form\`, \`externalRef\`, \`assignee\`.
Omitted fields keep their existing values. Empty string \`""\` clears \`description\`, \`active_form\`, \`externalRef\`, or \`assignee\`.
\`todos\` is \`[{ text, done? }]\` — providing it replaces the checklist, matching \`text\` inherits prior \`done\`, and \`[]\` clears it.
To create or remove cards, or to rename the content, use \`write_kanban\` instead.`;

interface KanbanUpdateInput {
  content: string;
  status?: "pending" | "in_progress" | "in_review" | "completed";
  todos?: ReadonlyArray<{ text: string; done?: boolean }>;
  description?: string;
  active_form?: string;
  externalRef?: string;
  assignee?: string;
}

export function createKanbanUpdateTool(options: { kanbanStore: KanbanStore }): Tool<KanbanUpdateInput> {
  const { kanbanStore } = options;
  return {
    name: "update_kanban",
    description: KANBAN_UPDATE_DESCRIPTION,
    label: "Update Kanban Card",
    parameters: Type.Object({
      content: Type.String(),
      status: Type.Optional(
        Type.Union([Type.Literal("pending"), Type.Literal("in_progress"), Type.Literal("in_review"), Type.Literal("completed")]),
      ),
      todos: Type.Optional(
        Type.Array(
          Type.Object({
            text: Type.String(),
            done: Type.Optional(Type.Boolean()),
          }),
        ),
      ),
      description: Type.Optional(Type.String()),
      active_form: Type.Optional(Type.String()),
      externalRef: Type.Optional(Type.String()),
      assignee: Type.Optional(Type.String()),
    }),
    async execute(input: KanbanUpdateInput, context): Promise<ToolResult> {
      if (input.content.trim() === "") {
        throw new JiePlatformError("KANBAN_WRITE_INVALID", { detail: "empty content" });
      }
      if (input.todos !== undefined) validateTodos(input.todos);
      const patch: KanbanCardPatch = {
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.todos === undefined ? {} : { todos: input.todos }),
        ...(input.description === undefined ? {} : { description: input.description }),
        ...(input.active_form === undefined ? {} : { active_form: input.active_form }),
        ...(input.externalRef === undefined ? {} : { externalRef: input.externalRef }),
        ...(input.assignee === undefined ? {} : { assignee: input.assignee }),
      };
      const card = kanbanStore.update(context.teamId, context.sessionId, input.content, patch);
      if (card === null) {
        throw new JiePlatformError("KANBAN_CARD_NOT_FOUND", { detail: input.content });
      }
      const cards = kanbanStore.load(context.teamId, context.sessionId);
      return {
        content: `Updated kanban card: ${card.content}`,
        details: { kind: "kanban", cards },
      };
    },
  };
}

function validateTodos(todos: ReadonlyArray<{ text: string }>): void {
  const seen = new Set<string>();
  for (const todo of todos) {
    if (todo.text.trim() === "") {
      throw new JiePlatformError("KANBAN_WRITE_INVALID", { detail: "empty todo text" });
    }
    if (seen.has(todo.text)) {
      throw new JiePlatformError("KANBAN_WRITE_INVALID", { detail: `duplicate todo text: ${todo.text}` });
    }
    seen.add(todo.text);
  }
}
