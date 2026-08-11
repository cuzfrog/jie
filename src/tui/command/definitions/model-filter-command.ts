import { PositionalSlashCommand } from "../positional-slash-command";
import { completeItems, type ResolvedCommand, type SlashCompletion, type SlashContext } from "../slash-command";

const META = { name: "model-filter", description: "filter the /model list", argumentHint: "<add|remove|list> <pattern>", arguments: [{ name: "action" }, { name: "pattern", optional: true }] } as const;
const MODEL_FILTER_USAGE = "/model-filter <add|remove|list> <pattern>";

const ACTION_ITEMS = [
  { value: "add", label: "add" },
  { value: "remove", label: "remove" },
  { value: "list", label: "list" },
] as const;

export class ModelFilterCommand extends PositionalSlashCommand {
  constructor() {
    super(META);
  }

  protected override executeParsed(context: SlashContext, parsed: Record<string, string | undefined>): ResolvedCommand | Promise<ResolvedCommand> {
    const action = parsed.action;
    if (action === undefined) return { kind: "error", text: MODEL_FILTER_USAGE };
    if (action === "list") {
      return parsed.pattern === undefined ? this.queryModelFilterList(context) : { kind: "error", text: MODEL_FILTER_USAGE };
    }
    const pattern = parsed.pattern;
    if (pattern === undefined || pattern === "") return { kind: "error", text: MODEL_FILTER_USAGE };
    if (action !== "add" && action !== "remove") return { kind: "error", text: MODEL_FILTER_USAGE };
    return action === "add" ? this.addModelFilter(context, pattern) : this.removeModelFilter(context, pattern);
  }

  override async complete(argumentText: string, context: SlashContext): Promise<SlashCompletion | null> {
    const trimmed = argumentText.trim();
    const spaceIndex = trimmed.indexOf(" ");
    if (spaceIndex === -1) {
      const action = trimmed.toLowerCase();
      if (action === "remove") return this.completePatterns("", context);
      if (action === "add" || action === "list") return null;
      return completeItems(ACTION_ITEMS, trimmed);
    }
    const action = trimmed.slice(0, spaceIndex).toLowerCase();
    const rest = trimmed.slice(spaceIndex + 1).trim();
    if (action !== "remove" || rest.includes(" ")) return null;
    return this.completePatterns(rest, context);
  }

  private async completePatterns(rest: string, context: SlashContext): Promise<SlashCompletion | null> {
    const filters = await context.platform.execute({ name: "getModelFilters" });
    const items = filters.map((filter) => ({ value: filter, label: filter }));
    const completion = completeItems(items, rest);
    if (completion === null) return null;
    return { items: completion.items.map((item) => ({ ...item, value: `remove ${item.value}` })) };
  }

  private async queryModelFilterList(context: SlashContext): Promise<ResolvedCommand> {
    try {
      const filters = await context.platform.execute({ name: "getModelFilters" });
      const text = filters.length === 0 ? "no model filters set" : `model filters: ${filters.join(" · ")}`;
      return { kind: "reply", text };
    } catch (error) {
      return { kind: "error", text: formatError("model-filter", error) };
    }
  }

  private async addModelFilter(context: SlashContext, pattern: string): Promise<ResolvedCommand> {
    try {
      const filters = await context.platform.execute({ name: "getModelFilters" });
      const next = filters.includes(pattern) ? filters : [...filters, pattern];
      if (next === filters) {
        return { kind: "platform", slashName: "model-filter", command: { name: "setModelFilters", filters: next }, transient: `model filter added: ${pattern}` };
      }
      const rejection = await context.platform.execute({ name: "validateModelFilter", pattern, existingFilters: filters });
      if (rejection !== null) return { kind: "error", text: rejection };
      return { kind: "platform", slashName: "model-filter", command: { name: "setModelFilters", filters: next }, transient: `model filter added: ${pattern}` };
    } catch (error) {
      return { kind: "error", text: formatError("model-filter", error) };
    }
  }

  private async removeModelFilter(context: SlashContext, pattern: string): Promise<ResolvedCommand> {
    try {
      const filters = await context.platform.execute({ name: "getModelFilters" });
      if (!filters.includes(pattern)) {
        return { kind: "error", text: `/model-filter: pattern '${pattern}' is not set` };
      }
      const next = filters.filter((existing) => existing !== pattern);
      return { kind: "platform", slashName: "model-filter", command: { name: "setModelFilters", filters: next }, transient: `model filter removed: ${pattern}` };
    } catch (error) {
      return { kind: "error", text: formatError("model-filter", error) };
    }
  }
}

function formatError(slashName: string, error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  return `/${slashName} failed: ${reason}`;
}
