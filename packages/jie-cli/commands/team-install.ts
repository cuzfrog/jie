import { join } from "node:path";
import { createTeamInstaller } from "@cuzfrog/jie-team-installer";
import { type Console } from "@cuzfrog/jie-utils";
import type { ParsedArgsMap } from "../cli-flags";

export async function runTeamInstall(
  args: ParsedArgsMap["team"],
  homeJieDir: string,
  projectJieDir: string | null,
  console: Console,
): Promise<number> {
  if (args.action !== "add" && args.action !== "remove") return 1;
  const teamsDir = resolveTeamsDir(args.project, homeJieDir, projectJieDir);
  if (teamsDir === null) {
    console.error("no project .jie directory found; run from within a project or omit --project");
    return 1;
  }
  const installer = createTeamInstaller();
  try {
    if (args.action === "add") {
      const installed = await installer.install(args.source, teamsDir, { force: args.force });
      console.print(`installed team: ${installed.join(", ")}`);
      console.print(`location: ${teamsDir}`);
      return 0;
    }
    installer.remove(args.teamId, teamsDir);
    console.print(`removed team '${args.teamId}' from ${teamsDir}`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function resolveTeamsDir(project: boolean, homeJieDir: string, projectJieDir: string | null): string | null {
  if (project) return projectJieDir === null ? null : join(projectJieDir, "teams");
  return join(homeJieDir, "teams");
}
