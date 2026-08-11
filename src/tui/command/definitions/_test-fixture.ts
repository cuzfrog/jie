import type { JiePlatform } from "../../../platform";
import type { TuiState } from "../../state";
import { makeAgentUiState, makeTuiState } from "../../test";

export function makePlatform(execute: JiePlatform["execute"] = async () => null): JiePlatform {
  return {
    settings: {},
    subscribe: () => () => undefined,
    prompt: () => undefined,
    interrupt: () => undefined,
    dequeuePrompt: () => undefined,
    requeuePrompt: () => undefined,
    execute,
    teams: () => [],
    shutdown: () => Promise.resolve(),
  };
}

export function teamState(teamId = "t1", status: "idle" | "busy" = "idle"): TuiState {
  const agent = makeAgentUiState(`${teamId}:general-1`, { isLeader: true, status });
  return makeTuiState({
    teamId,
    leaderAgentId: agent.agentId,
    focusedAgentId: agent.agentId,
    agents: new Map([[agent.agentId, agent]]),
  });
}
