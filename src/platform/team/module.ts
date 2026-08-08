import { asClass, type AwilixContainer } from "awilix";
import type { PlatformCradle } from "../container";
import { TeamManagerImpl } from "./team-manager";

export function registerTeamModule(container: AwilixContainer<PlatformCradle>): void {
  container.register({
    teamManager: asClass(TeamManagerImpl).singleton(),
  });
}
