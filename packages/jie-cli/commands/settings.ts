/** `model` and `team` subcommands — write to settings.json.
 *
 *  `model` sets `defaultProvider` + `defaultModel`. The write
 *  scope is "project" if `.jie/` is found walking up from `cwd`,
 *  else "global".
 *
 *  `team` sets / unsets `defaultTeam`. Setter validates the team
 *  id against `[A-Za-z0-9_-]{1,32}` and against the registry's
 *  `isInstalled`. The write scope is "project" if the registry
 *  reports the team as project-scoped, else "global" (including
 *  the built-in minimal team, which the registry reports as
 *  user-scoped).
 */
import { getProviders } from "@earendil-works/pi-ai";
import { findProjectJieRoot, type MergedSettings } from "@cuzfrog/jie-platform";
import type { SettingsStore } from "@cuzfrog/jie-platform/config";
import type { TeamRegistry } from "@cuzfrog/jie-platform/team";
import type { ParsedCli } from "../index.ts";

function projectScope(cwd: string): boolean {
  return findProjectJieRoot(cwd) !== null;
}

export async function runModel(
  parsed: Extract<ParsedCli, { kind: "model" }>,
  cwd: string,
  settings: SettingsStore,
): Promise<number> {
  const known = new Set<string>(getProviders() as readonly string[]);
  if (!known.has(parsed.provider)) {
    console.error(`unknown provider: ${parsed.provider}`);
  }
  const existing = settings.load(cwd);
  const next: MergedSettings = {
    ...existing,
    defaultProvider: parsed.provider,
    defaultModel: parsed.modelId,
  };
  settings.write(next, projectScope(cwd) ? "project" : "global", cwd);
  console.log(`default model set to ${parsed.provider}/${parsed.modelId}`);
  return 0;
}

export async function runTeam(
  parsed: Extract<ParsedCli, { kind: "team" }>,
  cwd: string,
  settings: SettingsStore,
  teamRegistry: TeamRegistry,
): Promise<number> {
  if (parsed.teamId === undefined && !parsed.unset) {
    const merged = settings.load(cwd);
    const installed = teamRegistry.listInstalled();
    console.log(`defaultTeam: ${merged.defaultTeam ?? "unset"}`);
    console.log(`installed: ${installed.join(", ")}`);
    return 0;
  }
  if (parsed.unset) {
    settings.unsetDefaultTeam(cwd);
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
  const existing = settings.load(cwd);
  const next: MergedSettings = { ...existing, defaultTeam: id };
  // Project location wins on per-team-id collision per the spec.
  const loc = teamRegistry.locate(id);
  settings.write(next, loc === "project" ? "project" : "global", cwd);
  console.log(`default team set to ${id}`);
  return 0;
}
