import { Box, Text } from "@cuzfrog/jie-ink";
import type { JSX } from "react";
import type { AgentUiState } from "../../state";
import { useTuiContext } from "../context";
import { RAIL_ERROR_GLYPH, RAIL_IDLE_GLYPH, RAIL_LEADER_GLYPH, pickColor } from "../themes";
import { Spinner } from "../spinner";

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
    <Box flexDirection="column" width={width} height="100%" justifyContent="center">
      {rows.map((row) => (
        <Box key={row.agent.agentId} flexDirection="row">
          <Text color={row.isLeader ? pickColor("accent") : pickColor("text")}>
            {row.isLeader ? RAIL_LEADER_GLYPH : " "}{" "}
          </Text>
          <StatusCell agent={row.agent} />
          <Text color={pickColor("text")}>{truncate(row.agent.role, width - 4)}</Text>
        </Box>
      ))}
    </Box>
  );
}

function StatusCell({ agent }: { readonly agent: AgentUiState }): JSX.Element {
  if (agent.lastStopReason === "error") {
    return <Text color={pickColor("error")}>{RAIL_ERROR_GLYPH} </Text>;
  }
  if (agent.status === "busy") {
    return (
      <Box>
        <Spinner />
        <Text> </Text>
      </Box>
    );
  }
  return <Text color={pickColor("muted")}>{RAIL_IDLE_GLYPH} </Text>;
}

function buildRows(agents: ReadonlyArray<AgentUiState>, leaderId: string | null): ReadonlyArray<RailRow> {
  const leader = agents.find((a) => a.agentId === leaderId);
  const others = agents.filter((a) => a.agentId !== leaderId);
  const ordered = leader === undefined ? others : [leader, ...others];
  return ordered.map((agent) => ({ agent, isLeader: agent.isLeader }));
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`;
}