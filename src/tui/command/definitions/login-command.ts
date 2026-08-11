import { ProviderArgument } from "../arguments/provider-argument";
import { StringArgument } from "../arguments/string-argument";
import { PositionalSlashCommand } from "../positional-slash-command";
import type { ResolvedCommand, SlashCompletion, SlashContext } from "../slash-command";

const META = { name: "login", description: "store a provider API key", argumentHint: "<provider> <apiKey>", arguments: [{ name: "provider" }, { name: "apiKey" }] } as const;

export class LoginCommand extends PositionalSlashCommand {
  private readonly providerArgument: ProviderArgument;

  constructor() {
    const providerArgument = new ProviderArgument();
    super(META, [providerArgument, new StringArgument("apiKey")]);
    this.providerArgument = providerArgument;
  }

  protected override executeParsed(_context: SlashContext, parsed: Record<string, string | undefined>): ResolvedCommand {
    const provider = parsed.provider;
    const apiKey = parsed.apiKey;
    if (provider === undefined || apiKey === undefined) return this.usageError();
    return { kind: "platform", slashName: "login", command: { name: "login", provider, apiKey }, transient: `logged in to ${provider}` };
  }

  override complete(argumentText: string, context: SlashContext): SlashCompletion | Promise<SlashCompletion | null> | null {
    const spaceIndex = argumentText.indexOf(" ");
    if (spaceIndex === -1) return this.providerArgument.complete(argumentText, context);
    const rest = argumentText.slice(spaceIndex + 1);
    if (rest.trim() === "" || rest.includes(" ")) return null;
    return null;
  }
}
