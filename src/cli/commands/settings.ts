import { JiePlatformError, type JiePlatform, type TeamBlueprintLocation } from "../../platform";
import { createManifestInstaller, type ManifestProvenance } from "../../manifest/installer";
import { type Console } from "../../utils";
import type { ParsedArgsMap } from "../cli-flags";

export async function runModel(
  parsed: ParsedArgsMap["model"],
  platform: JiePlatform,
  console: Console,
): Promise<number> {
  if ("action" in parsed) {
    const result = await platform.execute({ name: "refreshModels" });
    if (result.errors.length > 0) {
      for (const error of result.errors) console.error(`model catalog refresh failed: ${error}`);
      return 1;
    }
    console.print("model catalogs updated");
    return 0;
  }
  try {
    await platform.execute({ name: "setDefaultModel", provider: parsed.provider, id: parsed.modelId });
  } catch (error) {
    if (error instanceof JiePlatformError && error.code === "UNKNOWN_PROVIDER") {
      console.error(`unknown provider: ${parsed.provider}`);
      return 1;
    }
    throw error;
  }
  console.print(`default model set to ${parsed.provider}/${parsed.modelId}`);
  return 0;
}

export async function runTeam(
  parsed: ParsedArgsMap["team"],
  platform: JiePlatform,
  homeJieDir: string,
  projectJieDir: string | null,
  console: Console,
): Promise<number> {
  switch (parsed.action) {
    case "info":
      return runTeamInfo(platform, console);
    case "setDefault":
      return runSetDefaultTeam(parsed.teamId, platform, console);
    case "list":
      return runTeamList(platform, homeJieDir, projectJieDir, console);
    default:
      return 1;
  }
}

async function runTeamInfo(platform: JiePlatform, console: Console): Promise<number> {
  const info = await platform.execute({ name: "getTeamInfo" });
  console.print(`defaultTeam: ${info.defaultTeam ?? "unset"}`);
  console.print(`installed: ${info.installed.map((team) => team.id).join(", ")}`);
  return 0;
}

async function runSetDefaultTeam(teamId: string, platform: JiePlatform, console: Console): Promise<number> {
  try {
    await platform.execute({ name: "setDefaultTeam", teamId });
  } catch (error) {
    if (error instanceof JiePlatformError && error.code === "TEAM_NOT_FOUND") {
      console.error(
        `team '${teamId}' is not installed; checked .jie/teams/${teamId}/ and ~/.jie/teams/${teamId}/`,
      );
      return 1;
    }
    throw error;
  }
  console.print(`default team set to '${teamId}'`);
  return 0;
}

async function runTeamList(
  platform: JiePlatform,
  homeJieDir: string,
  projectJieDir: string | null,
  console: Console,
): Promise<number> {
  const info = await platform.execute({ name: "getTeamInfo" });
  const installer = createManifestInstaller();
  const width = info.installed.length === 0 ? 0 : Math.max(...info.installed.map((team) => team.id.length));
  console.print("Teams:");
  for (const team of info.installed) {
    const marker = team.id === info.defaultTeam ? "*" : " ";
    const provenance = readProvenanceForLocation(installer, team.id, team.location, homeJieDir, projectJieDir);
    const source = provenance === null ? "" : `  ${formatProvenance(provenance)}`;
    const agents = team.agentCount === 1 ? "1 agent" : `${team.agentCount} agents`;
    console.print(`${marker} ${team.id.padEnd(width)}  [${team.location ?? "?"}]  ${agents}${source}`);
  }
  if (info.sharedAgents.length > 0) {
    const agentWidth = Math.max(...info.sharedAgents.map((agent) => agent.id.length));
    console.print("Shared agents:");
    for (const agent of info.sharedAgents) {
      console.print(`  ${agent.id.padEnd(agentWidth)}  [${agent.location ?? "?"}]`);
    }
  }
  return 0;
}

function readProvenanceForLocation(
  installer: ReturnType<typeof createManifestInstaller>,
  teamId: string,
  location: TeamBlueprintLocation,
  homeJieDir: string,
  projectJieDir: string | null,
): ManifestProvenance | null {
  const jieDir = jieDirForLocation(location, homeJieDir, projectJieDir);
  return jieDir === null ? null : installer.readProvenance(teamId, jieDir);
}

function jieDirForLocation(
  location: TeamBlueprintLocation,
  homeJieDir: string,
  projectJieDir: string | null,
): string | null {
  switch (location) {
    case "project":
      return projectJieDir;
    case "user":
      return homeJieDir;
    default:
      return null;
  }
}

function formatProvenance(provenance: ManifestProvenance): string {
  return `(${provenance.source.kind}: ${provenance.spec})`;
}
