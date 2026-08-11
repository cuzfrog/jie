import { hasPrefix, isAlreadyComplete, MAX_SUGGESTIONS, type ArgumentSpec, type SlashArgument, type SlashCompletion, type SlashContext } from "../slash-command";

export class TeamIdArgument implements SlashArgument {
  readonly spec: ArgumentSpec;

  constructor() {
    this.spec = { name: "teamId" };
  }

  async complete(prefix: string, context: SlashContext): Promise<SlashCompletion | null> {
    const info = await context.platform.execute({ name: "getTeamInfo" });
    const items = info.installed.map((team) => ({
      value: team.id,
      label: team.id,
      description: team.id === info.defaultTeam ? "(default)" : team.agentCount === 1 ? "1 agent" : `${team.agentCount} agents`,
    }));
    if (isAlreadyComplete(items.map((item) => item.value), prefix)) return null;
    const matches = items.filter((item) => hasPrefix(item.value, prefix)).slice(0, MAX_SUGGESTIONS);
    return matches.length === 0 ? null : { items: matches };
  }
}
