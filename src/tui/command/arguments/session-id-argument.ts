import { hasPrefix, isAlreadyComplete, MAX_SUGGESTIONS, type ArgumentSpec, type SlashArgument, type SlashCompletion, type SlashContext } from "../slash-command";

export class SessionIdArgument implements SlashArgument {
  readonly spec: ArgumentSpec;

  constructor() {
    this.spec = { name: "sessionId" };
  }

  async complete(prefix: string, context: SlashContext): Promise<SlashCompletion | null> {
    const teamId = context.state.teamId;
    if (teamId === null) return null;
    const sessions = await context.platform.execute({ name: "listSessions", teamId });
    const items = sessions.map((session) => ({
      value: session.sessionId,
      label: session.name ?? session.sessionId,
      description: `${session.messageCount} msg · ${relativeAge(session.lastActivity)}`,
    }));
    if (isAlreadyComplete(items.map((item) => item.value), prefix)) return null;
    const matches = items
      .filter((session) => hasPrefix(session.value, prefix) || hasPrefix(session.label, prefix))
      .slice(0, MAX_SUGGESTIONS);
    return matches.length === 0 ? null : { items: matches };
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
