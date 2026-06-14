export type {
  MergedSettings,
  RawSettings,
  AuthEntry,
  AuthJson,
  McpTransport,
  McpServerConfig,
  McpConfig,
} from "./types.ts";
export {
  homeJieDir,
  globalSettingsPath,
  globalAuthPath,
  globalTeamsDir,
  findProjectJieRoot,
  projectSettingsPath,
  projectTeamsDir,
} from "./paths.ts";
export {
  loadMergedSettings,
  validateSettings,
  deepMergeSettings,
  isValidTeamId,
} from "./load-settings.ts";
export { loadAuthJson } from "./load-auth.ts";
export {
  resolveStaleDefaultTeam,
  isTeamInstalled,
  listInstalledTeams,
} from "./resolve-stale-team.ts";