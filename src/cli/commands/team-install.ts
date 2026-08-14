import { createManifestInstaller } from "../../manifest/installer";
import { type Console } from "../../utils";
import { createManifestValidator } from "../manifest-validator";
import type { ParsedArgsMap } from "../cli-flags";

export async function runTeamInstall(
  args: ParsedArgsMap["team"],
  homeJieDir: string,
  projectJieDir: string | null,
  console: Console,
): Promise<number> {
  if (args.action !== "add" && args.action !== "remove") return 1;
  const jieDir = resolveJieDir(args.project, homeJieDir, projectJieDir);
  if (jieDir === null) {
    console.error("no project .jie directory found; run from within a project or omit --project");
    return 1;
  }
  const installer = createManifestInstaller(undefined, createManifestValidator());
  try {
    if (args.action === "add") {
      const result = await installer.install(args.source, jieDir, { force: args.force });
      if (result.teams.length > 0) console.print(`installed team: ${result.teams.join(", ")}`);
      if (result.agents.length > 0) console.print(`installed shared agents: ${result.agents.join(", ")}`);
      console.print(`location: ${jieDir}`);
      return 0;
    }
    installer.remove(args.teamId, jieDir);
    console.print(`removed team '${args.teamId}' from ${jieDir}`);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

function resolveJieDir(project: boolean, homeJieDir: string, projectJieDir: string | null): string | null {
  if (project) return projectJieDir;
  return homeJieDir;
}
