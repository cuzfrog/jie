import { PositionalSlashCommand } from "../positional-slash-command";
import type { ResolvedCommand, SlashContext } from "../slash-command";

const META = { name: "clear", description: "clear the conversation", aliases: ["new"] } as const;

export class ClearCommand extends PositionalSlashCommand {
  constructor() {
    super(META, []);
  }

  protected override executeParsed(_context: SlashContext, _parsed: Record<string, string | undefined>): ResolvedCommand {
    return { kind: "ui", action: "clearState" };
  }
}
