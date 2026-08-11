import { LogoutArgument } from "../arguments/logout-argument";
import { PositionalSlashCommand } from "../positional-slash-command";
import type { ResolvedCommand, SlashContext } from "../slash-command";

const META = { name: "logout", description: "remove one or all API keys", argumentHint: "<provider>|*", arguments: [{ name: "provider" }] } as const;

export class LogoutCommand extends PositionalSlashCommand {
  constructor() {
    super(META, [new LogoutArgument()]);
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
}
