import type { SessionSummary } from "@cuzfrog/jie-platform";

export function filterSessions(query: string, sessions: ReadonlyArray<SessionSummary>): ReadonlyArray<SessionSummary> {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") return sessions;
  const startsWith: SessionSummary[] = [];
  const contains: SessionSummary[] = [];
  for (const session of sessions) {
    const id = session.sessionId.toLowerCase();
    if (id.startsWith(trimmed)) startsWith.push(session);
    else if (id.includes(trimmed)) contains.push(session);
  }
  return [...startsWith, ...contains];
}
