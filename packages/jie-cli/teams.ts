/** Team discovery.
 *
 *  The platform's built-in minimal team (`BUILTIN_MINIMAL_TEAM_ID`)
 *  is always available — the CLI passes it to `startJie` and the
 *  platform's loader resolves it from its built-in `.md` files.
 *  User-installed teams live under `{project}/.jie/teams/<id>/`
 *  or `~/.jie/teams/<id>/`, each with a `TEAM.md` manifest.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { findProjectJieRoot, homeJieDir } from "@cuzfrog/jie-platform";

export const BUILTIN_MINIMAL_TEAM_ID = "minimal";

export interface TeamsRepo {
  isInstalled(teamId: string, cwd: string): boolean;
  listInstalled(cwd: string): string[];
  /** Where the team is installed. The built-in minimal team is
   *  always reported as `"global"` (the platform resolves it from
   *  its built-in `.md` files, not from `~/.jie/teams/`). */
  locate(teamId: string, cwd: string): "project" | "global" | "missing";
}

export function makeTeamsRepo(homeDir: string): TeamsRepo {
  return {
    isInstalled(teamId, cwd) {
      return this.locate(teamId, cwd) !== "missing";
    },
    locate(teamId, cwd) {
      if (teamId === BUILTIN_MINIMAL_TEAM_ID) return "global";
      const root = findProjectJieRoot(cwd);
      if (root !== null && existsSync(join(root, ".jie", "teams", teamId, "TEAM.md"))) {
        return "project";
      }
      if (existsSync(join(homeJieDir(homeDir), "teams", teamId, "TEAM.md"))) {
        return "global";
      }
      return "missing";
    },
    listInstalled(cwd) {
      const root = findProjectJieRoot(cwd);
      const candidates: Array<string | null> = [
        root === null ? null : join(root, ".jie", "teams"),
        join(homeJieDir(homeDir), "teams"),
      ];
      const seen = new Set<string>();
      for (const dir of candidates) {
        if (dir === null || !existsSync(dir)) continue;
        for (const entry of readdirSync(dir)) {
          if (entry.startsWith(".")) continue;
          if (!existsSync(join(dir, entry, "TEAM.md"))) continue;
          seen.add(entry);
        }
      }
      seen.add(BUILTIN_MINIMAL_TEAM_ID);
      return [...seen].sort();
    },
  };
}
