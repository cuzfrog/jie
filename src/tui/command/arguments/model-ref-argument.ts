import { hasPrefix, isAlreadyComplete, MAX_SUGGESTIONS, type ArgumentSpec, type SlashArgument, type SlashCompletion, type SlashContext } from "../slash-command";

export class ModelRefArgument implements SlashArgument {
  readonly spec: ArgumentSpec;

  constructor() {
    this.spec = { name: "modelRef" };
  }

  async complete(prefix: string, context: SlashContext): Promise<SlashCompletion | null> {
    const filtered = await context.platform.execute({ name: "listFilteredModels" });
    const items = filtered.models.map((model) => ({
      value: `${model.provider}/${model.id}`,
      label: `${model.provider}/${model.id}`,
      description: model.name,
    }));
    if (isAlreadyComplete(items.map((item) => item.value), prefix)) return null;
    const matches = items.filter((item) => hasPrefix(item.value, prefix)).slice(0, MAX_SUGGESTIONS);
    return matches.length === 0 ? null : { items: matches, filteredOut: filtered.filteredOut > 0 ? filtered.filteredOut : undefined };
  }
}
