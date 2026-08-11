import { PositionalSlashCommand } from "../positional-slash-command";
import type { ResolvedCommand, SlashContext } from "../slash-command";

const META = { name: "rename", description: "name the active session", argumentHint: "<name>", arguments: [{ name: "name", greedy: true }] } as const;

export class RenameCommand extends PositionalSlashCommand {
  constructor() {
    super(META);
  }

  protected override executeParsed(context: SlashContext, parsed: Record<string, string | undefined>): ResolvedCommand {
    const name = parsed.name;
    if (name === undefined || name === "") return this.usageError();
    const teamId = this.focusedTeamId(context);
    if (teamId === null) return { kind: "error", text: "/rename: no team loaded" };
    return { kind: "platform", slashName: "rename", command: { name: "renameSession", teamId, sessionName: name }, transient: `session renamed to ${name}` };
  }
}
