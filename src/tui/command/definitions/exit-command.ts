import { PositionalSlashCommand } from "../positional-slash-command";
import type { ResolvedCommand, SlashContext } from "../slash-command";

const META = { name: "exit", description: "quit jie" } as const;

export class ExitCommand extends PositionalSlashCommand {
  constructor() {
    super(META, []);
  }

  protected override executeParsed(_context: SlashContext, _parsed: Record<string, string | undefined>): ResolvedCommand {
    return { kind: "ui", action: "stop" };
  }
}
