import { parseModelRef } from "../../../platform";
import { PositionalSlashCommand } from "../positional-slash-command";
import { completeItems, type ResolvedCommand, type SlashCompletion, type SlashContext } from "../slash-command";

const META = { name: "model", description: "set the default model", argumentHint: "<provider>/<modelId>", arguments: [{ name: "modelRef" }] } as const;

export class ModelCommand extends PositionalSlashCommand {
  constructor() {
    super(META);
  }

  protected override executeParsed(_context: SlashContext, parsed: Record<string, string | undefined>): ResolvedCommand {
    const modelRef = parsed.modelRef;
    if (modelRef === undefined) return this.usageError();
    const parsedModel = parseModelRef(modelRef);
    if (parsedModel === null) return { kind: "error", text: `/model: invalid '${modelRef}' (expected <provider>/<modelId>)` };
    return {
      kind: "platform",
      slashName: "model",
      command: { name: "setDefaultModel", provider: parsedModel.provider, id: parsedModel.modelId },
      transient: `default model set to ${parsedModel.provider}/${parsedModel.modelId}`,
    };
  }

  protected override async completeArgument(argumentText: string, context: SlashContext): Promise<SlashCompletion | null> {
    const filtered = await context.platform.execute({ name: "listFilteredModels" });
    const items = filtered.models.map((model) => ({
      value: `${model.provider}/${model.id}`,
      label: `${model.provider}/${model.id}`,
      description: model.name,
    }));
    const completion = completeItems(items, argumentText.trim());
    if (completion === null) return null;
    return filtered.filteredOut > 0 ? { ...completion, filteredOut: filtered.filteredOut } : completion;
  }
}
