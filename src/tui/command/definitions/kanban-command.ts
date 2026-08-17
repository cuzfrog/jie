import type { KanbanCard } from "../../../platform";
import { PositionalSlashCommand } from "../positional-slash-command";
import { completeItems, type ResolvedCommand, type SlashCompletion, type SlashContext, type SlashCompletionItem } from "../slash-command";

const META = {
  name: "kanban",
  description: "toggle the kanban panel",
  argumentHint: "<add|clear|remove|complete|review|handoff|toggle>",
  arguments: [{ name: "subcommand", optional: true }, { name: "rest", optional: true, greedy: true }],
} as const;

const SUBCOMMAND_ITEMS = [
  { value: "add", label: "add", description: "[--team] [--title <title>] <description>" },
  { value: "clear", label: "clear", description: "remove all session-scoped cards" },
  { value: "remove", label: "remove", description: "<cardId>" },
  { value: "complete", label: "complete", description: "<cardId>" },
  { value: "review", label: "review", description: "<cardId>" },
  { value: "handoff", label: "handoff", description: "[<teamId>/]<cardId> <targetTeamId>" },
  { value: "toggle", label: "toggle", description: "<cardId> <todo text>" },
] as const;

export class KanbanCommand extends PositionalSlashCommand {
  constructor() {
    super(META);
  }

  protected override executeParsed(context: SlashContext, parsed: Record<string, string | undefined>): ResolvedCommand {
    const subcommand = parsed.subcommand;
    if (subcommand === undefined) return { kind: "ui", action: "cycleKanbanView" };
    const teamId = this.focusedTeamId(context);
    if (teamId === null) return { kind: "error", text: "/kanban: no team loaded" };
    const rest = parsed.rest ?? "";
    switch (subcommand.toLowerCase()) {
      case "add":
        return this.resolveKanbanAdd(teamId, rest);
      case "clear":
        return this.resolveKanbanClear(teamId, rest);
      case "remove":
        return this.resolveKanbanRemove(teamId, rest);
      case "complete":
        return this.resolveKanbanSetStatus(teamId, rest, "completed");
      case "review":
        return this.resolveKanbanSetStatus(teamId, rest, "in_review");
      case "handoff":
        return this.resolveKanbanHandoff(teamId, rest);
      case "toggle":
        return this.resolveKanbanToggle(teamId, rest);
      default:
        return { kind: "error", text: `/kanban: unknown subcommand '${subcommand}'` };
    }
  }

  override complete(argumentText: string, context: SlashContext): SlashCompletion | null {
    const trimmed = argumentText.trim();
    const spaceIndex = trimmed.indexOf(" ");
    if (spaceIndex === -1) {
      const subcommand = trimmed.toLowerCase();
      if (subcommand === "add" || subcommand === "handoff") return null;
      if (subcommand === "remove" || subcommand === "complete" || subcommand === "review" || subcommand === "toggle") {
        return this.completeCards(subcommand, "", context);
      }
      return completeItems(SUBCOMMAND_ITEMS, trimmed);
    }
    const subcommand = trimmed.slice(0, spaceIndex).toLowerCase();
    const rest = trimmed.slice(spaceIndex + 1).trim();
    if (subcommand === "add" || subcommand === "handoff") return null;
    if (subcommand !== "remove" && subcommand !== "complete" && subcommand !== "review" && subcommand !== "toggle") return null;
    return this.completeCards(subcommand, rest, context);
  }

  private completeCards(
    subcommand: "remove" | "complete" | "review" | "toggle",
    rest: string,
    context: SlashContext,
  ): SlashCompletion | null {
    const targetStatus = subcommand === "complete" ? "completed" : subcommand === "review" ? "in_review" : null;
    const hasTodos = subcommand === "toggle" ? (card: KanbanCard) => card.todos !== undefined && card.todos.length > 0 : () => true;
    const cards = context.state.kanban.board.filter((card) =>
      card.id.toLowerCase().includes(rest.toLowerCase()) && (targetStatus === null || card.status !== targetStatus) && hasTodos(card),
    );
    const items: ReadonlyArray<SlashCompletionItem> = cards.map((card) => ({
      value: card.id,
      label: card.id,
      description: card.content,
    }));
    const completion = completeItems(items, rest);
    if (completion === null) return null;
    return { items: completion.items.map((item) => ({ ...item, value: `${subcommand} ${item.value}` })) };
  }

