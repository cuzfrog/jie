import { PositionalSlashCommand } from "../positional-slash-command";
import { completeItems, type ResolvedCommand, type SlashCompletion, type SlashContext } from "../slash-command";

const META = { name: "team", description: "switch the active team", argumentHint: "<teamId>", arguments: [{ name: "teamId" }] } as const;

export class TeamCommand extends PositionalSlashCommand {
  constructor() {
    super(META);
  }

  protected override executeParsed(_context: SlashContext, parsed: Record<string, string | undefined>): ResolvedCommand {
    const teamId = parsed.teamId;
    if (teamId === undefined) return this.usageError();
    return { kind: "platform", slashName: "team", command: { name: "team", teamId }, transient: `loading team '${teamId}'` };
  }

  protected override async completeArgument(argumentText: string, context: SlashContext): Promise<SlashCompletion | null> {
    const info = await context.platform.execute({ name: "getTeamInfo" });
    const items = info.installed.map((team) => {
      const defaultTag = team.id === info.defaultTeam ? " (default)" : "";
      const count = team.agentCount === 1 ? "1 agent" : `${team.agentCount} agents`;
      const description = team.description ? ` · ${team.description}` : "";
      const base = `${count}${description}`;
      return {
        value: team.id,
        label: team.id,
        description: `${base}${defaultTag}`,
      };
    });
    return completeItems(items, argumentText.trim());
  }
}
