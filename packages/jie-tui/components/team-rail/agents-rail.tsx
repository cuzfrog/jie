import { Box, Text } from "ink";
import type { AgentUiState } from "../../state";
import { useTuiContext } from "../context";
import { RAIL_ERROR_GLYPH, RAIL_IDLE_GLYPH, RAIL_LEADER_GLYPH, pickColor } from "../themes";

interface AgentsRailProps {
  readonly width: number;
}

interface RailRow {
  readonly agent: AgentUiState;
  readonly isLeader: boolean;
}

export function AgentsRail({ width }: AgentsRailProps): JSX.Element {
  const { state } = useTuiContext();
  const agents = Array.from(state.agents.values());
  const rows = buildRows(agents, state.leaderAgentId);
  return (
    <Box flexDirection="column" width={width} borderStyle="single" borderColor="gray" paddingX={1}>
      {rows.map((row, i) => (
        <Box key={row.agent.agentId} flexDirection="row">
          <Text color={row.isLeader ? pickColor("accent") : pickColor("text")}>
            {row.isLeader ? RAIL_LEADER_GLYPH : " "}{" "}
          </Text>
          <Text color={statusColor(row.agent)}>{statusGlyph(row.agent)} </Text>
          <Text color={pickColor("text")}>{truncate(row.agent.role, width - 6)}</Text>
          {i < rows.length - 1 ? <Text> </Text> : null}
        </Box>
      ))}
    </Box>
  );
}

function buildRows(agents: ReadonlyArray<AgentUiState>, leaderId: string | null): ReadonlyArray<RailRow> {
  const leader = agents.find((a) => a.agentId === leaderId);
  const others = agents.filter((a) => a.agentId !== leaderId);
  const ordered = leader === undefined ? others : [leader, ...others];
  return ordered.map((agent) => ({ agent, isLeader: agent.isLeader }));
}

function statusGlyph(agent: AgentUiState): string {
  if (agent.lastStopReason === "error") return RAIL_ERROR_GLYPH;
  if (agent.status === "busy") return "⠋";
  return RAIL_IDLE_GLYPH;
}

function statusColor(agent: AgentUiState): string {
  if (agent.lastStopReason === "error") return pickColor("error");
  if (agent.status === "busy") return pickColor("accent");
  return pickColor("muted");
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`;
}