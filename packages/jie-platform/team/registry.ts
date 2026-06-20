import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { isValidTeamId, loadMinimalTeam, loadTeamFromDir } from "./loader.ts";
import type { Team } from "./types.ts";

const BUILTIN_MINIMAL_TEAM_ID = "minimal";

function findProjectRoot(cwd: string): string | null {
  let current = cwd;
  for (;;) {
    if (existsSync(join(current, ".jie"))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export interface TeamRegistryOptions {

  workspace: string;

  homeJieDir: string;
}

export interface TeamRegistry {

  loadTeam(teamId?: string): Team;

  isInstalled(teamId: string): boolean;

  listInstalled(): string[];

  locate(teamId: string): "project" | "user" | "missing";
}

export function createTeamRegistry(opts: TeamRegistryOptions): TeamRegistry {
  const { workspace, homeJieDir } = opts;
  const userTeamsDir = join(homeJieDir, "teams");

  function projectTeamsDir(): string | null {
    const root = findProjectRoot(workspace);
    return root === null ? null : join(root, ".jie", "teams");
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
        throw new Error(`invalid team_id: ${teamId}`);
      }
      const projectDir = projectTeamsDir();
      if (projectDir !== null && existsSync(join(projectDir, teamId, "TEAM.md"))) {
        return loadTeamFromDir(join(projectDir, teamId));
      }
      if (isUserTeam(teamId)) {
        return loadTeamFromDir(join(userTeamsDir, teamId));
      }
      throw new Error(`team '${teamId}' not found`);
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
