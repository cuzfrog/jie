import { Box, Text } from "ink";
import { useTuiContext, useFocusedAgent } from "../context";
import { pickColor } from "../themes";

interface FooterProps {
  readonly cwd: string;
  readonly gitBranch: string;
  readonly gitDirty: boolean;
}

const HINT_HIDDEN = "ctrl+left for agents";
const HINT_VISIBLE = "ctrl+↑↓ switch agent  ctrl+left close agents";

export function Footer({ cwd, gitBranch, gitDirty }: FooterProps): JSX.Element {
  const { state } = useTuiContext();
  const focusedAgent = useFocusedAgent();
  const leftIdentity = `${cwd} (${gitBranch.length > 0 ? gitBranch : "main"}${gitDirty ? "*" : ""})`;
  const teamSegment = state.teamId ?? "no-team";
  const focusedSegment = focusedAgent === null ? "—" : focusedAgent.agentKey;
  const rightIdentity = `${teamSegment}:${focusedSegment}`;
  const hint = state.showTeamRailPanel ? HINT_VISIBLE : HINT_HIDDEN;
  const modelSegment = modelSegmentText(focusedAgent);

  return (
    <Box flexDirection="column" width="100%">
      <Box flexDirection="row" justifyContent="space-between" width="100%">
        <Text color={pickColor("accent")}>{leftIdentity}</Text>
        <Text color={pickColor("muted")}>{rightIdentity}</Text>
      </Box>
      <Box flexDirection="row" width="100%">
        <Text color={pickColor("muted")}>0%/200k  {hint.padEnd(40, " ")}</Text>
        <Box flexGrow={1} />
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
