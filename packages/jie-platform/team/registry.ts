import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { isValidTeamId, loadMinimalTeam, loadTeamFromDir } from "./parser";
import { JiePlatformError } from "../jie-platform-errors";
import { BUILTIN_MINIMAL_TEAM_ID, type TeamBlueprint, type TeamBlueprintLocation } from "./types";

export interface TeamRegistryOptions {
  readonly homeJieDir: string;
  readonly projectJieDir: string | null;
}

export interface TeamRegistry {
  parseTeamManifest(teamId?: string): TeamBlueprint;
  listInstalled(): string[];
  locate(teamId: string): TeamBlueprintLocation;
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

  function parseFromDir(dir: string): TeamBlueprint {
    const blueprint = loadTeamFromDir(dir);
    return blueprint.roles.length === 0 ? loadMinimalTeam() : blueprint;
  }

  return {
    parseTeamManifest(teamId) {
      if (teamId === undefined || isMinimal(teamId)) {
        return loadMinimalTeam();
      }
      if (!isValidTeamId(teamId)) {
        throw new JiePlatformError("INVALID_TEAM_ID", { detail: `invalid team_id: ${teamId}` });
      }
      const projectDir = projectTeamsDir();
      if (projectDir !== null && isProjectTeam(teamId)) {
        return parseFromDir(join(projectDir, teamId));
      }
      if (isUserTeam(teamId)) {
        return parseFromDir(join(userTeamsDir, teamId));
      }
      throw new JiePlatformError("TEAM_NOT_FOUND", { detail: `team '${teamId}' not found` });
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
      if (isMinimal(id)) return "builtin";
      if (isProjectTeam(id)) return "project";
      if (isUserTeam(id)) return "user";
      return null;
    },
  };
}
