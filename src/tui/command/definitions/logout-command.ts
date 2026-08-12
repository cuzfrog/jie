import { PositionalSlashCommand } from "../positional-slash-command";
import { completeItems, type ResolvedCommand, type SlashCompletion, type SlashContext } from "../slash-command";

const META = { name: "logout", description: "remove one or all API keys", argumentHint: "<provider>|*", arguments: [{ name: "provider" }] } as const;

export class LogoutCommand extends PositionalSlashCommand {
  constructor() {
    super(META);
  }

  protected override executeParsed(_context: SlashContext, parsed: Record<string, string | undefined>): ResolvedCommand {
    const provider = parsed.provider;
    if (provider === undefined) return this.usageError();
    return {
      kind: "platform",
      slashName: "logout",
      command: { name: "logout", provider },
      transient: provider === "*" ? "logged out of all providers" : `logged out of ${provider}`,
    };
  }

  protected override async completeArgument(argumentText: string, context: SlashContext): Promise<SlashCompletion | null> {
    const providers = await context.platform.execute({ name: "listProviders" });
    const items = [
      { value: "*", label: "*", description: "all providers" },
      ...providers.map((provider) => ({ value: provider.id, label: provider.id, description: provider.description })),
    ];
    return completeItems(items, argumentText.trim());
  }
}