  private resolveKanbanAdd(teamId: string, rest: string): ResolvedCommand {
    const parsed = parseKanbanAddArgs(rest);
    if (parsed.kind === "error") return { kind: "error", text: parsed.text };
    return {
      kind: "platform",
      slashName: "kanban add",
      command: { name: "kanbanAdd", teamId, title: parsed.title, description: parsed.description, scope: parsed.scope },
    };
  }

  private resolveKanbanClear(teamId: string, rest: string): ResolvedCommand {
    if (rest.trim() !== "") return { kind: "error", text: "/kanban clear takes no arguments" };
    return { kind: "platform", slashName: "kanban clear", command: { name: "kanbanClear", teamId } };
  }

  private resolveKanbanRemove(teamId: string, rest: string): ResolvedCommand {
    const cardId = rest.trim();
    if (cardId === "") return { kind: "error", text: "/kanban remove <cardId>" };
    return { kind: "platform", slashName: "kanban remove", command: { name: "kanbanRemove", teamId, cardId } };
  }

  private resolveKanbanSetStatus(teamId: string, rest: string, status: "completed" | "in_review"): ResolvedCommand {
    const subcommand = status === "completed" ? "complete" : "review";
    const cardId = rest.trim();
    if (cardId === "") return { kind: "error", text: `/kanban ${subcommand} <cardId>` };
    return { kind: "platform", slashName: `kanban ${subcommand}`, command: { name: "kanbanSetStatus", teamId, cardId, status } };
  }

  private resolveKanbanHandoff(teamId: string, rest: string): ResolvedCommand {
    const parts = rest.trim().split(/\s+/).filter((s) => s !== "");
    const cardId = parts[0];
    const targetTeamId = parts[1];
    if (cardId === undefined || targetTeamId === undefined) {
      return { kind: "error", text: "/kanban handoff [<teamId>/]<cardId> <targetTeamId>" };
    }
    return { kind: "platform", slashName: "kanban handoff", command: { name: "kanbanHandoff", teamId, cardId, targetTeamId } };
  }

  private resolveKanbanToggle(teamId: string, rest: string): ResolvedCommand {
    const trimmed = rest.trim();
    const spaceIndex = trimmed.indexOf(" ");
    if (spaceIndex === -1) {
      return { kind: "error", text: "/kanban toggle <cardId> <todo text>" };
    }
    const cardId = trimmed.slice(0, spaceIndex);
    const todo = trimmed.slice(spaceIndex + 1).trim();
    if (cardId === "" || todo === "") {
      return { kind: "error", text: "/kanban toggle <cardId> <todo text>" };
    }
    return { kind: "platform", slashName: "kanban toggle", command: { name: "kanbanToggleTodo", teamId, cardId, todo } };
  }
}

function parseKanbanAddArgs(args: string):
  | { kind: "ok"; title?: string; description: string; scope?: "team" }
  | { kind: "error"; text: string } {
  const words = args.split(/\s+/).filter((s) => s !== "");
  const flags: { title?: string; team: boolean } = { team: false };
  let index = 0;
  while (index < words.length && words[index]!.startsWith("--")) {
    const flag = words[index]!;
    if (flag === "--title") {
      if (words[index + 1] === undefined) return { kind: "error", text: "/kanban add [--team] [--title <title>] <description>" };
      flags.title = words[index + 1]!;
      index += 2;
    } else if (flag === "--team") {
      flags.team = true;
      index += 1;
    } else {
      return { kind: "error", text: `/kanban add: unknown flag '${flag}'` };
    }
  }
  const description = words.slice(index).join(" ");
  if (description.trim() === "") return { kind: "error", text: "/kanban add [--team] [--title <title>] <description>" };
  return { kind: "ok", title: flags.title, description, ...(flags.team ? { scope: "team" as const } : {}) };
}
