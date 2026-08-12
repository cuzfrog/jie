import { asClass, type AwilixContainer } from "awilix";
import type { PlatformCradle } from "../container";
import { TeamRegistryImpl } from "./registry";
import { TeamManagerImpl } from "./team-manager";

export function registerTeamModule(container: AwilixContainer<PlatformCradle>): void {
  container.register({
    teamRegistry: asClass(TeamRegistryImpl).singleton(),
    teamManager: asClass(TeamManagerImpl).singleton(),
  });
}
