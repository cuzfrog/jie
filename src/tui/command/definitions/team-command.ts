import { TeamIdArgument } from "../arguments/team-id-argument";
import { PositionalSlashCommand } from "../positional-slash-command";
import type { ResolvedCommand, SlashContext } from "../slash-command";

const META = { name: "team", description: "switch the active team", argumentHint: "<teamId>", arguments: [{ name: "teamId" }] } as const;

export class TeamCommand extends PositionalSlashCommand {
  constructor() {
    super(META, [new TeamIdArgument()]);
  }

  protected override executeParsed(_context: SlashContext, parsed: Record<string, string | undefined>): ResolvedCommand {
    const teamId = parsed.teamId;
    if (teamId === undefined) return this.usageError();
    return { kind: "platform", slashName: "team", command: { name: "team", teamId }, transient: `loading team '${teamId}'` };
  }
}
