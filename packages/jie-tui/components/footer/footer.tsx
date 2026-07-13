import { Box, Text } from "@cuzfrog/jie-ink";
import type { JSX } from "react";
import { useTuiContext, useFocusedAgent } from "../context";
import { formatQueueIndicator, pickColor } from "../themes";
import { contextPercentColor, formatContextPercent } from "./context-percent";

interface FooterProps {
  readonly cwd: string;
  readonly gitBranch: string;
  readonly gitDirty: boolean;
}

const HINT_HIDDEN = "shift&← show agents";
const HINT_VISIBLE = "shift&↑↓ switch agent  shift&← close agents";

export function Footer({ cwd, gitBranch, gitDirty }: FooterProps): JSX.Element {
  const { state } = useTuiContext();
  const focusedAgent = useFocusedAgent();
  const leftIdentity = `${cwd} (${gitBranch.length > 0 ? gitBranch : "main"}${gitDirty ? "*" : ""})`;
  const teamSegment = state.teamId ?? "no-team";
  const focusedSegment = focusedAgent === null ? "—" : focusedAgent.agentKey;
  const rightIdentity = `${teamSegment}:${focusedSegment}`;
  const hint = state.showTeamRailPanel ? HINT_VISIBLE : HINT_HIDDEN;
  const modelSegment = modelSegmentText(focusedAgent);
  const queueSegment = formatQueueIndicator(focusedAgent?.queue);
  const contextSegment = contextSegmentText(focusedAgent);
  const contextColor = contextSegmentColor(focusedAgent);

  return (
    <Box flexDirection="column" width="100%">
      <Box flexDirection="row" justifyContent="space-between" width="100%">
        <Text color={pickColor("accent")}>{leftIdentity}</Text>
        <Text color={pickColor("muted")}>{rightIdentity}</Text>
      </Box>
      <Box flexDirection="row" width="100%">
        <Text color={pickColor(contextColor)}>{contextSegment}</Text>
        <Box flexGrow={1} />
        <Text color={pickColor("muted")}>{hint}</Text>
        <Box flexGrow={1} />
        {queueSegment !== null ? <Text color={pickColor("warning")}>{queueSegment}</Text> : null}
        <Text color={pickColor("muted")}>{modelSegment}</Text>
      </Box>
    </Box>
  );
}

function modelSegmentText(focused: ReturnType<typeof useFocusedAgent>): string {
  if (focused === null || focused.model === null) return "—";
  const m = focused.model;
  return `(${m.provider}) ${m.id} | ${m.effort}`;
}

function contextSegmentText(focused: ReturnType<typeof useFocusedAgent>): string {
  if (focused === null || focused.model === null) return "—";
  return formatContextPercent(focused.contextTokensUsed, focused.model.contextWindow);
}

function contextSegmentColor(focused: ReturnType<typeof useFocusedAgent>): "muted" | "warning" | "error" {
  if (focused === null || focused.model === null) return "muted";
  return contextPercentColor(focused.contextTokensUsed, focused.model.contextWindow);
}
