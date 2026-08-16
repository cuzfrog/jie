import { PositionalSlashCommand } from "../positional-slash-command";
import type { ResolvedCommand, SlashContext } from "../slash-command";

const META = { name: "new", description: "start a new session" } as const;

export class NewCommand extends PositionalSlashCommand {
  constructor() {
    super(META);
  }

  protected override executeParsed(context: SlashContext, _parsed: Record<string, string | undefined>): ResolvedCommand {
    const teamId = this.focusedTeamId(context);
    if (teamId === null) return { kind: "error", text: "/new: no team loaded" };
    return { kind: "platform", slashName: "new", command: { name: "newSession", teamId }, transient: "starting new session" };
  }
}
