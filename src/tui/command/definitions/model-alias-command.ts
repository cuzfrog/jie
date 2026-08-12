import { parseModelRef } from "../../../platform";
import { PositionalSlashCommand } from "../positional-slash-command";
import { completeItems, type ResolvedCommand, type SlashCompletion, type SlashContext, type SlashCompletionItem } from "../slash-command";

const META = {
  name: "model-alias",
  description: "set or list model aliases",
  argumentHint: "[<alias> <provider/modelId>]",
  arguments: [{ name: "alias", optional: true }, { name: "modelRef", optional: true, greedy: true }],
} as const;

const ALIASES = ["large", "medium", "small"] as const;
type Alias = (typeof ALIASES)[number];

const ALIAS_ITEMS: ReadonlyArray<SlashCompletionItem> = ALIASES.map((alias) => ({ value: alias, label: alias }));

export class ModelAliasCommand extends PositionalSlashCommand {
  constructor() {
    super(META);
  }

  protected override executeParsed(context: SlashContext, parsed: Record<string, string | undefined>): ResolvedCommand | Promise<ResolvedCommand> {
    const alias = parsed.alias;
    if (alias === undefined) return this.queryAliases(context);
    if (!isAlias(alias)) return { kind: "error", text: `/model-alias: unknown alias '${alias}' (expected ${ALIASES.join(" | ")})` };
    const modelRef = parsed.modelRef;
    if (modelRef === undefined) return { kind: "error", text: "/model-alias <large|medium|small> <provider>/<modelId>" };
    const parsedModel = parseModelRef(modelRef);
    if (parsedModel === null) return { kind: "error", text: `/model-alias: invalid '${modelRef}' (expected <provider>/<modelId>)` };
    return {
      kind: "platform",
      slashName: "model-alias",
      command: { name: "setModelAlias", alias, provider: parsedModel.provider, id: parsedModel.modelId },
      transient: `model alias '${alias}' set to ${parsedModel.provider}/${parsedModel.modelId}`,
    };
  }

  override complete(argumentText: string, context: SlashContext): SlashCompletion | Promise<SlashCompletion | null> | null {
    const trimmed = argumentText.trim();
    const spaceIndex = trimmed.indexOf(" ");
    if (spaceIndex === -1) return completeItems(ALIAS_ITEMS, trimmed);
    const alias = trimmed.slice(0, spaceIndex).toLowerCase();
    const rest = trimmed.slice(spaceIndex + 1).trim();
    if (!isAlias(alias) || rest.includes(" ")) return null;
    return this.completeModelRef(alias, rest, context);
  }

  private async completeModelRef(alias: Alias, rest: string, context: SlashContext): Promise<SlashCompletion | null> {
    const filtered = await context.platform.execute({ name: "listFilteredModels" });
    const items = filtered.models.map((model) => ({
      value: `${model.provider}/${model.id}`,
      label: `${model.provider}/${model.id}`,
      description: model.name,
    }));
    const completion = completeItems(items, rest);
    if (completion === null) return null;
    const result = { items: completion.items.map((item) => ({ ...item, value: `${alias} ${item.value}` })) };
    return filtered.filteredOut > 0 ? { ...result, filteredOut: filtered.filteredOut } : result;
  }

  private async queryAliases(context: SlashContext): Promise<ResolvedCommand> {
    try {
      const [aliases, defaultModel] = await Promise.all([
        context.platform.execute({ name: "getModelAliases" }),
        context.platform.execute({ name: "getDefaultModel" }),
      ]);
      const defaultText = defaultModel === null ? "unset" : `${defaultModel.provider}/${defaultModel.id}`;
      if (aliases.length === 0) return { kind: "reply", text: `no model aliases set; default: ${defaultText}` };
      const aliasText = aliases.map((row) => `${row.alias}=${row.modelRef}`).join(", ");
      return { kind: "reply", text: `model aliases: ${aliasText}; default: ${defaultText}` };
    } catch (error) {
      return { kind: "error", text: formatError("model-alias", error) };
    }
  }
}

function isAlias(value: string): value is Alias {
  return (ALIASES as ReadonlyArray<string>).includes(value);
}

function formatError(slashName: string, error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  return `/${slashName} failed: ${reason}`;
}
