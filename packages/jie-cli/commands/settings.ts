
import { getProviders } from "@earendil-works/pi-ai";
import type { MergedSettings } from "@cuzfrog/jie-platform/config";
import type { SettingsStore } from "@cuzfrog/jie-platform/config";
import type { TeamRegistry } from "@cuzfrog/jie-platform/team";
import type { ParsedArgsMap } from "../cli-flags";

export async function runModel(
  parsed: ParsedArgsMap["model"],
  projectJieDir: string | null,
  settings: SettingsStore,
): Promise<number> {
  const known = new Set<string>(getProviders() as readonly string[]);
  if (!known.has(parsed.provider)) {
    console.error(`unknown provider: ${parsed.provider}`);
  }
  const existing = settings.load();
  const next: MergedSettings = {
    ...existing,
    defaultProvider: parsed.provider,
    defaultModel: parsed.modelId,
  };
  const scope: "project" | "global" =
    projectJieDir !== null ? "project" : "global";
  settings.write(next, scope);
  console.log(`default model set to ${parsed.provider}/${parsed.modelId}`);
  return 0;
}

export async function runTeam(
  parsed: ParsedArgsMap["team"],
  settings: SettingsStore,
  teamRegistry: TeamRegistry,
): Promise<number> {
  if (parsed.teamId === undefined && !parsed.unset) {
    const merged = settings.load();
    const installed = teamRegistry.listInstalled();
    console.log(`defaultTeam: ${merged.defaultTeam ?? "unset"}`);
    console.log(`installed: ${installed.join(", ")}`);
    return 0;
  }
  if (parsed.unset) {
    settings.unsetDefaultTeam();
    console.log("default team unset");
    return 0;
  }
  const id = parsed.teamId!;
  if (!teamRegistry.isInstalled(id)) {
    console.error(
      `team '${id}' is not installed; checked .jie/teams/${id}/ and ~/.jie/teams/${id}/`,
    );
    return 1;
  }
  const existing = settings.load();
  const next: MergedSettings = { ...existing, defaultTeam: id };
  const loc = teamRegistry.locate(id);
  settings.write(next, loc === "project" ? "project" : "global");
  console.log(`default team set to ${id}`);
  return 0;
}
