import { Type } from "typebox";
import type { Tool, ToolResult } from "./types";
import { JiePlatformError } from "../jie-platform-errors";
import type { KanbanStore } from "../storage";
import type { KanbanStatus } from "../types";

const CLAIM_KANBAN_DESCRIPTION = `Attempt to claim one kanban card by its content. Only succeeds if the card is unassigned, already assigned to your agent key, or matches the optional expected status. Use this to coordinate work with sibling replicas; losers get a clear "not claimable" result and should do nothing.
If the card is currently \`pending\`, a successful claim also moves it to \`in_progress\` and sets the assignee to your agent key.
If \`expected_status\` is provided and the card is not in that status, the claim fails.
The returned details carry the board under \`kind: "kanban"\`.`;

interface ClaimKanbanInput {
  content: string;
  expected_status?: KanbanStatus;
}

export function createKanbanClaimTool(options: { kanbanStore: KanbanStore }): Tool<ClaimKanbanInput> {
  const { kanbanStore } = options;
  return {
    name: "claim_kanban",
    description: CLAIM_KANBAN_DESCRIPTION,
    label: "Claim Kanban Card",
    parameters: Type.Object({
      content: Type.String(),
      expected_status: Type.Optional(Type.Union([
        Type.Literal("pending"),
        Type.Literal("in_progress"),
        Type.Literal("in_review"),
        Type.Literal("completed"),
      ])),
    }),
    async execute(input: ClaimKanbanInput, context): Promise<ToolResult> {
      if (input.content.trim() === "") {
        throw new JiePlatformError("KANBAN_WRITE_INVALID", { detail: "empty content" });
      }
      const card = kanbanStore.claim(context.teamId, context.sessionId, input.content, context.agentKey, input.expected_status);
      const cards = kanbanStore.load(context.teamId, context.sessionId);
      if (card === null) {
        return {
          content: `Kanban card "${input.content}" is not claimable (unknown, wrong status, or already assigned to another agent).`,
          details: { kind: "kanban", cards },
        };
      }
      return {
        content: `Claimed kanban card "${card.content}".`,
        details: { kind: "kanban", cards },
      };
    },
  };
}
