import { hasPrefix, isAlreadyComplete, MAX_SUGGESTIONS, type ArgumentSpec, type SlashArgument, type SlashCompletion, type SlashContext } from "../slash-command";

export class ModelFilterPatternArgument implements SlashArgument {
  readonly spec: ArgumentSpec;

  constructor() {
    this.spec = { name: "pattern" };
  }

  async complete(prefix: string, context: SlashContext): Promise<SlashCompletion | null> {
    const filters = await context.platform.execute({ name: "getModelFilters" });
    const items = filters.map((filter) => ({ value: filter, label: filter }));
    if (isAlreadyComplete(items.map((item) => item.value), prefix)) return null;
    const matches = items.filter((item) => hasPrefix(item.value, prefix)).slice(0, MAX_SUGGESTIONS);
    return matches.length === 0 ? null : { items: matches };
  }
}
