import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { isValidTeamId, loadMinimalTeam, loadTeamFromDir } from "./loader.ts";
import type { Team } from "./types.ts";

/** Internal id of the built-in minimal team. The literal is a
 *  private detail of the registry; external modules reach the
 *  minimal team only via `loadTeam(undefined)` (or via
 *  `settings.defaultTeam` being set to this string, which the
 *  registry also recognizes for backward compatibility with
 *  pre-registry settings files). */
const BUILTIN_MINIMAL_TEAM_ID = "minimal";

/** Walks up from `cwd` looking for a `.jie/` directory. Returns the
 *  directory containing `.jie/`, or `null` if none is found before
 *  the filesystem root. The project teams directory is
 *  `<projectRoot>/.jie/teams/`. */
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
  /** The user's current working directory. Used to locate the
   *  project teams dir by walking up to find `.jie/`. */
  workspace: string;

  /** The user's home jie dir (e.g. `~/.jie/`). A runtime constant
   *  injected at startup, never derived from `os.homedir()` inside
   *  the team module. The user teams dir is `<homeJieDir>/teams/`. */
  homeJieDir: string;
}

export interface TeamRegistry {
  /** Load a team by id. The minimal team is the fallback when
   *  `teamId` is `undefined` (no team specified) or matches the
   *  built-in id. Otherwise searches project scope first, then
   *  user scope. Throws when the id is not found in any scope.
   *  Charset validation runs at parse time inside the loader —
   *  an invalid id never reaches the runtime because the loader
   *  rejects the directory basename. */
  loadTeam(teamId?: string): Team;

  /** Whether a team is installed. The minimal team is always
   *  reported as installed. */
  isInstalled(teamId: string): boolean;

  /** List installed team ids (project + user + minimal), sorted
   *  alphabetically, deduped, with hidden (dot-prefixed)
   *  directories filtered. */
  listInstalled(): string[];

  /** Locate a team. The minimal team returns `"user"` — it's
   *  shipped with the platform, not in any project or user dir,
   *  but the settings store treats the global scope as its
   *  write target for `defaultTeam = "minimal"`. */
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
