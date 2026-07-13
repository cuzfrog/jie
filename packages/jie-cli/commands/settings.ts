import { JiePlatformError, defaultConsole, type Console, type JiePlatform } from "@cuzfrog/jie-platform";
import type { ParsedArgsMap } from "../cli-flags";

export async function runModel(
  parsed: ParsedArgsMap["model"],
  platform: JiePlatform,
  console: Console = defaultConsole,
): Promise<number> {
  try {
    await platform.execute({ name: "setDefaultModel", provider: parsed.provider, id: parsed.modelId, effort: "off", contextWindow: null });
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
  console: Console = defaultConsole,
): Promise<number> {
  if (parsed.teamId === undefined) {
    const info = await platform.execute({ name: "getTeamInfo" });
    console.print(`defaultTeam: ${info.defaultTeam ?? "unset"}`);
    console.print(`installed: ${info.installed.join(", ")}`);
    return 0;
  }
  const teamId = parsed.teamId;
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
