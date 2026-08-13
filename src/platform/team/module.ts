import { asClass, type AwilixContainer } from "awilix";
import type { PlatformCradle } from "../container";
import { AgentRegistryImpl } from "./agent-registry";
import { AgentDispatcherImpl } from "./agent-dispatcher";
import { TeamRegistryImpl } from "./registry";
import { TeamManagerImpl } from "./team-manager";

export function registerTeamModule(container: AwilixContainer<PlatformCradle>): void {
  container.register({
    agentRegistry: asClass(AgentRegistryImpl).singleton(),
    teamRegistry: asClass(TeamRegistryImpl).singleton(),
    teamManager: asClass(TeamManagerImpl).singleton(),
    agentDispatcher: asClass(AgentDispatcherImpl).singleton(),
  });
}
