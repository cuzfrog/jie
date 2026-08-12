import { PositionalSlashCommand } from "../positional-slash-command";
import { completeItems, type ResolvedCommand, type SlashCompletion, type SlashContext } from "../slash-command";

const META = { name: "login", description: "store a provider API key", argumentHint: "<provider> <apiKey>", arguments: [{ name: "provider" }, { name: "apiKey" }] } as const;

export class LoginCommand extends PositionalSlashCommand {
  constructor() {
    super(META);
  }

  protected override executeParsed(_context: SlashContext, parsed: Record<string, string | undefined>): ResolvedCommand {
    const provider = parsed.provider;
    const apiKey = parsed.apiKey;
    if (provider === undefined || apiKey === undefined) return this.usageError();
    return { kind: "platform", slashName: "login", command: { name: "login", provider, apiKey }, transient: `logged in to ${provider}` };
  }

  override async complete(argumentText: string, context: SlashContext): Promise<SlashCompletion | null> {
    const spaceIndex = argumentText.indexOf(" ");
    if (spaceIndex === -1) {
      const providers = await context.platform.execute({ name: "listProviders" });
      const items = providers.map((provider) => ({ value: provider.id, label: provider.id, description: provider.description }));
      return completeItems(items, argumentText);
    }
    const rest = argumentText.slice(spaceIndex + 1);
    if (rest.trim() === "" || rest.includes(" ")) return null;
    return null;
  }
}
