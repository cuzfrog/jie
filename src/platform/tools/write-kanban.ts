import { Type } from "typebox";
import type { Tool, ToolResult } from "./types";
import { JiePlatformError } from "../jie-platform-errors";
import type { KanbanStore } from "../storage";
import type { KanbanCard, KanbanCardWrite } from "../types";

const KANBAN_WRITE_DESCRIPTION = `Replace the team kanban board with the full desired state.
Cards merge by \`content\` so existing ids stay stable; use this to create, remove, or rename cards.
For one-card edits, use \`update_kanban\`.
\`scope\` defaults to \`session\`. Omit \`todos\` to keep the existing checklist, \`[]\` clears it;
matching \`text\` inherits the prior \`done\` state.
Contract: no duplicate or empty \`content\`; no empty or duplicate \`text\` in the same card's \`todos\`.`;

interface KanbanWriteInput {
  cards: ReadonlyArray<KanbanCardWrite>;
}

export function createKanbanWriteTool(options: { kanbanStore: KanbanStore }): Tool<KanbanWriteInput> {
  const { kanbanStore } = options;
  return {
    name: "write_kanban",
    description: KANBAN_WRITE_DESCRIPTION,
    label: "Update Kanban",
    parameters: Type.Object({
      cards: Type.Array(
        Type.Object({
          content: Type.String({ minLength: 1 }),
          status: Type.Union([
            Type.Literal("pending"),
            Type.Literal("in_progress"),
            Type.Literal("in_review"),
            Type.Literal("completed"),
          ]),
          scope: Type.Optional(Type.Union([Type.Literal("team"), Type.Literal("session")])),
          externalRef: Type.Optional(Type.String()),
          active_form: Type.Optional(Type.String()),
          description: Type.Optional(Type.String()),
          assignee: Type.Optional(Type.String()),
          todos: Type.Optional(
            Type.Array(
              Type.Object({
                text: Type.String({ minLength: 1 }),
                done: Type.Optional(Type.Boolean()),
              }),
            ),
          ),
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
    if (card.todos !== undefined) validateTodos(card.todos);
  }
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

function buildSummary(cards: ReadonlyArray<KanbanCard>): string {
  const cardWord = cards.length === 1 ? "card" : "cards";
  const header = `Updated kanban: ${cards.length} ${cardWord}`;
  const inProgress = cards.filter((card) => card.status === "in_progress").length;
  const base = inProgress === 0 ? header : `${header}, ${inProgress} in progress`;
  const notes: string[] = [];
  for (const card of cards) {
    if (card.todos !== undefined && card.todos.length > 0 && card.todos.every((todo) => todo.done) && card.status !== "completed") {
      notes.push(`"${card.content}" has all todos done but is ${card.status}`);
    }
  }
  if (notes.length === 0) return base;
  return `${base}; note: ${notes.join("; note: ")}`;
}
