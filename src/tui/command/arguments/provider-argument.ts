import { hasPrefix, isAlreadyComplete, MAX_SUGGESTIONS, type ArgumentSpec, type SlashArgument, type SlashCompletion, type SlashContext } from "../slash-command";

export class ProviderArgument implements SlashArgument {
  readonly spec: ArgumentSpec;

  constructor() {
    this.spec = { name: "provider" };
  }

  async complete(prefix: string, context: SlashContext): Promise<SlashCompletion | null> {
    const providers = await context.platform.execute({ name: "listProviders" });
    const items = providers.map((provider) => ({ value: provider.id, label: provider.id, description: provider.description }));
    if (isAlreadyComplete(items.map((item) => item.value), prefix)) return null;
    const matches = items.filter((item) => hasPrefix(item.value, prefix)).slice(0, MAX_SUGGESTIONS);
    return matches.length === 0 ? null : { items: matches };
  }
}
