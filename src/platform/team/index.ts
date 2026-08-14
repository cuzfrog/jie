export type { AgentSoul, TeamBlueprint, TeamBlueprintLocation } from "./types";
export { BUILTIN_SETUP_ASSISTANT_TEAM_ID } from "./types";
export type { AgentRegistry } from "./agent-registry";
export { type TeamManager } from "./team-manager";
export { registerTeamModule } from "./module";
export { loadSetupAssistantTeam, loadTeamFromDir, parseAgentManifest } from "./parser";
