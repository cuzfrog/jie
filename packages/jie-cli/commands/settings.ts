import { JiePlatformError, type JiePlatform } from "@cuzfrog/jie-platform";
import type { ParsedArgsMap } from "../cli-flags";

export async function runModel(
  parsed: ParsedArgsMap["model"],
  platform: JiePlatform,
): Promise<number> {
  try {
    await platform.execute({ name: "setDefaultModel", provider: parsed.provider, modelId: parsed.modelId });
  } catch (error) {
    if (error instanceof JiePlatformError && error.code === "UNKNOWN_PROVIDER") {
      console.error(`unknown provider: ${parsed.provider}`);
      return 1;
    }
    throw error;
  }
  console.log(`default model set to ${parsed.provider}/${parsed.modelId}`);
  return 0;
}

export async function runTeam(
  parsed: ParsedArgsMap["team"],
  platform: JiePlatform,
): Promise<number> {
  if (parsed.teamId === undefined && !parsed.unset) {
    const info = await platform.execute({ name: "getTeamInfo" });
    console.log(`defaultTeam: ${info.defaultTeam ?? "unset"}`);
    console.log(`installed: ${info.installed.join(", ")}`);
    return 0;
  }
  if (parsed.unset) {
    await platform.execute({ name: "unsetDefaultTeam" });
    console.log("default team unset");
    return 0;
  }
  const teamId = parsed.teamId!;
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
  console.log(`default team set to '${teamId}'`);
  return 0;
}
