import { Box, Text } from "@cuzfrog/jie-ink";
import type { SessionSummary as SessionInfo } from "@cuzfrog/jie-platform";
import type { JSX } from "react";
import { pickColor } from "../themes";

interface SessionListProps {
  readonly sessions: ReadonlyArray<SessionInfo>;
  readonly width: number;
  readonly focusedIndex: number;
}

export function SessionList({ sessions, width, focusedIndex }: SessionListProps): JSX.Element {
  if (sessions.length === 0) {
    return (
      <Box flexDirection="column" width={width} paddingX={1}>
        <Text color={pickColor("muted")}>No sessions</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" width={width} paddingX={1}>
      {sessions.map((session, index) => (
        <SessionRow
          key={session.sessionId}
          session={session}
          isFocused={index === focusedIndex}
          width={width}
        />
      ))}
    </Box>
  );
}

interface SessionRowProps {
  readonly session: SessionInfo;
  readonly isFocused: boolean;
  readonly width: number;
}

function SessionRow({ session, isFocused, width }: SessionRowProps): JSX.Element {
  const caret = isFocused ? ">" : " ";
  const count = `${session.messageCount} msg`;
  const when = formatRelativeAge(session.lastActivity);
  return (
    <Box flexDirection="row">
      <Text color={isFocused ? pickColor("accent") : undefined}>{caret} </Text>
      <Text color={isFocused ? pickColor("accent") : pickColor("text")}>
        {truncate(session.sessionId, width - count.length - when.length - 6)}
      </Text>
      <Box flexGrow={1} />
      <Text color={pickColor("muted")}>{count}</Text>
      <Text color={pickColor("muted")}> {when}</Text>
    </Box>
  );
}

function formatRelativeAge(iso: string): string {
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

function truncate(text: string, max: number): string {
  if (max <= 1) return "…";
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
