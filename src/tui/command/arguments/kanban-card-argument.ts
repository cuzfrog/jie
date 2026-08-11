import { hasPrefix, isAlreadyComplete, MAX_SUGGESTIONS, type ArgumentSpec, type SlashArgument, type SlashCompletion, type SlashContext } from "../slash-command";

export class KanbanCardArgument implements SlashArgument {
  readonly spec: ArgumentSpec;
  private readonly subcommand: "remove" | "complete" | "review";

  constructor(subcommand: "remove" | "complete" | "review") {
    this.spec = { name: "cardId" };
    this.subcommand = subcommand;
  }

  complete(prefix: string, context: SlashContext): SlashCompletion | null {
    const targetStatus = this.subcommand === "complete" ? "completed" : this.subcommand === "review" ? "in_review" : null;
    const cards = context.state.kanban.board.filter((card) => hasPrefix(card.id, prefix) && (targetStatus === null || card.status !== targetStatus));
    const items = cards.slice(0, MAX_SUGGESTIONS).map((card) => ({ value: card.id, label: card.id, description: card.content }));
    if (isAlreadyComplete(items.map((item) => item.value), prefix)) return null;
    return items.length === 0 ? null : { items };
  }
}
