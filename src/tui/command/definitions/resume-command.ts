import { PositionalSlashCommand } from "../positional-slash-command";
import { completeItems, type ResolvedCommand, type SlashCompletion, type SlashContext, type SlashCompletionItem } from "../slash-command";

const META = { name: "resume", description: "resume a session of the loaded team", argumentHint: "<sessionId>", arguments: [{ name: "sessionId" }] } as const;

export class ResumeCommand extends PositionalSlashCommand {
  constructor() {
    super(META);
  }

  protected override executeParsed(context: SlashContext, parsed: Record<string, string | undefined>): ResolvedCommand {
    const sessionId = parsed.sessionId;
    if (sessionId === undefined) return this.usageError();
    const teamId = this.focusedTeamId(context);
    if (teamId === null) return { kind: "error", text: "/resume: no team loaded" };
    return { kind: "platform", slashName: "resume", command: { name: "resumeSession", teamId, sessionId }, transient: `resuming session '${sessionId}'` };
  }

  protected override async completeArgument(argumentText: string, context: SlashContext): Promise<SlashCompletion | null> {
    const teamId = context.state.teamId;
    if (teamId === null) return null;
    const sessions = await context.platform.execute({ name: "listSessions", teamId });
    const items: ReadonlyArray<SlashCompletionItem> = sessions.map((session) => ({
      value: session.sessionId,
      label: session.name ?? session.sessionId,
      description: `${session.messageCount} msg · ${relativeAge(session.lastActivity)}`,
    }));
    return completeItems(items, argumentText.trim(), (item, prefix) => {
      const needle = prefix.toLowerCase();
      return item.value.toLowerCase().includes(needle) || item.label.toLowerCase().includes(needle);
    });
  }
}

function relativeAge(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}
