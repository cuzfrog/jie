import { SessionIdArgument } from "../arguments/session-id-argument";
import { PositionalSlashCommand } from "../positional-slash-command";
import type { ResolvedCommand, SlashContext } from "../slash-command";

const META = { name: "resume", description: "resume a session of the loaded team", argumentHint: "<sessionId>", arguments: [{ name: "sessionId" }] } as const;

export class ResumeCommand extends PositionalSlashCommand {
  constructor() {
    super(META, [new SessionIdArgument()]);
  }

  protected override executeParsed(context: SlashContext, parsed: Record<string, string | undefined>): ResolvedCommand {
    const sessionId = parsed.sessionId;
    if (sessionId === undefined) return this.usageError();
    const teamId = this.focusedTeamId(context);
    if (teamId === null) return { kind: "error", text: "/resume: no team loaded" };
    return { kind: "platform", slashName: "resume", command: { name: "resumeSession", teamId, sessionId }, transient: `resuming session '${sessionId}'` };
  }
}
