import { EnumArgument } from "../arguments/enum-argument";
import { KanbanCardArgument } from "../arguments/kanban-card-argument";
import { StringArgument } from "../arguments/string-argument";
import { PositionalSlashCommand } from "../positional-slash-command";
import type { ResolvedCommand, SlashCompletion, SlashContext } from "../slash-command";

const META = { name: "kanban", description: "toggle the kanban panel", argumentHint: "<add|remove|complete|review|handoff>", arguments: [{ name: "subcommand", optional: true }, { name: "rest", optional: true, greedy: true }] } as const;

const SUBCOMMAND_ITEMS = [
  { value: "add", label: "add", description: "[--title <title>] <description>" },
  { value: "remove", label: "remove", description: "<cardId>" },
  { value: "complete", label: "complete", description: "<cardId>" },
  { value: "review", label: "review", description: "<cardId>" },
  { value: "handoff", label: "handoff", description: "[<teamId>/]<cardId> <targetTeamId>" },
] as const;

export class KanbanCommand extends PositionalSlashCommand {
  private readonly subcommandArgument: EnumArgument;

  constructor() {
    const subcommandArgument = new EnumArgument({ name: "subcommand", optional: true }, SUBCOMMAND_ITEMS);
    super(META, [subcommandArgument, new StringArgument("rest", { optional: true, greedy: true })]);
    this.subcommandArgument = subcommandArgument;
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
      case "remove":
        return this.resolveKanbanRemove(teamId, rest);
      case "complete":
        return this.resolveKanbanSetStatus(teamId, rest, "completed");
      case "review":
        return this.resolveKanbanSetStatus(teamId, rest, "in_review");
      case "handoff":
        return this.resolveKanbanHandoff(teamId, rest);
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
      if (subcommand === "remove" || subcommand === "complete" || subcommand === "review") {
        return this.completeCards(subcommand, "", context);
      }
      return this.subcommandArgument.complete(trimmed, context);
    }
    const subcommand = trimmed.slice(0, spaceIndex).toLowerCase();
    const rest = trimmed.slice(spaceIndex + 1).trim();
    if (subcommand === "add" || subcommand === "handoff") return null;
    if (subcommand !== "remove" && subcommand !== "complete" && subcommand !== "review") return null;
    return this.completeCards(subcommand, rest, context);
  }

  private completeCards(subcommand: "remove" | "complete" | "review", rest: string, context: SlashContext): SlashCompletion | null {
    const argument = new KanbanCardArgument(subcommand);
    const completion = argument.complete(rest, context);
    if (completion === null) return null;
    return { items: completion.items.map((item) => ({ ...item, value: `${subcommand} ${item.value}` })) };
  }

  private resolveKanbanAdd(teamId: string, rest: string): ResolvedCommand {
    const parsed = parseKanbanAddArgs(rest);
    if (parsed.kind === "error") return { kind: "error", text: parsed.text };
    return { kind: "platform", slashName: "kanban add", command: { name: "kanbanAdd", teamId, title: parsed.title, description: parsed.description, scope: parsed.scope } };
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
}

function parseKanbanAddArgs(args: string): { kind: "ok"; title?: string; description: string; scope?: "session" } | { kind: "error"; text: string } {
  const words = args.split(/\s+/).filter((s) => s !== "");
  const flags: { title?: string; ephemeral: boolean } = { ephemeral: false };
  let index = 0;
  while (index < words.length && words[index]!.startsWith("--")) {
    const flag = words[index]!;
    if (flag === "--title") {
      if (words[index + 1] === undefined) return { kind: "error", text: "/kanban add [--title <title>] <description>" };
      flags.title = words[index + 1]!;
      index += 2;
    } else if (flag === "--ephemeral") {
      flags.ephemeral = true;
      index += 1;
    } else {
      return { kind: "error", text: `/kanban add: unknown flag '${flag}'` };
    }
  }
  const description = words.slice(index).join(" ");
  if (description.trim() === "") return { kind: "error", text: "/kanban add [--ephemeral] [--title <title>] <description>" };
  return { kind: "ok", title: flags.title, description, ...(flags.ephemeral ? { scope: "session" as const } : {}) };
}
