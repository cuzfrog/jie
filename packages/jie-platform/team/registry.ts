import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isValidTeamId, loadMinimalTeam, loadTeamFromDir } from "./loader";
import { JiePlatformError } from "../domain-types";
import type { Team } from "./types";

const BUILTIN_MINIMAL_TEAM_ID = "minimal";

export interface TeamRegistryOptions {

  homeJieDir: string;

  projectJieDir: string | null;
}

export interface TeamRegistry {

  loadTeam(teamId?: string): Team;

  isInstalled(teamId: string): boolean;

  listInstalled(): string[];

  locate(teamId: string): "project" | "user" | "missing";
}

export function createTeamRegistry(options: TeamRegistryOptions): TeamRegistry {
  const { homeJieDir, projectJieDir } = options;
  const userTeamsDir = join(homeJieDir, "teams");

  function projectTeamsDir(): string | null {
    return projectJieDir === null ? null : join(projectJieDir, "teams");
  }

  function isMinimal(id: string): boolean {
    return id === BUILTIN_MINIMAL_TEAM_ID;
  }
  function isProjectTeam(id: string): boolean {
    const dir = projectTeamsDir();
    return dir !== null && existsSync(join(dir, id, "TEAM.md"));
  }
  function isUserTeam(id: string): boolean {
    return existsSync(join(userTeamsDir, id, "TEAM.md"));
  }

  return {
    loadTeam(teamId) {
      if (teamId === undefined || isMinimal(teamId)) {
        return loadMinimalTeam();
      }
      if (!isValidTeamId(teamId)) {
        throw new JiePlatformError("invalid_team_id", `invalid team_id: ${teamId}`);
      }
      const projectDir = projectTeamsDir();
      if (projectDir !== null && existsSync(join(projectDir, teamId, "TEAM.md"))) {
        return loadTeamFromDir(join(projectDir, teamId));
      }
      if (isUserTeam(teamId)) {
        return loadTeamFromDir(join(userTeamsDir, teamId));
      }
      throw new JiePlatformError("team_not_found", `team '${teamId}' not found`);
    },
    isInstalled(id) {
      return isMinimal(id) || isProjectTeam(id) || isUserTeam(id);
    },
    listInstalled() {
      const ids = new Set<string>();
      ids.add(BUILTIN_MINIMAL_TEAM_ID);
      for (const dir of [projectTeamsDir(), userTeamsDir]) {
        if (dir === null) continue;
        let entries: string[];
        try {
          entries = readdirSync(dir);
        } catch {
          continue;
        }
        for (const entry of entries) {
          if (entry.startsWith(".")) continue;
          if (existsSync(join(dir, entry, "TEAM.md"))) ids.add(entry);
        }
      }
      return [...ids].sort();
    },
    locate(id) {
      if (isMinimal(id)) return "user";
      if (isProjectTeam(id)) return "project";
      if (isUserTeam(id)) return "user";
      return "missing";
    },
  };
}
